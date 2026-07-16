"""
Question Bank endpoints -- read-only surface for the questions the AI
Processing Pipeline has extracted, validated, de-duplicated, classified,
and stored, PLUS the write endpoints admins use to approve/reject/edit/
delete/merge a pending-review question before it's visible in the public
Question Bank.

Non-admins only ever see `status == "approved"` questions by default --
that mirrors the `questions_select_approved_or_admin` RLS policy from
migration 0002. We have to re-apply that filter here in application code
because `get_supabase_admin()` is a service-role client that intentionally
bypasses RLS.

PHASE 6 CHANGES:
  - Real `page`/`pageSize` pagination with an accurate DB-side `total`
    (via a `count="exact"` query mirroring the same server-side filters),
    replacing the old flat `limit` param. HONEST CAVEAT: `company_id` and
    `subject` still can't be filtered server-side in this embed shape
    (they live behind a join postgrest can't push a WHERE into here without
    a second round trip) -- when either is set, `total` reflects only the
    current page after that Python-side filter, not the true DB-wide
    count. This matches the pre-existing behavior for those two filters;
    it's called out explicitly rather than silently pretended away.
  - New `POST /{canonical_id}/merge` -- Admin Review "Merge" (see
    services/question_merge.py for what actually happens).
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, question_merge

router = APIRouter()

_EMBED = (
    "*, "
    "question_options(id, label, option_text, is_correct, order_index), "
    "question_topics(topics(id, name, subject_id, subjects(id, name))), "
    "question_companies(company_id)"
)

_VALID_STATUSES = {"pending-review", "approved", "rejected"}


class QuestionOptionResponse(CamelModel):
    id: str
    question_id: str
    label: str
    text: str
    is_correct: bool


class QuestionResponse(CamelModel):
    id: str
    type: str
    text: str
    options: List[QuestionOptionResponse]
    correct_explanation: Optional[str] = None
    topic: str
    subject: str
    company_id: Optional[str] = None
    difficulty: str
    source_pdf_id: Optional[str] = None
    page_number: Optional[int] = None
    status: str
    confidence_score: Optional[float] = None
    tags: List[str]
    times_attempted: int
    times_correct: int
    created_at: str


class QuestionListResponse(CamelModel):
    items: List[QuestionResponse]
    total: int
    page: int
    page_size: int


class QuestionStatusUpdateRequest(CamelModel):
    status: str


class QuestionUpdateRequest(CamelModel):
    text: Optional[str] = None
    correct_explanation: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None


class QuestionMergeRequest(CamelModel):
    duplicate_id: str


class QuestionMergeResponse(CamelModel):
    canonical: QuestionResponse
    attempts_updated: int
    bookmarks_reassigned: int
    bookmarks_dropped_as_duplicate: int
    wrong_answer_marks_merged: int


def _row_to_response(row: Dict[str, Any]) -> QuestionResponse:
    options = [
        QuestionOptionResponse(
            id=opt["id"],
            question_id=row["id"],
            label=opt["label"],
            text=opt["option_text"],
            is_correct=opt["is_correct"],
        )
        for opt in sorted(row.get("question_options") or [], key=lambda o: o.get("order_index") or 0)
    ]

    topic_name = ""
    subject_name = ""
    topic_links = row.get("question_topics") or []
    if topic_links:
        topic_row = topic_links[0].get("topics") or {}
        topic_name = topic_row.get("name") or ""
        subject_row = topic_row.get("subjects") or {}
        subject_name = subject_row.get("name") or ""

    company_links = row.get("question_companies") or []
    company_id = company_links[0]["company_id"] if company_links else None

    return QuestionResponse(
        id=row["id"],
        type=row["type"],
        text=row["question_text"],
        options=options,
        correct_explanation=row.get("correct_explanation"),
        topic=topic_name,
        subject=subject_name,
        company_id=company_id,
        difficulty=row["difficulty"],
        source_pdf_id=row.get("source_pdf_id"),
        page_number=row.get("page_number"),
        status=row["status"],
        confidence_score=row.get("confidence_score"),
        tags=row.get("tags") or [],
        times_attempted=row.get("times_attempted", 0),
        times_correct=row.get("times_correct", 0),
        created_at=row["created_at"],
    )


def _apply_server_side_filters(query, *, admin: bool, status: Optional[str], difficulty: Optional[str],
                                source_pdf_id: Optional[str], search: Optional[str]):
    if admin:
        if status and status in _VALID_STATUSES:
            query = query.eq("status", status)
    else:
        query = query.eq("status", "approved")

    if difficulty:
        query = query.eq("difficulty", difficulty)
    if source_pdf_id:
        query = query.eq("source_pdf_id", source_pdf_id)
    if search:
        query = query.ilike("question_text", f"%{search}%")
    return query


@router.get("", response_model=ApiResponse[QuestionListResponse])
async def list_questions(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    search: Optional[str] = Query(None, description="Case-insensitive substring match on question text"),
    difficulty: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    source_pdf_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="pending-review | approved | rejected -- admin only"),
    page: int = Query(1, ge=1),
    page_size: int = Query(300, ge=1, le=500),
):
    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = admin_client.table("questions").select(_EMBED).order("created_at", desc=True).range(start, end)
    query = _apply_server_side_filters(
        query, admin=admin, status=status, difficulty=difficulty, source_pdf_id=source_pdf_id, search=search
    )
    rows = query.execute().data or []
    items = [_row_to_response(r) for r in rows]

    # company_id / subject live behind a join in this embed shape, which
    # postgrest can't filter on directly here without a second round trip --
    # filtering the already-small page in Python is simpler and, given the
    # page_size cap above, cheap. See the module docstring for the honest
    # `total` caveat this creates.
    if company_id:
        items = [q for q in items if q.company_id == company_id]
    if subject:
        items = [q for q in items if q.subject.lower() == subject.lower()]

    if company_id or subject:
        total = len(items)
    else:
        count_query = admin_client.table("questions").select("id", count="exact")
        count_query = _apply_server_side_filters(
            count_query, admin=admin, status=status, difficulty=difficulty, source_pdf_id=source_pdf_id, search=search
        )
        total = count_query.execute().count or 0

    return ok(
        data=QuestionListResponse(items=items, total=total, page=page, page_size=page_size),
        message="Questions fetched.",
    )


def _get_question_or_404(question_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin()
            .table("questions")
            .select(_EMBED)
            .eq("id", question_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Question not found.")
        raise
    return result.data


@router.patch("/{question_id}/status", response_model=ApiResponse[QuestionResponse])
async def update_question_status(
    question_id: str,
    payload: QuestionStatusUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Module 8 -- Admin Review: Approve / Reject."""
    if payload.status not in ("approved", "rejected"):
        raise AppException("status must be 'approved' or 'rejected'.")

    _get_question_or_404(question_id)
    get_supabase_admin().table("questions").update({"status": payload.status}).eq("id", question_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-approved" if payload.status == "approved" else "question-rejected",
        target_type="question",
        target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message=f"Question {payload.status}.")


