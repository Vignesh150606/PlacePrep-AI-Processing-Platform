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
import logging
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.config import get_settings
from app.core.exceptions import AppException, NotFoundError
from app.core.rate_limit import upload_limit
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, lifecycle, notifications, question_authoring, question_merge

logger = logging.getLogger(__name__)

router = APIRouter()

_EMBED = (
    "*, "
    "question_options(id, label, option_text, is_correct, order_index), "
    "question_topics(topics(id, name, subject_id, subjects(id, name))), "
    "question_companies(company_id)"
)

# 'draft' is Phase 13 -- Admin Manual Builder rows before publish (see
# migration 0015's docstring for why "draft" was added to the shared
# status column rather than a separate table). 'archived' is Phase 15,
# Part 1 -- see migration 0016's docstring for why "published" is NOT a
# separate status value (it's 'approved' under another name everywhere
# downstream already treats it that way).
_VALID_STATUSES = {"draft", "pending-review", "approved", "rejected", "archived"}
_ASSET_MAX_BYTES = 8 * 1024 * 1024
_ALLOWED_ASSET_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "pdf"}

# Phase 15, Part 1 -- Question Lifecycle Management: `POST /bulk-action`'s
# `action` enum. Mirrors `resources.py`'s `_VALID_BULK_ACTIONS` shape, just
# with more actions -- a question's lifecycle has more states than a
# resource's pending-review/approved/rejected.
_VALID_BULK_ACTIONS = {
    "approve", "reject", "publish", "archive", "unarchive",
    "restore", "delete", "permanent-delete",
}
# Actions with a clean, one-call inverse -- these get an "Undo" affordance
# in the bulk toolbar (Feature 2's "Undo when possible"). Approve/reject/
# publish are deliberately excluded: reusing "reject" as approve's undo (or
# vice versa) would silently drop the other action's own notification/audit
# semantics, and permanent-delete has no inverse by definition.
_UNDOABLE_BULK_ACTIONS = {
    "archive": "unarchive",
    "unarchive": "archive",
    "delete": "restore",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    solution_steps: Optional[str] = None
    interview_tip: Optional[str] = None
    reference_note: Optional[str] = None
    topic: str
    subject: str
    company_id: Optional[str] = None
    difficulty: str
    source_pdf_id: Optional[str] = None
    page_number: Optional[int] = None
    status: str
    confidence_score: Optional[float] = None
    tags: List[str]
    image_urls: List[str] = Field(default_factory=list)
    attachment_urls: List[str] = Field(default_factory=list)
    source_type: str = "AI"
    submission_method: Optional[str] = None
    created_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    times_attempted: int
    times_correct: int
    created_at: str
    # Phase 15, Part 1 -- Question Lifecycle Management.
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class QuestionListResponse(CamelModel):
    items: List[QuestionResponse]
    total: int
    page: int
    page_size: int


class QuestionStatusUpdateRequest(CamelModel):
    status: str
    rejection_reason: Optional[str] = None


class QuestionUpdateRequest(CamelModel):
    text: Optional[str] = None
    correct_explanation: Optional[str] = None
    solution_steps: Optional[str] = None
    interview_tip: Optional[str] = None
    reference_note: Optional[str] = None
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


# =============================================================================
# Phase 15, Part 1 -- Question Lifecycle Management: bulk shapes.
# Mirrors resources.py's BulkActionRequest/BulkActionResponse (ids + action
# enum in, succeeded/failed ids out) -- questions just need more actions and
# a second, field-oriented bulk endpoint alongside it (see
# `question_authoring.reclassify_question`'s docstring for why subject/
# topic/company/difficulty/tags share one endpoint instead of five).
# =============================================================================

class QuestionBulkActionRequest(CamelModel):
    question_ids: List[str] = Field(..., min_length=1, max_length=200)
    action: str
    rejection_reason: Optional[str] = None


class QuestionBulkActionResponse(CamelModel):
    succeeded: List[str]
    failed: List[Dict[str, str]]
    undo_action: Optional[str] = None


class QuestionBulkUpdateRequest(CamelModel):
    question_ids: List[str] = Field(..., min_length=1, max_length=200)
    difficulty: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    company_name: Optional[str] = None
    add_tags: Optional[List[str]] = None


class QuestionBulkUpdateResponse(CamelModel):
    succeeded: List[str]
    failed: List[Dict[str, str]]


class GrowthPoint(CamelModel):
    date: str
    count: int


class ModeratorActivityEntry(CamelModel):
    admin_id: str
    admin_name: str
    action_count: int


class QuestionAnalyticsResponse(CamelModel):
    """Feature 9 (Analytics), scoped to questions -- the slice that Feature
    1's archive/soft-delete work directly enables (archived/deleted counts
    didn't exist as concepts before this phase). Company/resource/alumni/
    community-wide analytics are a separate, deferred pass -- see
    PROJECT_STATE.md."""
    by_status: Dict[str, int]
    by_source_type: Dict[str, int]
    total_active: int
    deleted_count: int
    approval_rate: float
    bulk_import_duplicates_total: int
    growth_last_30_days: List[GrowthPoint]
    moderator_activity: List[ModeratorActivityEntry]


# =============================================================================
# Phase 13 -- Question Authoring System: shared request/response shapes.
# =============================================================================

class OptionAuthoringRequest(CamelModel):
    label: str
    text: str
    is_correct: bool


class QuestionAuthoringRequest(CamelModel):
    """Shared body shape for the Admin Manual Builder and Student
    Submission forms -- both send this, only the endpoint (and therefore
    the resulting `status`/`sourceType`) differs."""
    type: str
    text: str
    options: List[OptionAuthoringRequest]
    correct_explanation: Optional[str] = None
    solution_steps: Optional[str] = None
    interview_tip: Optional[str] = None
    reference_note: Optional[str] = None
    difficulty: str
    subject: Optional[str] = None
    topic: Optional[str] = None
    company_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    image_urls: List[str] = Field(default_factory=list)
    attachment_urls: List[str] = Field(default_factory=list)


class QuestionManualCreateRequest(QuestionAuthoringRequest):
    publish: bool = False


class AssetUploadResponse(CamelModel):
    url: str
    file_name: str
    file_size_bytes: int


class BulkParseRequest(CamelModel):
    raw_text: str


class BulkParsePreviewItemResponse(CamelModel):
    index: int
    status: str
    warnings: List[str]
    raw_block: str
    parsed: Optional[QuestionAuthoringRequest] = None
    duplicate_of_question_id: Optional[str] = None


class BulkParseResponse(CamelModel):
    items: List[BulkParsePreviewItemResponse]
    total_detected: int
    total_parsed_clean: int
    total_warnings: int
    total_invalid: int


class BulkImportItemRequest(QuestionAuthoringRequest):
    """One admin-confirmed row from the preview table -- only rows the
    admin chose to keep (edited or not) are sent here; anything they
    discarded from the preview simply isn't included."""


class BulkImportRequest(CamelModel):
    items: List[BulkImportItemRequest]
    label: Optional[str] = None


class BulkImportItemResult(CamelModel):
    index: int
    imported: bool
    question_id: Optional[str] = None
    reason: Optional[str] = None  # set when imported=False, e.g. "duplicate" | "invalid: <detail>"


class BulkImportResponse(CamelModel):
    batch_id: str
    total_submitted: int
    total_imported: int
    total_duplicate: int
    total_error: int
    results: List[BulkImportItemResult]


class ImportBatchResponse(CamelModel):
    id: str
    admin_id: str
    label: Optional[str] = None
    total_detected: int
    total_imported: int
    total_duplicate: int
    total_error: int
    created_at: str


def _options_to_authoring(options: List[OptionAuthoringRequest]) -> List[question_authoring.OptionInput]:
    return [question_authoring.OptionInput(label=o.label, text=o.text, is_correct=o.is_correct) for o in options]


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
        solution_steps=row.get("solution_steps"),
        interview_tip=row.get("interview_tip"),
        reference_note=row.get("reference_note"),
        topic=topic_name,
        subject=subject_name,
        company_id=company_id,
        difficulty=row["difficulty"],
        source_pdf_id=row.get("source_pdf_id"),
        page_number=row.get("page_number"),
        status=row["status"],
        confidence_score=row.get("confidence_score"),
        tags=row.get("tags") or [],
        image_urls=row.get("image_urls") or [],
        attachment_urls=row.get("attachment_urls") or [],
        source_type=row.get("source_type") or "AI",
        submission_method=row.get("submission_method"),
        created_by=row.get("created_by"),
        reviewed_by=row.get("reviewed_by"),
        reviewed_at=row.get("reviewed_at"),
        rejection_reason=row.get("rejection_reason"),
        times_attempted=row.get("times_attempted", 0),
        times_correct=row.get("times_correct", 0),
        created_at=row["created_at"],
        archived_at=row.get("archived_at"),
        archived_by=row.get("archived_by"),
        deleted_at=row.get("deleted_at"),
        deleted_by=row.get("deleted_by"),
    )


