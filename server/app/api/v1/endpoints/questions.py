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
import uuid
from datetime import datetime, timezone
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
from app.services import audit, notifications, question_authoring, question_merge

router = APIRouter()

_EMBED = (
    "*, "
    "question_options(id, label, option_text, is_correct, order_index), "
    "question_topics(topics(id, name, subject_id, subjects(id, name))), "
    "question_companies(company_id)"
)

# 'draft' is Phase 13 -- Admin Manual Builder rows before publish (see
# migration 0015's docstring for why "draft" was added to the shared
# status column rather than a separate table).
_VALID_STATUSES = {"draft", "pending-review", "approved", "rejected"}
_ASSET_MAX_BYTES = 8 * 1024 * 1024
_ALLOWED_ASSET_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "pdf"}


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
    )


def _apply_server_side_filters(query, *, admin: bool, current_user_id: str, mine: bool, status: Optional[str],
                                difficulty: Optional[str], source_pdf_id: Optional[str],
                                source_type: Optional[str], search: Optional[str]):
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
    status: Optional[str] = Query(None, description="draft | pending-review | approved | rejected -- admin/mine only"),
    source_type: Optional[str] = Query(
        None, description="AI | ADMIN_MANUAL | STUDENT_MANUAL | BULK_IMPORT -- e.g. the Student Question Queue"
    ),
    mine: bool = Query(False, description="Phase 13 -- only questions created_by the current user, any status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(300, ge=1, le=500),
):
    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    filter_kwargs: Dict[str, Any] = dict(
        admin=admin, current_user_id=current_user.id, mine=mine, status=status, difficulty=difficulty,
        source_pdf_id=source_pdf_id, source_type=source_type, search=search,
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

    row = _get_question_or_404(question_id)
    updates = {
        "status": payload.status,
        "reviewed_by": admin_user.id,
        "reviewed_at": _now_iso(),
        "rejection_reason": payload.rejection_reason if payload.status == "rejected" else None,
    }
    get_supabase_admin().table("questions").update(updates).eq("id", question_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="question-approved" if payload.status == "approved" else "question-rejected",
        target_type="question",
        target_id=question_id,
    )

    if row.get("source_type") in ("STUDENT_MANUAL", "ADMIN_MANUAL") and row.get("created_by"):
        notifications.notify(
            user_id=row["created_by"],
            type_="question-approved" if payload.status == "approved" else "question-rejected",
            title=f"Question {payload.status}",
            message=(
                "Your submitted question is now live in the Question Bank."
                if payload.status == "approved"
                else f"Your submitted question was rejected: {payload.rejection_reason}"
            ),
            link_url="/questions",
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
    """Module 8 -- Admin Review: Delete. `question_options`/`question_topics`/
    `question_companies` all reference `questions.id` with ON DELETE CASCADE
    (migration 0001), so this cleans up in one call."""
    _get_question_or_404(question_id)
    get_supabase_admin().table("questions").delete().eq("id", question_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id, action="question-deleted", target_type="question", target_id=question_id,
    )
    return ok(message="Question deleted.")


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
    fuzzy match on its still-incomplete text."""
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
