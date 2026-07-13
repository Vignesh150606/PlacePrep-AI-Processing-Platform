"""
PDF Library endpoints -- upload plus the list/retry/keep-permanent surface
the AI Processing Platform needs.

PHASE 6 CHANGES:
  - `upload_pdf` now accepts PNG/JPG/JPEG in addition to PDF (see
    `app.core.config.Settings.allowed_upload_mime_types`), storing a new
    `file_kind` column so `services/pipeline.py` knows which extraction
    path to use. Kept the endpoint name/route (`/upload`) unchanged so the
    existing frontend `useUploadPdf()` hook needs no changes -- only the
    accepted `accept="application/pdf"` attribute in the dropzone would
    need loosening on the frontend side to actually let a user pick an
    image in the file browser (noted in FUNCTIONAL_RECOMMENDATIONS.md).
  - `list_pdfs` gained real `page`/`pageSize` query params instead of a
    flat `limit`, matching `shared/src/types/common.ts`'s already-defined
    (and previously unused) `PaginationParams`/`PaginatedResult` shape.
  - `upload_pdf` is rate-limited (10/minute per IP by default) since each
    call can fan out into several Gemini API calls.
  - New `stream_pdf_status` -- Server-Sent Events endpoint so the frontend
    can show live processing status instead of the existing 3s poll (see
    FUNCTIONAL_RECOMMENDATIONS.md item #2 from the UI/UX pass; this is the
    backend half, the frontend switch-over is intentionally left to
    whichever session owns `client/`, same boundary as before).

PHASE 7 CHANGES -- upload approval workflow: `upload_pdf` no longer queues
the AI pipeline immediately. A fresh upload now lands in `pending-approval`
and does nothing further until an admin calls the new `approve_pdf` (which
is what actually creates the processing job and kicks off the background
task) or `reject_pdf`. This was a genuine gap, not a stylistic preference:
the previous flow meant any authenticated student upload -- including
duplicates, junk, or abuse -- consumed a real Gemini API call before a
human ever looked at it. `list_pdfs` also gained an optional `status`
filter so the admin UI can query the pending-approval queue directly
instead of filtering a full page client-side. `retry_pdf` now also
enforces `MAX_EXTRACTION_ATTEMPTS` for real (previously stored in config
but never actually checked anywhere -- every manual retry created a fresh
job with no ceiling).
"""
import asyncio
import json
import time
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from fastapi.responses import StreamingResponse
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.core.config import get_settings
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.core.rate_limit import upload_limit
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, notifications, pipeline

router = APIRouter()

_TERMINAL_STATUSES = {"completed", "failed", "rejected"}
_VALID_LIST_STATUSES = {
    "uploaded",
    "pending-approval",
    "queued",
    "processing",
    "completed",
    "failed",
    "rejected",
}
# Safety valve on the SSE endpoint -- a job that's still "processing" after
# this long almost certainly means the background task died without
# updating status (or the deploy restarted mid-job); stop streaming rather
# than hold the HTTP connection open forever.
_STREAM_MAX_SECONDS = 180
_STREAM_POLL_SECONDS = 1.0


class PdfResourceResponse(CamelModel):
    id: str
    title: str
    description: Optional[str]
    file_name: str
    file_size_bytes: int
    file_kind: str
    uploaded_by: str
    company_id: Optional[str]
    subject_id: Optional[str]
    topic_id: Optional[str]
    processing_status: str
    keep_permanent: bool
    extracted_question_count: int
    error_message: Optional[str]
    uploaded_at: str
    processed_at: Optional[str]
    # Phase 7 -- upload approval workflow.
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None


class PdfResourceListResponse(CamelModel):
    items: List[PdfResourceResponse]
    total: int
    page: int
    page_size: int


class KeepPermanentUpdateRequest(CamelModel):
    keep_permanent: bool = Field(...)


class RejectPdfRequest(CamelModel):
    reason: str = Field(..., min_length=1, max_length=1000)


def _row_to_response(row: Dict[str, Any]) -> PdfResourceResponse:
    # `file_kind` is new (migration 0006); default any pre-migration row
    # that predates the column to "pdf" so this response model never 500s
    # on old data. Same idea for the Phase 7 approval columns, which are
    # `None` for any row that predates migration 0007.
    row = {
        **row,
        "file_kind": row.get("file_kind") or "pdf",
        "reviewed_by": row.get("reviewed_by"),
        "reviewed_at": row.get("reviewed_at"),
        "rejection_reason": row.get("rejection_reason"),
    }
    return PdfResourceResponse(**row)


@router.get("", response_model=ApiResponse[PdfResourceListResponse])
async def list_pdfs(
    current_user: CurrentUser = Depends(get_current_user),
    page: int = 1,
    page_size: int = 50,
    status: Optional[str] = None,
):
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    start = (page - 1) * page_size
    end = start + page_size - 1

    if status is not None and status not in _VALID_LIST_STATUSES:
        raise AppException(f"Invalid status filter: {status}", status_code=422)

    admin = get_supabase_admin()
    count_query = admin.table("pdf_resources").select("id", count="exact")
    list_query = admin.table("pdf_resources").select("*").order("uploaded_at", desc=True).range(start, end)
    if status is not None:
        count_query = count_query.eq("processing_status", status)
        list_query = list_query.eq("processing_status", status)

    count_result = count_query.execute()
    result = list_query.execute()
    items = [_row_to_response(r) for r in result.data or []]
    return ok(
        data=PdfResourceListResponse(items=items, total=count_result.count or 0, page=page, page_size=page_size),
        message="PDFs fetched.",
    )