def _apply_server_side_filters(query, *, admin: bool, current_user_id: str, mine: bool, status: Optional[str],
                                difficulty: Optional[str], source_pdf_id: Optional[str],
                                source_type: Optional[str], search: Optional[str],
                                deleted: bool = False):
    # Phase 15, Part 1 -- soft-deleted questions are hidden everywhere by
    # default (Question Bank, Quiz Engine via the ids it was given, Company
    # pages, Analytics, Search, Daily Challenge) -- only an explicit admin
    # `deleted=true` request (the admin "Deleted" tab) sees them. This is
    # applied before the `mine`/`admin`/public branch below, not instead of
    # it, so the Deleted tab still respects `mine`/`status`/etc. alongside it.
    if deleted:
        query = query.not_.is_("deleted_at", "null")
    else:
        query = query.is_("deleted_at", "null")

    if mine:
        # Phase 13 -- "My Submissions" (student) / "Draft Management" (admin's
        # own manual-builder drafts): always own rows, any status, whoever
        # is asking -- an explicit opt-in, so the default Question Bank
        # browse (feeding the Quiz Engine) never silently starts including
        # not-yet-approved questions.
        query = query.eq("created_by", current_user_id)
        if status and status in _VALID_STATUSES:
            query = query.eq("status", status)
    elif admin:
        if status and status in _VALID_STATUSES:
            query = query.eq("status", status)
    else:
        query = query.eq("status", "approved")

    if difficulty:
        query = query.eq("difficulty", difficulty)
    if source_pdf_id:
        query = query.eq("source_pdf_id", source_pdf_id)
    if source_type:
        query = query.eq("source_type", source_type)
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
    status: Optional[str] = Query(
        None, description="draft | pending-review | approved | rejected | archived -- admin/mine only"
    ),
    source_type: Optional[str] = Query(
        None, description="AI | ADMIN_MANUAL | STUDENT_MANUAL | BULK_IMPORT -- e.g. the Student Question Queue"
    ),
    mine: bool = Query(False, description="Phase 13 -- only questions created_by the current user, any status"),
    deleted: bool = Query(
        False, description="Phase 15 -- admin only: true shows ONLY soft-deleted questions (the Deleted tab)"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(300, ge=1, le=500),
):
    if deleted and not admin:
        raise AppException("Only admins can view deleted questions.", status_code=403)

    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    filter_kwargs: Dict[str, Any] = dict(
        admin=admin, current_user_id=current_user.id, mine=mine, status=status, difficulty=difficulty,
        source_pdf_id=source_pdf_id, source_type=source_type, search=search, deleted=deleted,
    )

    query = admin_client.table("questions").select(_EMBED).order("created_at", desc=True).range(start, end)
    query = _apply_server_side_filters(query, **filter_kwargs)
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
        count_query = _apply_server_side_filters(count_query, **filter_kwargs)
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


