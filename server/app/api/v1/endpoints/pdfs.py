"""
PDF Library endpoints — upload (Step 1, extended for this sprint) plus the
list/retry/keep-permanent surface the AI Processing Platform needs.

Upload flow: client uploads the file to this endpoint (never directly to
Supabase Storage with a client-side key, and never straight to Gemini —
see SECURITY in the sprint brief). This endpoint writes the file to the
`pdfs` bucket via the service-role client, inserts the `pdf_resources` row,
creates a `processing_jobs` row, and schedules the pipeline as a
`BackgroundTask` so the HTTP response returns immediately with the new
PDF in `queued` state.
"""
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.core.config import get_settings
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import pipeline

router = APIRouter()


class PdfResourceResponse(CamelModel):
    id: str
    title: str
    description: Optional[str]
    file_name: str
    file_size_bytes: int
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


class PdfResourceListResponse(CamelModel):
    items: List[PdfResourceResponse]
    total: int


class KeepPermanentUpdateRequest(CamelModel):
    keep_permanent: bool = Field(...)


def _row_to_response(row: Dict[str, Any]) -> PdfResourceResponse:
    return PdfResourceResponse(**row)


@router.get("", response_model=ApiResponse[PdfResourceListResponse])
async def list_pdfs(current_user: CurrentUser = Depends(get_current_user)):
    result = (
        get_supabase_admin()
        .table("pdf_resources")
        .select("*")
        .order("uploaded_at", desc=True)
        .limit(200)
        .execute()
    )
    items = [_row_to_response(r) for r in result.data or []]
    return ok(data=PdfResourceListResponse(items=items, total=len(items)), message="PDFs fetched.")


@router.post("/upload", response_model=ApiResponse[PdfResourceResponse])
async def upload_pdf(
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

    # Never trust the frontend's own check (shared/PDF_UPLOAD_CONSTRAINTS) —
    # re-validate MIME type and size here, authoritatively.
    if file.content_type not in settings.allowed_pdf_mime_types:
        raise AppException("Only PDF files are accepted.", status_code=415)

    contents = await file.read()
    if len(contents) > settings.MAX_PDF_SIZE_BYTES:
        max_mb = settings.MAX_PDF_SIZE_BYTES // (1024 * 1024)
        raise AppException(f"File exceeds the {max_mb}MB limit.", status_code=413)
    if len(contents) == 0:
        raise AppException("Uploaded file is empty.", status_code=400)

    storage_path = f"{current_user.id}/{uuid.uuid4()}.pdf"
    admin = get_supabase_admin()

    admin.storage.from_(settings.PDF_STORAGE_BUCKET).upload(
        storage_path, contents, {"content-type": "application/pdf"}
    )

    pdf_row = (
        admin.table("pdf_resources")
        .insert(
            {
                "title": title or file.filename or "Untitled PDF",
                "description": description,
                "file_name": file.filename or "upload.pdf",
                "file_size_bytes": len(contents),
                "storage_path": storage_path,
                "uploaded_by": current_user.id,
                "company_id": company_id or None,
                "subject_id": subject_id or None,
                "topic_id": topic_id or None,
                "processing_status": "uploaded",
            }
        )
        .execute()
        .data[0]
    )

    job = pipeline.create_job(pdf_row["id"])
    background_tasks.add_task(pipeline.run_pipeline, job["id"])

    pdf_row["processing_status"] = "queued"
    return ok(data=_row_to_response(pdf_row), message="PDF uploaded and queued for extraction.")


def _get_pdf_or_404(pdf_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("pdf_resources").select("*").eq("id", pdf_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("PDF not found.")
        raise
    return result.data


@router.post("/{pdf_id}/retry", response_model=ApiResponse[PdfResourceResponse])
async def retry_pdf(
    pdf_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    row = _get_pdf_or_404(pdf_id)
    if row["processing_status"] != "failed":
        raise AppException("Only failed PDFs can be retried.", status_code=409)
    if row["uploaded_by"] != current_user.id:
        # Owner or admin only — checked lazily here rather than via
        # `require_admin` since a non-admin owner should still be able to
        # retry their own failed upload.
        admin_check = (
            get_supabase_admin().table("profiles").select("role_id").eq("id", current_user.id).single().execute()
        )
        if not admin_check.data or admin_check.data.get("role_id") != 3:
            raise ForbiddenError("Only the uploader or an admin can retry this PDF.")

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
