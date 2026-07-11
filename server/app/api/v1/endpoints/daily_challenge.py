"""
Daily Challenge (Phase 6 -- explicitly scoped out of the prior pass; see
PROJECT_STATE.md's "Deliberately Not Built" section for exactly why: it
needed a real streak table, timezone-aware "completed today" logic, and a
defined daily-mix algorithm, not a shallow nav entry with nothing behind
it. This is that real implementation.

ALGORITHM: `DAILY_CHALLENGE_QUESTION_COUNT` questions (default 5), with up
to `DAILY_CHALLENGE_WEAK_TOPIC_SLOTS` (default 3) of them drawn from the
student's weakest topics -- reusing Analytics' own definition of "weak"
(>=3 answered questions in that topic, lowest accuracy first) so the
number on this page and the number on the Analytics page never disagree.
The rest are filled from a random pool of approved questions the student
hasn't already seen today. A brand-new student with no attempt history
yet (no topic has 3+ answers) simply gets a fully random set -- there's
nothing to weight toward yet, and that's the honest behavior rather than
a fake "your weak topics" claim with no data behind it.

HONEST TIMEZONE CAVEAT: "today" is computed in UTC, not the student's
local timezone. A student west of UTC could see their challenge roll over
several hours before their own local midnight (or vice versa east of UTC).
Getting this exactly right needs either a stored per-user timezone or a
client-supplied local-date parameter validated server-side -- flagged here
as real follow-up work, not silently swept under a "good enough" UTC
default.

STREAK LOGIC: `daily_challenge_streaks` holds one row per user.
Completing today's challenge when `last_completed_date` was yesterday
increments `current_streak`; completing after a gap (or for the first
time) resets it to 1; completing again on a day already marked complete
is a no-op (idempotent -- a retried request or double-click can't inflate
a streak).
"""
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_MIN_ANSWERED_FOR_WEAK_TOPIC = 3


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


class DailyChallengeResponse(CamelModel):
    id: str
    challenge_date: str
    question_ids: List[str]
    completed: bool
    quiz_attempt_id: Optional[str] = None
    weak_topic_question_count: int


class DailyChallengeCompleteRequest(CamelModel):
    quiz_attempt_id: str


class StreakResponse(CamelModel):
    current_streak: int
    longest_streak: int
    last_completed_date: Optional[str] = None
    completed_today: bool


def _row_to_response(row: Dict[str, Any]) -> DailyChallengeResponse:
    return DailyChallengeResponse(
        id=row["id"],
        challenge_date=str(row["challenge_date"]),
        question_ids=row.get("question_ids") or [],
        completed=row["completed"],
        quiz_attempt_id=row.get("quiz_attempt_id"),
        weak_topic_question_count=row.get("weak_topic_question_count") or 0,
    )


def _weak_topics_for_user(admin, user_id: str) -> List[str]:
    """Same definition Analytics uses client-side: topics with at least
    `_MIN_ANSWERED_FOR_WEAK_TOPIC` answered (non-skipped) responses across
    completed attempts, sorted lowest-accuracy-first."""
    attempts = (
        admin.table("quiz_attempts")
        .select("responses")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .execute()
        .data
        or []
    )
    responses: List[Dict[str, Any]] = []
    for attempt in attempts:
        responses.extend(attempt.get("responses") or [])
    answered = [r for r in responses if not r.get("wasSkipped")]
    if not answered:
        return []

    question_ids = list({r["questionId"] for r in answered})
    question_rows = (
        admin.table("questions").select("id, topic").in_("id", question_ids).execute().data or []
    )
    topic_by_question = {r["id"]: r.get("topic") for r in question_rows if r.get("topic")}

    stats: Dict[str, Dict[str, int]] = {}
    for response in answered:
        topic = topic_by_question.get(response["questionId"])
        if not topic:
            continue
        bucket = stats.setdefault(topic, {"attempted": 0, "correct": 0})
        bucket["attempted"] += 1
        if response.get("isCorrect"):
            bucket["correct"] += 1

    scored = [
        (topic, s["correct"] / s["attempted"])
        for topic, s in stats.items()
        if s["attempted"] >= _MIN_ANSWERED_FOR_WEAK_TOPIC
    ]
    scored.sort(key=lambda pair: pair[1])
    return [topic for topic, _accuracy in scored]


