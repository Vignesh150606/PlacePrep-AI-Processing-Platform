"""
Quiz attempt persistence (Module 2/3 — Quiz Engine + Submission) and the
Wrong Answer Notebook (Module 4).

Design notes:
- There is no persisted `quizzes` table backing every ad-hoc generated quiz
  (QuizConfigForm always built its question pool in memory) — so
  `quiz_attempts` carries its own denormalized mode/topic/company/difficulty
  instead of pointing at a `quiz_id` foreign key. `quiz_id` stays in the
  response shape (always null) purely so the frontend's shared `QuizAttempt`
  type can accommodate a future real `quizzes` table without a breaking
  change.
- Correctness is always recomputed server-side from the `question_options`
  table on submit, never trusted from the client's `isCorrect` field — a
  client bug or tampering shouldn't be able to inflate a score or corrupt
  the times_attempted/times_correct stats other students' accuracy numbers
  depend on.
- Only one attempt can be "in-progress" per user at a time; starting a new
  one auto-abandons any previous in-progress attempt so "resume" (GET
  .../in-progress) is always unambiguous.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
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

    # Only one in-progress attempt at a time — abandon any previous one so
    # "resume" (GET /attempts/in-progress) always has exactly one candidate.
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
async def submit_attempt(
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

        # Real accuracy stats — nothing wrote to these columns before this
        # pass, so QuestionCard's "X% of students answer this correctly" was
        # always reading zeros.
        current = admin.table("questions").select("times_attempted, times_correct").eq(
            "id", response.question_id
        ).single().execute().data
        if current is not None:
            admin.table("questions").update(
                {
                    "times_attempted": (current.get("times_attempted") or 0) + (0 if was_skipped else 1),
                    "times_correct": (current.get("times_correct") or 0) + (1 if is_correct else 0),
                }
            ).eq("id", response.question_id).execute()

        # Wrong Answer Notebook — every fresh wrong (non-skipped, non-correct)
        # answer resets `resolved` to false: getting it wrong again means
        # it's back on the revision list even if it was previously mastered.
        if not was_skipped and not is_correct:
            existing = (
                admin.table("wrong_answer_marks")
                .select("times_wrong")
                .eq("user_id", current_user.id)
                .eq("question_id", response.question_id)
                .execute()
                .data
            )
            times_wrong = (existing[0]["times_wrong"] if existing else 0) + 1
            admin.table("wrong_answer_marks").upsert(
                {
                    "user_id": current_user.id,
                    "question_id": response.question_id,
                    "times_wrong": times_wrong,
                    "last_attempt_at": now,
                    "resolved": False,
                },
                on_conflict="user_id,question_id",
            ).execute()

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
    so it still shows up in history if ever needed — "Discard" in the UI."""
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