@router.post("/upload", response_model=ApiResponse[PdfResourceResponse])
@upload_limit()
async def upload_pdf(
    request: Request,  # required by slowapi's decorator to read the client IP
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    company_id: Optional[str] = Form(None),
    subject_id: Optional[str] = Form(None),
    topic_id: Optional[str] = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    settings = get_settings()

    is_pdf = file.content_type in settings.allowed_pdf_mime_types
    is_image = file.content_type in settings.allowed_image_mime_types
    if not is_pdf and not is_image:
        raise AppException(
            "Only PDF, PNG, or JPEG files are accepted.", status_code=415
        )
    file_kind = "pdf" if is_pdf else "image"

    contents = await file.read()
    max_bytes = settings.MAX_PDF_SIZE_BYTES if is_pdf else settings.MAX_IMAGE_SIZE_BYTES
    if len(contents) > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise AppException(f"File exceeds the {max_mb}MB limit.", status_code=413)
    if len(contents) == 0:
        raise AppException("Uploaded file is empty.", status_code=400)

    extension = "pdf" if is_pdf else (file.content_type.split("/")[-1] or "jpg")
    storage_path = f"{current_user.id}/{uuid.uuid4()}.{extension}"
    admin = get_supabase_admin()

    admin.storage.from_(settings.PDF_STORAGE_BUCKET).upload(
        storage_path, contents, {"content-type": file.content_type}
    )

    pdf_row = (
        admin.table("pdf_resources")
        .insert(
            {
                "title": title or file.filename or "Untitled upload",
                "description": description,
                "file_name": file.filename or f"upload.{extension}",
                "file_size_bytes": len(contents),
                "file_kind": file_kind,
                "storage_path": storage_path,
                "uploaded_by": current_user.id,
                "company_id": company_id or None,
                "subject_id": subject_id or None,
                "topic_id": topic_id or None,
                # Phase 7: uploads no longer trigger AI extraction directly.
                # An admin must approve first (see `approve_pdf` below) --
                # students should never single-handedly consume Gemini API
                # quota just by uploading.
                "processing_status": "pending-approval",
            }
        )
        .execute()
        .data[0]
    )

    notifications.notify_admins(
        type_="upload-pending-approval",
        title="New upload awaiting approval",
        message=f'"{pdf_row["file_name"]}" was uploaded by a student and is waiting for approval before AI extraction can run.',
        link_url="/pdfs",
    )

    return ok(data=_row_to_response(pdf_row), message="File uploaded. It's now waiting for admin approval.")


def _get_pdf_or_404(pdf_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("pdf_resources").select("*").eq("id", pdf_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("File not found.")
        raise
    return result.data


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


@router.post("/{pdf_id}/approve", response_model=ApiResponse[PdfResourceResponse])
async def approve_pdf(
    pdf_id: str,
    background_tasks: BackgroundTasks,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Phase 7: the ONLY path that actually starts AI extraction. A fresh
    upload sits in `pending-approval` until an admin calls this -- see the
    module docstring for why this gate exists."""
    row = _get_pdf_or_404(pdf_id)
    if row["processing_status"] != "pending-approval":
        raise AppException(
            f"Only uploads awaiting approval can be approved (current status: {row['processing_status']}).",
            status_code=409,
        )

    admin = get_supabase_admin()
    updated = (
        admin.table("pdf_resources")
        .update({"reviewed_by": admin_user.id, "reviewed_at": _now_iso()})
        .eq("id", pdf_id)
        .execute()
        .data[0]
    )

    job = pipeline.create_job(pdf_id)
    background_tasks.add_task(pipeline.run_pipeline, job["id"])

    updated["processing_status"] = "queued"
    notifications.notify(
        user_id=row["uploaded_by"],
        type_="upload-approved",
        title="Upload approved",
        message=f'"{row["file_name"]}" was approved and extraction has started.',
        link_url="/pdfs",
    )
    audit.log_admin_action(
        admin_id=admin_user.id, action="pdf-approved", target_type="pdf", target_id=pdf_id,
        metadata={"file_name": row["file_name"]},
    )
    return ok(data=_row_to_response(updated), message="Upload approved and extraction queued.")


@router.post("/{pdf_id}/reject", response_model=ApiResponse[PdfResourceResponse])
async def reject_pdf(
    pdf_id: str,
    payload: RejectPdfRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    row = _get_pdf_or_404(pdf_id)
    if row["processing_status"] != "pending-approval":
        raise AppException(
            f"Only uploads awaiting approval can be rejected (current status: {row['processing_status']}).",
            status_code=409,
        )

    updated = (
        get_supabase_admin()
        .table("pdf_resources")
        .update(
            {
                "processing_status": "rejected",
                "reviewed_by": admin_user.id,
                "reviewed_at": _now_iso(),
                "rejection_reason": payload.reason,
            }
        )
        .eq("id", pdf_id)
        .execute()
        .data[0]
    )

    notifications.notify(
        user_id=row["uploaded_by"],
        type_="upload-rejected",
        title="Upload rejected",
        message=f'"{row["file_name"]}" was rejected: {payload.reason}',
        link_url="/pdfs",
    )
    audit.log_admin_action(
        admin_id=admin_user.id, action="pdf-rejected", target_type="pdf", target_id=pdf_id,
        metadata={"file_name": row["file_name"], "reason": payload.reason},
    )
    return ok(data=_row_to_response(updated), message="Upload rejected.")


@router.post("/{pdf_id}/retry", response_model=ApiResponse[PdfResourceResponse])
async def retry_pdf(
    pdf_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    row = _get_pdf_or_404(pdf_id)
    if row["processing_status"] != "failed":
        raise AppException("Only failed uploads can be retried.", status_code=409)
    if row["uploaded_by"] != current_user.id:
        admin_check = (
            get_supabase_admin().table("profiles").select("role_id").eq("id", current_user.id).single().execute()
        )
        if not admin_check.data or admin_check.data.get("role_id") != 3:
            raise ForbiddenError("Only the uploader or an admin can retry this file.")

    # PHASE 7 FIX: `MAX_EXTRACTION_ATTEMPTS` existed in config but was never
    # actually enforced anywhere -- every manual retry created a brand new
    # `processing_jobs` row with no ceiling, so a permanently-broken file
    # (bad API key, always-corrupt PDF, etc.) could be retried forever.
    settings = get_settings()
    prior_attempts = (
        get_supabase_admin()
        .table("processing_jobs")
        .select("id", count="exact")
        .eq("pdf_resource_id", pdf_id)
        .execute()
    )
    if (prior_attempts.count or 0) >= settings.MAX_EXTRACTION_ATTEMPTS:
        raise AppException(
            f"This file has already reached the maximum of {settings.MAX_EXTRACTION_ATTEMPTS} extraction "
            "attempts. An admin will need to review it directly rather than retrying again.",
            status_code=409,
        )

    job = pipeline.create_job(pdf_id)
    background_tasks.add_task(pipeline.run_pipeline, job["id"])

    row["processing_status"] = "queued"
    row["error_message"] = None
    return ok(data=_row_to_response(row), message="Retry queued.")


@router.patch("/{pdf_id}/keep-permanent", response_model=ApiResponse[PdfResourceResponse])
async def set_keep_permanent(
    pdf_id: str,
    payload: KeepPermanentUpdateRequest,
    _admin: CurrentUser = Depends(require_admin),
):
    _get_pdf_or_404(pdf_id)
    updated = (
        get_supabase_admin()
        .table("pdf_resources")
        .update({"keep_permanent": payload.keep_permanent})
        .eq("id", pdf_id)
        .execute()
        .data[0]
    )
    return ok(data=_row_to_response(updated), message="Storage policy updated.")


async def _status_event_stream(pdf_id: str, user_id: str) -> AsyncIterator[str]:
    """Polls the DB server-side (not the client) and yields a Server-Sent
    Event only when the status actually changes, terminating once the job
    reaches a terminal state or `_STREAM_MAX_SECONDS` elapses. This trades
    one more DB read/second (while a job is genuinely in flight, which is
    normally a handful of seconds) for eliminating the frontend's
    3-second blind poll and its associated request-per-tick overhead."""
    admin = get_supabase_admin()
    last_status: Optional[str] = None
    started = time.monotonic()

    while time.monotonic() - started < _STREAM_MAX_SECONDS:
        try:
            row = admin.table("pdf_resources").select("*").eq("id", pdf_id).eq("uploaded_by", user_id).single().execute().data
        except APIError as exc:
            if exc.code == "PGRST116":
                yield _sse_event({"error": "File not found."})
                return
            raise

        status = row["processing_status"]
        if status != last_status:
            last_status = status
            yield _sse_event(
                {
                    "processingStatus": status,
                    "extractedQuestionCount": row.get("extracted_question_count", 0),
                    "errorMessage": row.get("error_message"),
                }
            )

        if status in _TERMINAL_STATUSES:
            return

        await asyncio.sleep(_STREAM_POLL_SECONDS)

    yield _sse_event({"timeout": True, "processingStatus": last_status})


def _sse_event(data: Dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.get("/{pdf_id}/status-stream")
async def stream_pdf_status(pdf_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Server-Sent Events endpoint: emits a JSON event every time this
    upload's processing_status changes, then closes. Auth via the same
    Bearer-token dependency as every other endpoint -- SSE doesn't get any
    special treatment; EventSource on the frontend would need to be
    polyfilled or replaced with a fetch-based reader to attach the
    Authorization header, since the browser's native EventSource can't set
    custom headers (documented for whoever picks up the frontend half)."""
    _get_pdf_or_404(pdf_id)  # 404s before opening the stream if the id is wrong
    return StreamingResponse(
        _status_event_stream(pdf_id, current_user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