def _generate_today_challenge(admin, user_id: str) -> Dict[str, Any]:
    settings = get_settings()
    weak_topics = _weak_topics_for_user(admin, user_id)

    selected_ids: List[str] = []
    weak_topic_count = 0

    for topic in weak_topics:
        if len(selected_ids) >= settings.DAILY_CHALLENGE_WEAK_TOPIC_SLOTS:
            break
        rows = (
            admin.table("questions")
            .select("id")
            .eq("status", "approved")
            .eq("topic", topic)
            .not_.in_("id", selected_ids or ["00000000-0000-0000-0000-000000000000"])
            .limit(3)
            .execute()
            .data
            or []
        )
        for row in rows:
            if len(selected_ids) >= settings.DAILY_CHALLENGE_WEAK_TOPIC_SLOTS:
                break
            selected_ids.append(row["id"])
            weak_topic_count += 1

    remaining_slots = settings.DAILY_CHALLENGE_QUESTION_COUNT - len(selected_ids)
    if remaining_slots > 0:
        exclude = selected_ids or ["00000000-0000-0000-0000-000000000000"]
        filler_rows = (
            admin.table("questions")
            .select("id")
            .eq("status", "approved")
            .not_.in_("id", exclude)
            .limit(remaining_slots * 5)  # overfetch, then sample client-side for variety
            .execute()
            .data
            or []
        )
        import random

        random.shuffle(filler_rows)
        for row in filler_rows[:remaining_slots]:
            selected_ids.append(row["id"])

    today = _today_utc()
    row = (
        admin.table("daily_challenge_progress")
        .insert(
            {
                "user_id": user_id,
                "challenge_date": today.isoformat(),
                "question_ids": selected_ids,
                "completed": False,
                "weak_topic_question_count": weak_topic_count,
            }
        )
        .execute()
        .data[0]
    )
    return row


@router.get("/today", response_model=ApiResponse[DailyChallengeResponse])
async def get_today_challenge(current_user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    today = _today_utc()

    existing = (
        admin.table("daily_challenge_progress")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("challenge_date", today.isoformat())
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return ok(data=_row_to_response(existing[0]), message="Today's challenge fetched.")

    row = _generate_today_challenge(admin, current_user.id)
    return ok(data=_row_to_response(row), message="Today's challenge generated.")


@router.post("/{progress_id}/complete", response_model=ApiResponse[DailyChallengeResponse])
async def complete_challenge(
    progress_id: str,
    payload: DailyChallengeCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    admin = get_supabase_admin()

    try:
        progress = (
            admin.table("daily_challenge_progress").select("*").eq("id", progress_id).single().execute().data
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Daily challenge not found.")
        raise

    if progress["user_id"] != current_user.id:
        raise ForbiddenError("This isn't your daily challenge.")

    attempt = (
        admin.table("quiz_attempts")
        .select("id, user_id, status")
        .eq("id", payload.quiz_attempt_id)
        .limit(1)
        .execute()
        .data
    )
    if not attempt or attempt[0]["user_id"] != current_user.id:
        raise AppException("quiz_attempt_id must reference one of your own quiz attempts.")
    if attempt[0]["status"] != "completed":
        raise AppException("The linked quiz attempt must be completed before the challenge can be marked done.")

    already_completed = progress["completed"]
    admin.table("daily_challenge_progress").update(
        {"completed": True, "quiz_attempt_id": payload.quiz_attempt_id}
    ).eq("id", progress_id).execute()

    if not already_completed:
        _update_streak(admin, current_user.id, challenge_date=date.fromisoformat(str(progress["challenge_date"])))

    updated = admin.table("daily_challenge_progress").select("*").eq("id", progress_id).single().execute().data
    return ok(data=_row_to_response(updated), message="Daily challenge completed.")


def _update_streak(admin, user_id: str, *, challenge_date: date) -> None:
    existing = admin.table("daily_challenge_streaks").select("*").eq("user_id", user_id).limit(1).execute().data
    yesterday = challenge_date - timedelta(days=1)

    if not existing:
        admin.table("daily_challenge_streaks").insert(
            {
                "user_id": user_id,
                "current_streak": 1,
                "longest_streak": 1,
                "last_completed_date": challenge_date.isoformat(),
            }
        ).execute()
        return

    row = existing[0]
    last_completed = date.fromisoformat(str(row["last_completed_date"])) if row.get("last_completed_date") else None

    if last_completed == challenge_date:
        return  # already recorded -- idempotent

    new_streak = row["current_streak"] + 1 if last_completed == yesterday else 1
    admin.table("daily_challenge_streaks").update(
        {
            "current_streak": new_streak,
            "longest_streak": max(row["longest_streak"], new_streak),
            "last_completed_date": challenge_date.isoformat(),
        }
    ).eq("user_id", user_id).execute()


@router.get("/streak", response_model=ApiResponse[StreakResponse])
async def get_streak(current_user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    rows = admin.table("daily_challenge_streaks").select("*").eq("user_id", current_user.id).limit(1).execute().data

    if not rows:
        return ok(
            data=StreakResponse(current_streak=0, longest_streak=0, last_completed_date=None, completed_today=False),
            message="Streak fetched.",
        )

    row = rows[0]
    today = _today_utc()
    last_completed = date.fromisoformat(str(row["last_completed_date"])) if row.get("last_completed_date") else None
    return ok(
        data=StreakResponse(
            current_streak=row["current_streak"],
            longest_streak=row["longest_streak"],
            last_completed_date=row.get("last_completed_date"),
            completed_today=last_completed == today,
        ),
        message="Streak fetched.",
    )