@router.patch("/{question_id}", response_model=ApiResponse[QuestionResponse])
async def update_question(
    question_id: str,
    payload: QuestionUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Module 8 -- Admin Review: Edit."""
    _get_question_or_404(question_id)

    updates: Dict[str, Any] = {}
    if payload.text is not None:
        updates["question_text"] = payload.text
    if payload.correct_explanation is not None:
        updates["correct_explanation"] = payload.correct_explanation
    if payload.difficulty is not None:
        updates["difficulty"] = payload.difficulty
    if payload.tags is not None:
        updates["tags"] = payload.tags

    if updates:
        get_supabase_admin().table("questions").update(updates).eq("id", question_id).execute()
        audit.log_admin_action(
            admin_id=admin_user.id,
            action="question-edited",
            target_type="question",
            target_id=question_id,
            metadata={"fields_changed": sorted(updates.keys())},
        )

    return ok(data=_row_to_response(_get_question_or_404(question_id)), message="Question updated.")


@router.post("/{canonical_id}/merge", response_model=ApiResponse[QuestionMergeResponse])
async def merge_question(
    canonical_id: str,
    payload: QuestionMergeRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Module 8 -- Admin Review: Merge (Phase 6 -- see
    services/question_merge.py for the real implementation: this is
    genuinely destructive and touches quiz_attempts/bookmarks/
    wrong_answer_marks, not just a status flip, so it's kept in its own
    module rather than inlined here)."""
    _get_question_or_404(canonical_id)
    _get_question_or_404(payload.duplicate_id)

    result = question_merge.merge_questions(canonical_id=canonical_id, duplicate_id=payload.duplicate_id)
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-merged",
        target_type="question",
        target_id=canonical_id,
        metadata={"duplicate_id": payload.duplicate_id, "attempts_updated": result.attempts_updated},
    )

    return ok(
        data=QuestionMergeResponse(
            canonical=_row_to_response(_get_question_or_404(canonical_id)),
            attempts_updated=result.attempts_updated,
            bookmarks_reassigned=result.bookmarks_reassigned,
            bookmarks_dropped_as_duplicate=result.bookmarks_dropped_as_duplicate,
            wrong_answer_marks_merged=result.wrong_answer_marks_merged,
        ),
        message="Questions merged.",
    )


@router.delete("/{question_id}", response_model=ApiResponse[None])
async def delete_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Module 8 -- Admin Review: Delete. `question_options`/`question_topics`/
    `question_companies` all reference `questions.id` with ON DELETE CASCADE
    (migration 0001), so this cleans up in one call."""
    _get_question_or_404(question_id)
    get_supabase_admin().table("questions").delete().eq("id", question_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-deleted", target_type="question", target_id=question_id,
    )
    return ok(message="Question deleted.")