# =============================================================================
# Phase 15, Part 1 -- Question Lifecycle Management: shared per-question
# helpers. Both the single-item endpoints below AND `bulk_question_action`
# call these, so there is exactly one place each transition's rules
# (allowed source status, notifications, what gets cleared) live -- not one
# copy per endpoint and a second, slightly different copy per bulk branch.
# =============================================================================

def _approve_or_reject_one(
    question_id: str, status: str, admin_id: str, rejection_reason: Optional[str] = None
) -> Dict[str, Any]:
    row = _get_question_or_404(question_id)
    updates = {
        "status": status,
        "reviewed_by": admin_id,
        "reviewed_at": _now_iso(),
        "rejection_reason": rejection_reason if status == "rejected" else None,
    }
    get_supabase_admin().table("questions").update(updates).eq("id", question_id).execute()

    if row.get("source_type") in ("STUDENT_MANUAL", "ADMIN_MANUAL") and row.get("created_by"):
        notifications.notify(
            user_id=row["created_by"],
            type_="question-approved" if status == "approved" else "question-rejected",
            title=f"Question {status}",
            message=(
                "Your submitted question is now live in the Question Bank."
                if status == "approved"
                else f"Your submitted question was rejected: {rejection_reason}"
            ),
            link_url="/questions",
        )
    return row


def _publish_one(question_id: str) -> None:
    """Shared by `publish_question` (single) and `bulk_question_action`'s
    `publish` case -- re-runs duplicate detection at publish time, not at
    every draft autosave, per `publish_question`'s own docstring below."""
    row = _get_question_or_404(question_id)
    if row["source_type"] != "ADMIN_MANUAL":
        raise AppException("Only admin-authored draft questions can be published this way.", status_code=422)
    if row["status"] != "draft":
        raise AppException(f"Question is already '{row['status']}', not a draft.", status_code=422)

    dup_check = question_authoring.duplicate.check_duplicate(
        row["question_text"], row["content_hash"], question_type=row["type"], difficulty=row["difficulty"]
    )
    if dup_check.is_duplicate and dup_check.reason == "exact-hash":
        raise AppException(
            f"An identical question already exists (id: {dup_check.matched_question_id}).", status_code=409
        )
    get_supabase_admin().table("questions").update({"status": "approved"}).eq("id", question_id).execute()


def _archive_one(question_id: str, admin_id: str) -> None:
    lifecycle.archive_row(
        "questions", question_id, admin_id, fetch_or_404=_get_question_or_404, noun="question",
    )


def _unarchive_one(question_id: str) -> None:
    lifecycle.unarchive_row("questions", question_id, fetch_or_404=_get_question_or_404, noun="question")


def _soft_delete_one(question_id: str, admin_id: str) -> None:
    lifecycle.soft_delete_row(
        "questions", question_id, admin_id, fetch_or_404=_get_question_or_404, noun="question",
    )


def _restore_one(question_id: str) -> None:
    lifecycle.restore_row("questions", question_id, fetch_or_404=_get_question_or_404, noun="question")


def _permanent_delete_one(question_id: str) -> None:
    """The "optional final step" past soft delete -- a real `delete()` this
    time, same as `delete_question` used to do unconditionally before Phase
    15. `question_options`/`question_topics`/`question_companies` all cascade
    (migration 0001)."""
    lifecycle.permanent_delete_row("questions", question_id, fetch_or_404=_get_question_or_404)


