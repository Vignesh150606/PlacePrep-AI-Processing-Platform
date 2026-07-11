"""
Quiz attempt persistence (Module 2/3 -- Quiz Engine + Submission) and the
Wrong Answer Notebook (Module 4).

PHASE 6 FIX -- confirmed N+1 + race condition in `submit_attempt`:
The prior version looped over every response and, per response, did a
SELECT of `times_attempted`/`times_correct` followed by an UPDATE with the
incremented values, plus a similar SELECT-then-upsert for
`wrong_answer_marks`. Two real problems, not just a style nit:
  1. Performance: an N-question quiz did up to 3N sequential DB round
     trips in `submit_attempt` alone.
  2. Correctness: the SELECT-then-UPDATE pattern is a classic
     read-modify-write race. Two submissions touching the same question
     at nearly the same time (plausible: the same question appears in two
     different students' quizzes, submitted seconds apart) could both read
     the same `times_attempted`, both compute `old + 1`, and the second
     write clobbers the first -- silently losing an attempt count.
Fixed by a new `bulk_increment_question_stats` Postgres function (migration
0006) that does the increment atomically, in the database, for an entire
array of questions in one round trip (`... SET times_attempted =
times_attempted + x.answered FROM unnest(...) x ...` -- see the migration
for the exact SQL), and by batching the wrong-answer-marks upsert into one
multi-row `.upsert()` call instead of N.

PHASE 6 ADDITION: `GET /trend` -- server-aggregated score-over-time data,
so `PracticeTrendChart` on the frontend can eventually stop pulling every
attempt down and reducing client-side as attempt history grows (see
FUNCTIONAL_RECOMMENDATIONS.md from the UI/UX pass, item #4). The frontend
switch-over itself is left to whichever session owns `client/`.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.rate_limit import quiz_submit_limit
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class QuestionResponseModel(CamelModel):
    question_id: str
    selected_option_ids: List[str] = []
    is_correct: bool = False
    time_spent_seconds: int = 0
    was_skipped: bool = True
    marked_for_review: bool = False


class QuizAttemptStartRequest(CamelModel):
    mode: str
    topic: Optional[str] = None
    company_id: Optional[str] = None
    difficulty: str = "mixed"
    question_ids: List[str]
    time_limit_minutes: Optional[int] = None


class QuizAttemptSubmitRequest(CamelModel):
    responses: List[QuestionResponseModel]
    time_taken_seconds: int


class QuizAttemptResponse(CamelModel):
    id: str
    quiz_id: Optional[str] = None
    user_id: str
    status: str
    mode: str
    topic: Optional[str] = None
    company_id: Optional[str] = None
    difficulty: str
    question_ids: List[str]
    responses: List[Dict[str, Any]]
    score: float
    total_questions: int
    correct_count: int
    wrong_count: int
    skipped_count: int
    time_limit_minutes: Optional[int] = None
    time_taken_seconds: int
    started_at: str
    completed_at: Optional[str] = None


class QuizAttemptListResponse(CamelModel):
    items: List[QuizAttemptResponse]


class TrendPoint(CamelModel):
    date: str
    score: float
    attempt_id: str


class TrendResponse(CamelModel):
    points: List[TrendPoint]


def _row_to_response(row: Dict[str, Any]) -> QuizAttemptResponse:
    return QuizAttemptResponse(
        id=row["id"],
        quiz_id=None,
        user_id=row["user_id"],
        status=row["status"],
        mode=row["mode"],
        topic=row.get("topic"),
        company_id=row.get("company_id"),
        difficulty=row.get("difficulty") or "mixed",
        question_ids=row.get("question_ids") or [],
        responses=row.get("responses") or [],
        score=float(row.get("score") or 0),
        total_questions=row.get("total_questions") or 0,
        correct_count=row.get("correct_count") or 0,
        wrong_count=row.get("wrong_count") or 0,
        skipped_count=row.get("skipped_count") or 0,
        time_limit_minutes=row.get("time_limit_minutes"),
        time_taken_seconds=row.get("time_taken_seconds") or 0,
        started_at=row["started_at"],
        completed_at=row.get("completed_at"),
    )


@router.get("/attempts", response_model=ApiResponse[QuizAttemptListResponse])
async def list_attempts(current_user: CurrentUser = Depends(get_current_user)):
    rows = (
        get_supabase_admin()
        .table("quiz_attempts")
        .select("*")
        .eq("user_id", current_user.id)
        .order("started_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    return ok(data=QuizAttemptListResponse(items=[_row_to_response(r) for r in rows]), message="Attempts fetched.")


@router.get("/trend", response_model=ApiResponse[TrendResponse])
async def get_trend(
    current_user: CurrentUser = Depends(get_current_user),
    limit: int = Query(30, ge=1, le=200),
):
    """Server-aggregated score-over-time -- see module docstring."""
    rows = (
        get_supabase_admin()
        .table("quiz_attempts")
        .select("id, score, completed_at")
        .eq("user_id", current_user.id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    points = [
        TrendPoint(date=row["completed_at"], score=float(row.get("score") or 0), attempt_id=row["id"])
        for row in rows
        if row.get("completed_at")
    ]
    points.reverse()  # oldest -> newest, matching a left-to-right chart
    return ok(data=TrendResponse(points=points), message="Trend fetched.")


@router.get("/attempts/in-progress", response_model=ApiResponse[Optional[QuizAttemptResponse]])
async def get_in_progress_attempt(current_user: CurrentUser = Depends(get_current_user)):
    rows = (
        get_supabase_admin()
        .table("quiz_attempts")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("status", "in-progress")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return ok(data=_row_to_response(rows[0]) if rows else None, message="In-progress attempt fetched.")


@router.post("/attempts", response_model=ApiResponse[QuizAttemptResponse])
async def start_attempt(payload: QuizAttemptStartRequest, current_user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()

    admin.table("quiz_attempts").update({"status": "abandoned"}).eq("user_id", current_user.id).eq(
        "status", "in-progress"
    ).execute()

    row = (
        admin.table("quiz_attempts")
        .insert(
            {
                "user_id": current_user.id,
                "status": "in-progress",
                "mode": payload.mode,
                "topic": payload.topic,
                "company_id": payload.company_id,
                "difficulty": payload.difficulty,
                "question_ids": payload.question_ids,
                "responses": [],
                "total_questions": len(payload.question_ids),
                "time_limit_minutes": payload.time_limit_minutes,
                "started_at": _now_iso(),
            }
        )
        .execute()
        .data[0]
    )
    return ok(data=_row_to_response(row), message="Quiz started.")


def _get_attempt_or_404(attempt_id: str, user_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin()
            .table("quiz_attempts")
            .select("*")
            .eq("id", attempt_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Quiz attempt not found.")
        raise
    row = result.data
    if row["user_id"] != user_id:
        raise ForbiddenError("This isn't your quiz attempt.")
    return row


@router.post("/attempts/{attempt_id}/submit", response_model=ApiResponse[QuizAttemptResponse])
@quiz_submit_limit()
async def submit_attempt(
    request: Request,  # required by slowapi's decorator to read the client IP
    attempt_id: str,
    payload: QuizAttemptSubmitRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    admin = get_supabase_admin()
    attempt_row = _get_attempt_or_404(attempt_id, current_user.id)

    question_ids = list({r.question_id for r in payload.responses})
    option_rows = (
        admin.table("question_options").select("id, question_id, is_correct").in_("question_id", question_ids).execute().data
        or []
    )
    correct_option_by_question: Dict[str, set] = {}
    for opt in option_rows:
        if opt["is_correct"]:
            correct_option_by_question.setdefault(opt["question_id"], set()).add(opt["id"])

    resolved_responses: List[Dict[str, Any]] = []
    correct_count = 0
    skipped_count = 0
    now = _now_iso()

    # Bulk-increment inputs, built in the same pass as scoring instead of a
    # second per-response DB round trip each.
    stat_question_ids: List[str] = []
    stat_answered: List[bool] = []
    stat_corrects: List[bool] = []
    wrong_question_ids: List[str] = []

    for response in payload.responses:
        correct_ids = correct_option_by_question.get(response.question_id, set())
        was_skipped = len(response.selected_option_ids) == 0
        is_correct = (not was_skipped) and set(response.selected_option_ids) == correct_ids and len(correct_ids) > 0

        if was_skipped:
            skipped_count += 1
        elif is_correct:
            correct_count += 1

        resolved_responses.append(
            {
                "questionId": response.question_id,
                "selectedOptionIds": response.selected_option_ids,
                "isCorrect": is_correct,
                "timeSpentSeconds": response.time_spent_seconds,
                "wasSkipped": was_skipped,
                "markedForReview": response.marked_for_review,
            }
        )

        stat_question_ids.append(response.question_id)
        stat_answered.append(not was_skipped)
        stat_corrects.append(is_correct)

        if not was_skipped and not is_correct:
            wrong_question_ids.append(response.question_id)

    # --- Real accuracy stats, one atomic round trip for the whole quiz ---
    # (previously: one SELECT + one UPDATE per response -- see module
    # docstring for why that was both slow and a correctness bug).
    if stat_question_ids:
        admin.rpc(
            "bulk_increment_question_stats",
            {
                "p_question_ids": stat_question_ids,
                "p_answered": stat_answered,
                "p_corrects": stat_corrects,
            },
        ).execute()

    # --- Wrong Answer Notebook, batched into one upsert instead of N ---
    if wrong_question_ids:
        existing_marks_rows = (
            admin.table("wrong_answer_marks")
            .select("question_id, times_wrong")
            .eq("user_id", current_user.id)
            .in_("question_id", wrong_question_ids)
            .execute()
            .data
            or []
        )
        existing_times_wrong = {r["question_id"]: r["times_wrong"] for r in existing_marks_rows}
        upsert_payload = [
            {
                "user_id": current_user.id,
                "question_id": qid,
                "times_wrong": existing_times_wrong.get(qid, 0) + 1,
                "last_attempt_at": now,
                "resolved": False,
            }
            for qid in wrong_question_ids
        ]
        admin.table("wrong_answer_marks").upsert(upsert_payload, on_conflict="user_id,question_id").execute()

    total_questions = len(attempt_row.get("question_ids") or resolved_responses)
    wrong_count = max(0, total_questions - correct_count - skipped_count)
    score = round((correct_count / total_questions) * 100, 2) if total_questions > 0 else 0.0

    updated = (
        admin.table("quiz_attempts")
        .update(
            {
                "status": "completed",
                "responses": resolved_responses,
                "score": score,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "skipped_count": skipped_count,
                "time_taken_seconds": payload.time_taken_seconds,
                "completed_at": now,
            }
        )
        .eq("id", attempt_id)
        .execute()
        .data[0]
    )
    return ok(data=_row_to_response(updated), message="Quiz submitted.")


@router.delete("/attempts/{attempt_id}", response_model=ApiResponse[None])
async def abandon_attempt(attempt_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Marks an in-progress attempt abandoned rather than hard-deleting it,
    so it still shows up in history if ever needed -- "Discard" in the UI."""
    _get_attempt_or_404(attempt_id, current_user.id)
    get_supabase_admin().table("quiz_attempts").update({"status": "abandoned"}).eq("id", attempt_id).execute()
    return ok(message="Attempt discarded.")


