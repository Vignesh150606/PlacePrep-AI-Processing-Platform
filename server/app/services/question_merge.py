"""
Admin Review "Merge" (Phase 6 -- explicitly flagged as not-built in the
prior pass's PROJECT_STATE.md, because doing it correctly means more than
a fourth button next to Approve/Reject/Delete). This module is that real
implementation.

Merging question `duplicate_id` into `canonical_id` means:

1. Combine `times_attempted` / `times_correct` onto the canonical row --
   otherwise merging away a question silently loses its accuracy history.
2. Reassign every historical reference to the duplicate's id so nothing
   downstream breaks or silently orphans:
   - `quiz_attempts.question_ids` (a uuid[] column) and
     `quiz_attempts.responses` (a jsonb array of {questionId, ...}) --
     every attempt that included the duplicate now points at the
     canonical id instead. Past quiz results still render correctly
     (QuestionCard/QuizResult look up questions by id).
   - `bookmarks` -- a user who bookmarked the duplicate now has it
     bookmarked as the canonical question instead. If they'd *already*
     bookmarked both (rare, but possible), the duplicate's bookmark row is
     simply dropped rather than violating the
     `unique(user_id, target_type, target_id)` constraint with a blind
     UPDATE.
   - `wrong_answer_marks` -- same shape of conflict as bookmarks (primary
     key is `(user_id, question_id)`); where a user has entries for both,
     they're combined (`times_wrong` summed, `resolved` = true only if
     BOTH were resolved -- if either is still an active wrong answer, the
     merged entry should be too) rather than either row winning silently.
3. Delete the duplicate question row. `question_options`,
   `question_topics`, and `question_companies` all cascade
   (`ON DELETE CASCADE`, migration 0001) -- the duplicate's own
   classification is discarded in favor of the canonical's, which is the
   right call since classification only matters for a question that's
   still independently findable.

Data-volume note: step 2's `quiz_attempts` reassignment does a full scan
of attempts that reference the duplicate id (bounded by an index-friendly
`.contains()` filter, not a full table scan) and rewrites each matching
row's JSON in Python before writing it back -- there's no way to do a
targeted jsonb-array element replacement through the postgrest query
builder used everywhere else in this codebase. That's O(matching attempts),
which is fine at current scale (a duplicate question realistically appears
in low tens of attempts, not thousands) but would want a real SQL
migration/RPC if quiz volume grows by orders of magnitude -- flagged here
rather than silently accepted.
"""
from dataclasses import dataclass
from typing import Any, Dict, List

from app.core.exceptions import AppException, NotFoundError
from app.core.supabase_client import get_supabase_admin


@dataclass
class MergeResult:
    canonical_id: str
    duplicate_id: str
    attempts_updated: int
    bookmarks_reassigned: int
    bookmarks_dropped_as_duplicate: int
    wrong_answer_marks_merged: int


def _fetch_question(question_id: str) -> Dict[str, Any]:
    rows = get_supabase_admin().table("questions").select("*").eq("id", question_id).limit(1).execute().data
    if not rows:
        raise NotFoundError(f"Question {question_id} not found.")
    return rows[0]


def merge_questions(*, canonical_id: str, duplicate_id: str) -> MergeResult:
    if canonical_id == duplicate_id:
        raise AppException("A question cannot be merged into itself.")

    admin = get_supabase_admin()
    canonical = _fetch_question(canonical_id)
    duplicate = _fetch_question(duplicate_id)

    # --- 1. Combine attempt stats onto the canonical row ---
    admin.table("questions").update(
        {
            "times_attempted": (canonical.get("times_attempted") or 0) + (duplicate.get("times_attempted") or 0),
            "times_correct": (canonical.get("times_correct") or 0) + (duplicate.get("times_correct") or 0),
        }
    ).eq("id", canonical_id).execute()

    # --- 2a. Reassign quiz_attempts ---
    affected_attempts = (
        admin.table("quiz_attempts")
        .select("id, question_ids, responses")
        .contains("question_ids", [duplicate_id])
        .execute()
        .data
        or []
    )
    for attempt in affected_attempts:
        new_question_ids = [canonical_id if qid == duplicate_id else qid for qid in (attempt.get("question_ids") or [])]
        new_responses: List[Dict[str, Any]] = []
        for response in attempt.get("responses") or []:
            if response.get("questionId") == duplicate_id:
                response = {**response, "questionId": canonical_id}
            new_responses.append(response)
        admin.table("quiz_attempts").update(
            {"question_ids": new_question_ids, "responses": new_responses}
        ).eq("id", attempt["id"]).execute()

    # --- 2b. Reassign bookmarks (respecting the unique(user_id, target_type, target_id) constraint) ---
    duplicate_bookmarks = (
        admin.table("bookmarks")
        .select("id, user_id")
        .eq("target_type", "question")
        .eq("target_id", duplicate_id)
        .execute()
        .data
        or []
    )
    bookmarks_reassigned = 0
    bookmarks_dropped = 0
    for bookmark in duplicate_bookmarks:
        already_has_canonical = (
            admin.table("bookmarks")
            .select("id")
            .eq("user_id", bookmark["user_id"])
            .eq("target_type", "question")
            .eq("target_id", canonical_id)
            .limit(1)
            .execute()
            .data
        )
        if already_has_canonical:
            admin.table("bookmarks").delete().eq("id", bookmark["id"]).execute()
            bookmarks_dropped += 1
        else:
            admin.table("bookmarks").update({"target_id": canonical_id}).eq("id", bookmark["id"]).execute()
            bookmarks_reassigned += 1

    # --- 2c. Merge wrong_answer_marks (primary key (user_id, question_id)) ---
    duplicate_marks = (
        admin.table("wrong_answer_marks")
        .select("*")
        .eq("question_id", duplicate_id)
        .execute()
        .data
        or []
    )
    marks_merged = 0
    for mark in duplicate_marks:
        existing_canonical_mark = (
            admin.table("wrong_answer_marks")
            .select("*")
            .eq("user_id", mark["user_id"])
            .eq("question_id", canonical_id)
            .limit(1)
            .execute()
            .data
        )
        if existing_canonical_mark:
            existing = existing_canonical_mark[0]
            admin.table("wrong_answer_marks").update(
                {
                    "times_wrong": (existing.get("times_wrong") or 0) + (mark.get("times_wrong") or 0),
                    "resolved": bool(existing.get("resolved")) and bool(mark.get("resolved")),
                    "last_attempt_at": max(existing["last_attempt_at"], mark["last_attempt_at"]),
                }
            ).eq("user_id", mark["user_id"]).eq("question_id", canonical_id).execute()
            admin.table("wrong_answer_marks").delete().eq("user_id", mark["user_id"]).eq(
                "question_id", duplicate_id
            ).execute()
        else:
            admin.table("wrong_answer_marks").update({"question_id": canonical_id}).eq(
                "user_id", mark["user_id"]
            ).eq("question_id", duplicate_id).execute()
        marks_merged += 1

    # --- 3. Delete the duplicate (question_options/topics/companies cascade) ---
    admin.table("questions").delete().eq("id", duplicate_id).execute()

    return MergeResult(
        canonical_id=canonical_id,
        duplicate_id=duplicate_id,
        attempts_updated=len(affected_attempts),
        bookmarks_reassigned=bookmarks_reassigned,
        bookmarks_dropped_as_duplicate=bookmarks_dropped,
        wrong_answer_marks_merged=marks_merged,
    )