@router.patch("/{question_id}/status", response_model=ApiResponse[QuestionResponse])
async def update_question_status(
    question_id: str,
    payload: QuestionStatusUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Module 8 -- Admin Review: Approve / Reject. Phase 13 extended this to
    also carry a review trail (reviewed_by/reviewed_at/rejection_reason)
    and to notify the creator when it's their own manually-authored or
    submitted question being decided on -- an AI-extracted question has no
    single "owner" checking a status page, so that part of this was never
    needed before now."""
    if payload.status not in ("approved", "rejected"):
        raise AppException("status must be 'approved' or 'rejected'.")
    if payload.status == "rejected" and not payload.rejection_reason:
        raise AppException("rejectionReason is required when rejecting a question.", status_code=422)

    _approve_or_reject_one(question_id, payload.status, admin_user.id, payload.rejection_reason)
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-approved" if payload.status == "approved" else "question-rejected",
        target_type="question",
        target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message=f"Question {payload.status}.")


@router.patch("/bulk-update", response_model=ApiResponse[QuestionBulkUpdateResponse])
async def bulk_update_questions(
    payload: QuestionBulkUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Feature 1's "Bulk Subject Update" / "Bulk Topic Update" / "Bulk
    Company Update" / "Bulk Difficulty Update" / "Bulk Tags Update" -- one
    endpoint, not five near-identical ones. Every field is independently
    optional; only the ones the admin actually set are touched, same "only
    apply what's non-null" shape `update_question`'s single-item edit
    already uses. MUST be registered before `PATCH /{question_id}` below --
    both are single-path-segment PATCH routes, so "bulk-update" would
    otherwise be swallowed as a `question_id` value by the earlier match."""
    if payload.difficulty is not None and payload.difficulty not in _VALID_DIFFICULTIES_BULK:
        raise AppException(f"Invalid difficulty: {payload.difficulty}", status_code=422)
    if (
        payload.difficulty is None
        and payload.subject is None
        and payload.topic is None
        and payload.company_name is None
        and not payload.add_tags
    ):
        raise AppException("Provide at least one field to bulk-update.", status_code=422)

    admin_client = get_supabase_admin()
    succeeded: List[str] = []
    failed: List[Dict[str, str]] = []
    fields_touched: set = set()

    for question_id in payload.question_ids:
        try:
            row = _get_question_or_404(question_id)
            column_updates: Dict[str, Any] = {}
            if payload.difficulty is not None:
                column_updates["difficulty"] = payload.difficulty
                fields_touched.add("difficulty")
            if payload.add_tags:
                existing_tags = set(row.get("tags") or [])
                column_updates["tags"] = sorted(existing_tags | set(payload.add_tags))
                fields_touched.add("tags")
            if column_updates:
                admin_client.table("questions").update(column_updates).eq("id", question_id).execute()

            if payload.subject is not None or payload.topic is not None or payload.company_name is not None:
                changed = question_authoring.reclassify_question(
                    question_id,
                    subject_name=payload.subject,
                    topic_name=payload.topic,
                    company_name=payload.company_name,
                )
                fields_touched.update(changed)

            succeeded.append(question_id)
        except NotFoundError:
            failed.append({"id": question_id, "error": "Question not found."})
        except question_authoring.QuestionAuthoringError as exc:
            failed.append({"id": question_id, "error": str(exc)})
        except AppException as exc:
            failed.append({"id": question_id, "error": exc.message})

    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-bulk-updated",
        target_type="question",
        target_id=succeeded[0] if succeeded else payload.question_ids[0],
        metadata={
            "question_ids": succeeded,
            "fields_changed": sorted(fields_touched),
            "count": len(succeeded),
            "failed_count": len(failed),
        },
    )
    return ok(
        data=QuestionBulkUpdateResponse(succeeded=succeeded, failed=failed),
        message=f"{len(succeeded)} question(s) updated, {len(failed)} failed.",
    )