# --- Wrong Answer Notebook (Module 4) ---------------------------------------


class WrongAnswerEntryResponse(CamelModel):
    question_id: str
    times_wrong: int
    last_attempt_at: str
    resolved: bool


class WrongAnswerListResponse(CamelModel):
    items: List[WrongAnswerEntryResponse]


class WrongAnswerResolvedRequest(CamelModel):
    resolved: bool


@router.get("/wrong-answers", response_model=ApiResponse[WrongAnswerListResponse])
async def list_wrong_answers(current_user: CurrentUser = Depends(get_current_user)):
    rows = (
        get_supabase_admin()
        .table("wrong_answer_marks")
        .select("*")
        .eq("user_id", current_user.id)
        .order("last_attempt_at", desc=True)
        .execute()
        .data
        or []
    )
    items = [
        WrongAnswerEntryResponse(
            question_id=r["question_id"],
            times_wrong=r["times_wrong"],
            last_attempt_at=r["last_attempt_at"],
            resolved=r["resolved"],
        )
        for r in rows
    ]
    return ok(data=WrongAnswerListResponse(items=items), message="Wrong answers fetched.")


@router.post("/wrong-answers/{question_id}/resolved", response_model=ApiResponse[None])
async def set_wrong_answer_resolved(
    question_id: str,
    payload: WrongAnswerResolvedRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    admin = get_supabase_admin()
    existing = (
        admin.table("wrong_answer_marks")
        .select("times_wrong, last_attempt_at")
        .eq("user_id", current_user.id)
        .eq("question_id", question_id)
        .execute()
        .data
    )
    admin.table("wrong_answer_marks").upsert(
        {
            "user_id": current_user.id,
            "question_id": question_id,
            "times_wrong": existing[0]["times_wrong"] if existing else 0,
            "last_attempt_at": existing[0].get("last_attempt_at") if existing else _now_iso(),
            "resolved": payload.resolved,
        }
        if existing
        else {
            "user_id": current_user.id,
            "question_id": question_id,
            "times_wrong": 0,
            "last_attempt_at": _now_iso(),
            "resolved": payload.resolved,
        },
        on_conflict="user_id,question_id",
    ).execute()
    return ok(message="Updated.")
