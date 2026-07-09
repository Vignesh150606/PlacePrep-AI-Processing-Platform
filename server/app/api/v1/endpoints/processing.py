"""
Processing Dashboard (Step 9). Admin-gated.
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, require_admin
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_JOB_STATUSES = ("queued", "running", "completed", "failed")


class DashboardStats(CamelModel):
    queued_jobs: int
    running_jobs: int
    completed_jobs: int
    failed_jobs: int
    questions_extracted_total: int
    duplicates_found_total: int
    pending_review_count: int
    approved_count: int
    average_confidence: Optional[float]
    ocr_jobs_total: int


class ProcessingJobResponse(CamelModel):
    id: str
    pdf_resource_id: str
    pdf_file_name: Optional[str]
    status: str
    attempts: int
    max_attempts: int
    questions_extracted: int
    duplicates_found: int
    low_confidence_count: int
    ocr_used: bool
    chunk_count: int
    error_message: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    created_at: str


class ProcessingJobListResponse(CamelModel):
    items: List[ProcessingJobResponse]


@router.get("/dashboard", response_model=ApiResponse[DashboardStats])
async def get_dashboard(_admin: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()

    job_counts: Dict[str, int] = {}
    for status in _JOB_STATUSES:
        result = (
            admin.table("processing_jobs")
            .select("id", count="exact")
            .eq("status", status)
            .execute()
        )
        job_counts[status] = result.count or 0

    completed_jobs = (
        admin.table("processing_jobs")
        .select("questions_extracted, duplicates_found, ocr_used")
        .eq("status", "completed")
        .limit(1000)
        .execute()
    )
    questions_total = sum(row["questions_extracted"] for row in completed_jobs.data or [])
    duplicates_total = sum(row["duplicates_found"] for row in completed_jobs.data or [])
    ocr_jobs_total = sum(1 for row in completed_jobs.data or [] if row.get("ocr_used"))

    pending = (
        admin.table("questions").select("id", count="exact").eq("status", "pending-review").execute()
    )
    approved = admin.table("questions").select("id", count="exact").eq("status", "approved").execute()

    confidence_rows = (
        admin.table("questions")
        .select("confidence_score")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
    )
    scores = [row["confidence_score"] for row in confidence_rows.data or [] if row.get("confidence_score") is not None]
    avg_confidence = round(sum(scores) / len(scores), 3) if scores else None

    stats = DashboardStats(
        queued_jobs=job_counts["queued"],
        running_jobs=job_counts["running"],
        completed_jobs=job_counts["completed"],
        failed_jobs=job_counts["failed"],
        questions_extracted_total=questions_total,
        duplicates_found_total=duplicates_total,
        pending_review_count=pending.count or 0,
        approved_count=approved.count or 0,
        average_confidence=avg_confidence,
        ocr_jobs_total=ocr_jobs_total,
    )
    return ok(data=stats, message="Dashboard stats fetched.")


@router.get("/jobs", response_model=ApiResponse[ProcessingJobListResponse])
async def list_jobs(_admin: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()
    jobs = admin.table("processing_jobs").select("*").order("created_at", desc=True).limit(100).execute().data or []

    pdf_ids = list({j["pdf_resource_id"] for j in jobs})
    pdf_names: Dict[str, str] = {}
    if pdf_ids:
        pdfs = admin.table("pdf_resources").select("id, file_name").in_("id", pdf_ids).execute().data or []
        pdf_names = {p["id"]: p["file_name"] for p in pdfs}

    items = [
        ProcessingJobResponse(
            **{
                **j,
                "pdf_file_name": pdf_names.get(j["pdf_resource_id"]),
                "ocr_used": j.get("ocr_used", False),
                "chunk_count": j.get("chunk_count", 1),
            }
        )
        for j in jobs
    ]
    return ok(data=ProcessingJobListResponse(items=items), message="Jobs fetched.")