@router.post("/bulk-action", response_model=ApiResponse[QuestionBulkActionResponse])
async def bulk_question_action(
    payload: QuestionBulkActionRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Feature 1's "Bulk Approve / Reject / Publish / Archive / Unarchive /
    Restore / Delete / Permanent Delete" -- mirrors `resources.py`'s
    `bulk_action` shape (loop, collect succeeded/failed, one summary audit
    entry) rather than inventing a second bulk-action pattern."""
    if payload.action not in _VALID_BULK_ACTIONS:
        raise AppException(f"action must be one of {sorted(_VALID_BULK_ACTIONS)}.", status_code=422)
    if payload.action == "reject" and not payload.rejection_reason:
        raise AppException("rejectionReason is required for bulk reject.", status_code=422)

    def _run_one(question_id: str) -> None:
        if payload.action == "approve":
            _approve_or_reject_one(question_id, "approved", admin_user.id)
        elif payload.action == "reject":
            _approve_or_reject_one(question_id, "rejected", admin_user.id, payload.rejection_reason)
        elif payload.action == "publish":
            _publish_one(question_id)
        elif payload.action == "archive":
            _archive_one(question_id, admin_user.id)
        elif payload.action == "unarchive":
            _unarchive_one(question_id)
        elif payload.action == "restore":
            _restore_one(question_id)
        elif payload.action == "delete":
            _soft_delete_one(question_id, admin_user.id)
        elif payload.action == "permanent-delete":
            _permanent_delete_one(question_id)

    succeeded, failed = lifecycle.run_bulk(payload.question_ids, _run_one)

    bulk_audit_action = {
        "approve": "question-bulk-approved",
        "reject": "question-bulk-rejected",
        "publish": "question-bulk-published",
        "archive": "question-bulk-archived",
        "unarchive": "question-bulk-unarchived",
        "restore": "question-bulk-restored",
        "delete": "question-bulk-deleted",
        "permanent-delete": "question-bulk-permanently-deleted",
    }[payload.action]
    audit.log_admin_action(
        admin_id=admin_user.id,
        action=bulk_audit_action,
        target_type="question",
        target_id=succeeded[0] if succeeded else payload.question_ids[0],
        metadata={"question_ids": succeeded, "count": len(succeeded), "failed_count": len(failed)},
    )
    return ok(
        data=QuestionBulkActionResponse(
            succeeded=succeeded, failed=failed, undo_action=_UNDOABLE_BULK_ACTIONS.get(payload.action),
        ),
        message=f"{len(succeeded)} question(s) updated, {len(failed)} failed.",
    )


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
    if payload.solution_steps is not None:
        updates["solution_steps"] = payload.solution_steps
    if payload.interview_tip is not None:
        updates["interview_tip"] = payload.interview_tip
    if payload.reference_note is not None:
        updates["reference_note"] = payload.reference_note
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
    """Module 8 -- Admin Review: Delete. Phase 15, Part 1 changed this from a
    real `delete()` to a soft delete ("Deletion should NEVER immediately
    remove data" per the brief) -- see `_soft_delete_one` and migration
    0016. Use `permanent_delete_question` for the actual, irreversible row
    delete."""
    _soft_delete_one(question_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-deleted", target_type="question", target_id=question_id,
    )
    return ok(message="Question deleted. It can be restored from the Deleted tab.")


@router.patch("/{question_id}/restore", response_model=ApiResponse[QuestionResponse])
async def restore_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Undoes `delete_question` -- clears `deleted_at`/`deleted_by`, leaving
    whatever `status` the question already had untouched."""
    _restore_one(question_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-restored", target_type="question", target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message="Question restored.")


@router.delete("/{question_id}/permanent", response_model=ApiResponse[None])
async def permanent_delete_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Admin Question Actions' "Permanent Delete (optional final step)" --
    a real, irreversible `delete()`. Usually reached from the Deleted tab
    after `delete_question`, but not technically gated on it."""
    row = _get_question_or_404(question_id)
    _permanent_delete_one(question_id)
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-permanently-deleted",
        target_type="question",
        target_id=question_id,
        metadata={"text_snippet": (row.get("question_text") or "")[:120]},
    )
    return ok(message="Question permanently deleted.")


@router.patch("/{question_id}/archive", response_model=ApiResponse[QuestionResponse])
async def archive_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Admin Question Actions' "Archive Question" -- only from 'approved'
    (published); see `_archive_one`."""
    _archive_one(question_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-archived", target_type="question", target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message="Question archived.")


@router.patch("/{question_id}/unarchive", response_model=ApiResponse[QuestionResponse])
async def unarchive_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Undoes `archive_question` -- back to 'approved'."""
    _unarchive_one(question_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-unarchived", target_type="question", target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message="Question unarchived.")


# =============================================================================
# Phase 13 -- Question Authoring System.
# =============================================================================

@router.post("/assets", response_model=ApiResponse[AssetUploadResponse])
@upload_limit()
async def upload_question_asset(
    request: Request,  # required by slowapi's decorator to read the client IP
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Backs the image/attachment picker in both the Admin Manual Builder
    and the Student Submission form -- the frontend uploads a file here
    first and gets back a public URL, then includes that URL in the JSON
    body of the actual create/submit call. Kept as its own endpoint
    (rather than a multipart form with a dozen other text fields, the way
    `resources.py`'s single-file upload does it) because the authoring
    form has many more fields and can attach MULTIPLE images/attachments.

    Reuses the existing public `interview-images` bucket -- see
    `config.py`'s `QUESTION_ASSET_BUCKET` for why."""
    settings = get_settings()
    is_image = file.content_type in settings.allowed_image_mime_types
    is_pdf = file.content_type == "application/pdf"
    if not is_image and not is_pdf:
        raise AppException("Only PNG, JPEG, WEBP, GIF, or PDF files are accepted.", status_code=415)

    contents = await file.read()
    if len(contents) > _ASSET_MAX_BYTES:
        raise AppException(f"File exceeds the {_ASSET_MAX_BYTES // (1024 * 1024)}MB limit.", status_code=413)
    if len(contents) == 0:
        raise AppException("Uploaded file is empty.", status_code=400)

    extension = (file.filename or "").rsplit(".", 1)[-1].lower()
    if extension not in _ALLOWED_ASSET_EXTENSIONS:
        extension = "png" if is_image else "pdf"

    admin = get_supabase_admin()
    storage_path = f"{current_user.id}/{uuid.uuid4()}.{extension}"
    admin.storage.from_(settings.QUESTION_ASSET_BUCKET).upload(
        storage_path, contents, {"content-type": file.content_type}
    )
    public_url = admin.storage.from_(settings.QUESTION_ASSET_BUCKET).get_public_url(storage_path)

    return ok(
        data=AssetUploadResponse(url=public_url, file_name=file.filename or storage_path, file_size_bytes=len(contents)),
        message="Asset uploaded.",
    )


@router.post("", response_model=ApiResponse[QuestionResponse])
async def create_question_manual(
    payload: QuestionManualCreateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Method 1 -- Admin Manual Builder. `publish=false` (the default)
    saves as a private draft (Draft Management is just `GET /questions
    ?mine=true&status=draft`); `publish=true` runs it straight to
    `approved`, per the brief's "Published questions immediately become
    available throughout the platform." An admin publishing their own
    question is trusted content, same as an AI extraction clearing the
    confidence threshold -- no separate review step."""
    try:
        result = question_authoring.create_question_record(
            type_=payload.type,
            question_text=payload.text,
            options=_options_to_authoring(payload.options),
            correct_explanation=payload.correct_explanation,
            solution_steps=payload.solution_steps,
            interview_tip=payload.interview_tip,
            reference_note=payload.reference_note,
            difficulty=payload.difficulty,
            subject_name=payload.subject,
            topic_name=payload.topic,
            company_name=payload.company_name,
            tags=payload.tags,
            image_urls=payload.image_urls,
            attachment_urls=payload.attachment_urls,
            created_by=admin_user.id,
            source_type="ADMIN_MANUAL",
            submission_method="MANUAL",
            status="approved" if payload.publish else "draft",
            check_duplicates=True,
            block_fuzzy_duplicates=False,
        )
    except question_authoring.QuestionAuthoringError as exc:
        raise AppException(str(exc), status_code=422)

    if result.is_duplicate:
        raise AppException(
            f"An identical question already exists (id: {result.duplicate_of}).", status_code=409
        )

    if payload.publish:
        audit.log_admin_action(
            admin_id=admin_user.id, action="question-published", target_type="question", target_id=result.question_id,
        )

    return ok(
        data=_row_to_response(_get_question_or_404(result.question_id)),
        message="Question published." if payload.publish else "Draft saved.",
    )


@router.patch("/{question_id}/publish", response_model=ApiResponse[QuestionResponse])
async def publish_question(question_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Publishes an existing Admin Manual Builder draft (Draft Management's
    "Publish" action). Re-runs duplicate detection at publish time, not at
    every draft autosave -- a draft in progress shouldn't be blocked by a
    fuzzy match on its still-incomplete text. Shares `_publish_one` with
    `bulk_question_action`'s `publish` case (Phase 15, Part 1)."""
    _publish_one(question_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-published", target_type="question", target_id=question_id,
    )
    return ok(data=_row_to_response(_get_question_or_404(question_id)), message="Question published.")


@router.post("/submissions", response_model=ApiResponse[QuestionResponse])
async def submit_question(
    payload: QuestionAuthoringRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Method 2 -- Student Submission. Always lands as `pending-review` --
    "Students never publish directly" per the brief -- and notifies every
    admin, reusing the exact `notify_admins` call `resources.py`'s upload
    workflow already established."""
    try:
        result = question_authoring.create_question_record(
            type_=payload.type,
            question_text=payload.text,
            options=_options_to_authoring(payload.options),
            correct_explanation=payload.correct_explanation,
            solution_steps=payload.solution_steps,
            interview_tip=payload.interview_tip,
            reference_note=payload.reference_note,
            difficulty=payload.difficulty,
            subject_name=payload.subject,
            topic_name=payload.topic,
            company_name=payload.company_name,
            tags=payload.tags,
            image_urls=payload.image_urls,
            attachment_urls=payload.attachment_urls,
            created_by=current_user.id,
            source_type="STUDENT_MANUAL",
            submission_method="MANUAL",
            status="pending-review",
            check_duplicates=True,
            block_fuzzy_duplicates=False,
        )
    except question_authoring.QuestionAuthoringError as exc:
        raise AppException(str(exc), status_code=422)

    if result.is_duplicate:
        raise AppException(
            f"An identical question already exists (id: {result.duplicate_of}).", status_code=409
        )

    notifications.notify_admins(
        type_="question-pending-review",
        title="New question awaiting review",
        message="A student submitted a question and it's waiting for admin review.",
        link_url="/admin/review",
    )

    return ok(data=_row_to_response(_get_question_or_404(result.question_id)), message="Question submitted for review.")


_VALID_DIFFICULTIES_BULK = {"easy", "medium", "hard"}


def _authoring_request_from_parsed(parsed: question_authoring.ParsedQuestionBlock) -> QuestionAuthoringRequest:
    return QuestionAuthoringRequest(
        type="multi-select" if len(parsed.correct_labels) > 1 else "mcq",
        text=parsed.question_text,
        options=[
            OptionAuthoringRequest(label=o.label, text=o.text, is_correct=o.is_correct) for o in parsed.options
        ],
        correct_explanation=None,
        solution_steps=parsed.solution,
        difficulty=parsed.difficulty if parsed.difficulty in _VALID_DIFFICULTIES_BULK else "medium",
        subject=parsed.subject,
        topic=parsed.topic,
        company_name=parsed.company,
        tags=parsed.tags,
    )


@router.post("/bulk-parse", response_model=ApiResponse[BulkParseResponse])
async def bulk_parse_questions(payload: BulkParseRequest, admin_user: CurrentUser = Depends(require_admin)):
    """Method 3, step 1 -- Smart Bulk Question Parser. Pure text parsing
    (see `question_authoring.parse_bulk_text` -- no AI/LLM call of any
    kind) plus a read-only duplicate lookup against the real Question Bank
    for the preview table; nothing is written to the database here."""
    if not payload.raw_text or not payload.raw_text.strip():
        raise AppException("Paste some question text first.", status_code=422)

    preview_items = question_authoring.parse_bulk_text(payload.raw_text, run_duplicate_check=True)

    items: List[BulkParsePreviewItemResponse] = []
    for item in preview_items:
        items.append(
            BulkParsePreviewItemResponse(
                index=item.index,
                status=item.status,
                warnings=item.warnings,
                raw_block=item.raw_block,
                parsed=_authoring_request_from_parsed(item.parsed) if item.parsed else None,
                duplicate_of_question_id=item.duplicate_of_question_id,
            )
        )

    clean = sum(1 for i in items if i.status == "parsed")
    invalid = sum(1 for i in items if i.status == "invalid")
    warnings_count = len(items) - clean - invalid

    return ok(
        data=BulkParseResponse(
            items=items, total_detected=len(items), total_parsed_clean=clean,
            total_warnings=warnings_count, total_invalid=invalid,
        ),
        message=f"Detected {len(items)} question(s).",
    )


@router.post("/bulk-import", response_model=ApiResponse[BulkImportResponse])
async def bulk_import_questions(payload: BulkImportRequest, admin_user: CurrentUser = Depends(require_admin)):
    """Method 3, step 2 -- Smart Bulk Question Parser: import. Only the
    rows the admin chose to keep (edited or not, in the preview table) are
    sent here. Per the brief -- "highlight the problematic question
    instead of rejecting the entire batch" -- a single bad row never
    aborts the whole import; it's recorded as a per-item result and the
    loop continues."""
    if not payload.items:
        raise AppException("No questions to import.", status_code=422)

    results: List[BulkImportItemResult] = []
    total_imported = 0
    total_duplicate = 0
    total_error = 0

    for idx, item in enumerate(payload.items):
        try:
            result = question_authoring.create_question_record(
                type_=item.type,
                question_text=item.text,
                options=_options_to_authoring(item.options),
                correct_explanation=item.correct_explanation,
                solution_steps=item.solution_steps,
                interview_tip=item.interview_tip,
                reference_note=item.reference_note,
                difficulty=item.difficulty,
                subject_name=item.subject,
                topic_name=item.topic,
                company_name=item.company_name,
                tags=item.tags,
                image_urls=item.image_urls,
                attachment_urls=item.attachment_urls,
                created_by=admin_user.id,
                source_type="BULK_IMPORT",
                submission_method="TEXT",
                status="approved",
                check_duplicates=True,
                block_fuzzy_duplicates=False,  # already surfaced as a warning at parse time; admin's call
            )
        except question_authoring.QuestionAuthoringError as exc:
            total_error += 1
            results.append(BulkImportItemResult(index=idx, imported=False, reason=f"invalid: {exc}"))
            continue
        except APIError as exc:
            # A DB-level failure on this one row (e.g. a constraint
            # violation, or Supabase rejecting a value the earlier
            # validation didn't catch) -- previously unhandled here, which
            # broke the "a single bad row never aborts the whole batch"
            # promise above: it crashed the *entire* request as an
            # unhandled 500 and silently discarded every already-imported
            # row's result along with it, instead of reporting just this
            # one row as failed and continuing.
            logger.exception("bulk-import: row %s failed with a database error", idx)
            total_error += 1
            results.append(BulkImportItemResult(index=idx, imported=False, reason=f"database error: {exc.message}"))
            continue
        except Exception as exc:  # noqa: BLE001 -- deliberate: see comment above
            # Catch-all safety net for anything else unexpected on a single
            # row (bad/missing data shape, a downstream service hiccup,
            # etc.) -- same reasoning as the APIError branch. Logged with
            # the full traceback so it's still visible/debuggable, but it
            # no longer takes the whole import down with it.
            logger.exception("bulk-import: row %s failed unexpectedly", idx)
            total_error += 1
            results.append(BulkImportItemResult(index=idx, imported=False, reason=f"unexpected error: {exc}"))
            continue

        if result.is_duplicate:
            total_duplicate += 1
            results.append(
                BulkImportItemResult(index=idx, imported=False, reason="duplicate", question_id=result.duplicate_of)
            )
            continue

        total_imported += 1
        results.append(BulkImportItemResult(index=idx, imported=True, question_id=result.question_id))

    batch = question_authoring.record_import_batch(
        admin_id=admin_user.id,
        label=payload.label,
        total_detected=len(payload.items),
        total_imported=total_imported,
        total_duplicate=total_duplicate,
        total_error=total_error,
    )
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-bulk-imported",
        target_type="question-import-batch",
        target_id=batch["id"],
        metadata={"total_imported": total_imported, "total_duplicate": total_duplicate, "total_error": total_error},
    )

    return ok(
        data=BulkImportResponse(
            batch_id=batch["id"], total_submitted=len(payload.items), total_imported=total_imported,
            total_duplicate=total_duplicate, total_error=total_error, results=results,
        ),
        message=f"Imported {total_imported} of {len(payload.items)} question(s).",
    )


@router.get("/import-batches", response_model=ApiResponse[List[ImportBatchResponse]])
async def list_import_batches(admin_user: CurrentUser = Depends(require_admin)):
    """Import History -- every past Smart Bulk Parser import run, newest
    first."""
    rows = (
        get_supabase_admin()
        .table("question_import_batches")
        .select("*")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return ok(
        data=[
            ImportBatchResponse(
                id=r["id"], admin_id=r["admin_id"], label=r.get("label"),
                total_detected=r["total_detected"], total_imported=r["total_imported"],
                total_duplicate=r["total_duplicate"], total_error=r["total_error"], created_at=r["created_at"],
            )
            for r in rows
        ],
        message="Import history fetched.",
    )


# =============================================================================
# Phase 15, Part 1 -- Question Lifecycle Management: Analytics (Feature 9,
# scoped to questions -- see QuestionAnalyticsResponse's docstring).
# =============================================================================

_SOURCE_TYPES = ("AI", "ADMIN_MANUAL", "STUDENT_MANUAL", "BULK_IMPORT")


@router.get("/analytics/summary", response_model=ApiResponse[QuestionAnalyticsResponse])
async def question_analytics_summary(admin_user: CurrentUser = Depends(require_admin)):
    """Every count here is a `count="exact"` round trip (or, for growth/
    moderator-activity, a bounded 30-day fetch aggregated in Python) rather
    than one full-table scan -- cheap regardless of how large the Question
    Bank gets, same reasoning as `list_questions`'s own count query."""
    admin_client = get_supabase_admin()

    def _count(**filters: Any) -> int:
        q = admin_client.table("questions").select("id", count="exact")
        for col, val in filters.items():
            q = q.eq(col, val)
        q = q.is_("deleted_at", "null")
        return q.execute().count or 0

    by_status = {s: _count(status=s) for s in _VALID_STATUSES}
    by_source_type = {t: _count(source_type=t) for t in _SOURCE_TYPES}
    total_active = sum(by_status.values())
    deleted_count = (
        admin_client.table("questions").select("id", count="exact").not_.is_("deleted_at", "null").execute().count
        or 0
    )
    approved = by_status.get("approved", 0)
    rejected = by_status.get("rejected", 0)
    approval_rate = round(approved / (approved + rejected), 4) if (approved + rejected) > 0 else 0.0

    batch_rows = admin_client.table("question_import_batches").select("total_duplicate").execute().data or []
    bulk_import_duplicates_total = sum(b.get("total_duplicate", 0) for b in batch_rows)

    window_start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    growth_rows = (
        admin_client.table("questions")
        .select("created_at")
        .is_("deleted_at", "null")
        .gte("created_at", window_start)
        .execute()
        .data
        or []
    )
    day_counts = Counter(r["created_at"][:10] for r in growth_rows)
    growth_last_30_days = [
        GrowthPoint(date=day, count=count) for day, count in sorted(day_counts.items())
    ]

    audit_rows = (
        admin_client.table("admin_audit_logs")
        .select("admin_id")
        .in_("target_type", ["question", "question-import-batch"])
        .gte("created_at", window_start)
        .execute()
        .data
        or []
    )
    activity_counts = Counter(r["admin_id"] for r in audit_rows)
    admin_names: Dict[str, str] = {}
    if activity_counts:
        profile_rows = (
            admin_client.table("profiles").select("id, full_name").in_("id", list(activity_counts.keys())).execute().data
            or []
        )
        admin_names = {p["id"]: p["full_name"] for p in profile_rows}
    moderator_activity = sorted(
        (
            ModeratorActivityEntry(
                admin_id=admin_id, admin_name=admin_names.get(admin_id, "Unknown"), action_count=count,
            )
            for admin_id, count in activity_counts.items()
        ),
        key=lambda entry: entry.action_count,
        reverse=True,
    )

    return ok(
        data=QuestionAnalyticsResponse(
            by_status=by_status,
            by_source_type=by_source_type,
            total_active=total_active,
            deleted_count=deleted_count,
            approval_rate=approval_rate,
            bulk_import_duplicates_total=bulk_import_duplicates_total,
            growth_last_30_days=growth_last_30_days,
            moderator_activity=moderator_activity,
        ),
        message="Question analytics fetched.",
    )
