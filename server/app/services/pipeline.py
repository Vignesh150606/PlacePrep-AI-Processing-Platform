"""
The pipeline (Steps 4-11): Queued -> Processing -> AI Extraction ->
Validation -> Duplicate Detection -> Classification -> Storage ->
Cleanup -> Notification.

Two entry points, both called from `app/api/v1/endpoints/pdfs.py` /
`processing.py`:

  create_job(pdf_resource_id)  — inserts a new `processing_jobs` row for
                                  a fresh attempt (initial upload or retry).
  run_pipeline(job_id)         — does the actual work. Designed to run as a
                                  FastAPI `BackgroundTask` (see technical
                                  debt note in PROJECT_STATE.md about
                                  moving this to a real queue).
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from app.core.config import get_settings
from app.core.supabase_client import get_supabase_admin
from app.services import classification, notifications
from app.services.ai.base import AIProviderError
from app.services.ai.service import get_ai_service
from app.services.duplicate import check_duplicate, compute_content_hash
from app.services.pdf_text import PdfTextExtractionError, extract_text

logger = logging.getLogger(__name__)

_VALID_TYPES = {"mcq", "multi-select", "coding", "subjective"}
_VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(pdf_resource_id: str) -> Dict[str, Any]:
    admin = get_supabase_admin()
    job = (
        admin.table("processing_jobs")
        .insert(
            {
                "pdf_resource_id": pdf_resource_id,
                "status": "queued",
                "max_attempts": get_settings().MAX_EXTRACTION_ATTEMPTS,
            }
        )
        .execute()
    )
    admin.table("pdf_resources").update({"processing_status": "queued"}).eq("id", pdf_resource_id).execute()
    return job.data[0]


def _is_valid(item) -> bool:
    if not item.question_text or not item.question_text.strip():
        return False
    if item.type not in _VALID_TYPES:
        return False
    if item.difficulty not in _VALID_DIFFICULTIES:
        return False
    if item.type in ("mcq", "multi-select"):
        if len(item.options) < 2:
            return False
        if not any(opt.is_correct for opt in item.options):
            return False
    return True


async def run_pipeline(job_id: str) -> None:
    admin = get_supabase_admin()

    job_row = admin.table("processing_jobs").select("*").eq("id", job_id).single().execute().data
    pdf_id = job_row["pdf_resource_id"]
    pdf_row = admin.table("pdf_resources").select("*").eq("id", pdf_id).single().execute().data
    uploader_id = pdf_row["uploaded_by"]
    settings = get_settings()

    admin.table("processing_jobs").update(
        {"status": "running", "attempts": 1, "started_at": _now_iso()}
    ).eq("id", job_id).execute()
    admin.table("pdf_resources").update({"processing_status": "processing"}).eq("id", pdf_id).execute()

    notifications.notify(
        user_id=uploader_id,
        type_="extraction-started",
        title="Extraction started",
        message=f'We started extracting questions from "{pdf_row["file_name"]}".',
    )

    inserted_count = 0
    duplicate_count = 0
    low_confidence_count = 0
    rejected_count = 0

    try:
        file_bytes = admin.storage.from_(settings.PDF_STORAGE_BUCKET).download(pdf_row["storage_path"])
        document_text = extract_text(file_bytes)

        ai_service = get_ai_service()
        result = await ai_service.extract_questions(document_text=document_text, source_hint=pdf_row["file_name"])

        for item in result.questions:
            if not _is_valid(item):
                rejected_count += 1
                continue

            content_hash = compute_content_hash(item.question_text)
            dup = check_duplicate(
                item.question_text, content_hash, question_type=item.type, difficulty=item.difficulty
            )
            if dup.is_duplicate:
                duplicate_count += 1
                continue

            classified = classification.classify(
                subject_name=item.subject,
                topic_name=item.topic,
                company_name=item.company,
                confidence=item.confidence,
            )
            if classified.status == "pending-review":
                low_confidence_count += 1

            question_row = (
                admin.table("questions")
                .insert(
                    {
                        "type": item.type,
                        "question_text": item.question_text,
                        "content_hash": content_hash,
                        "correct_explanation": item.correct_explanation,
                        "difficulty": item.difficulty,
                        "source_pdf_id": pdf_id,
                        "status": classified.status,
                        "tags": item.tags,
                        "created_by": uploader_id,
                        "confidence_score": item.confidence,
                        "ai_provider": result.provider_name,
                    }
                )
                .execute()
            )
            question_id = question_row.data[0]["id"]

            if item.options:
                admin.table("question_options").insert(
                    [
                        {
                            "question_id": question_id,
                            "label": opt.label,
                            "option_text": opt.text,
                            "is_correct": opt.is_correct,
                            "order_index": idx,
                        }
                        for idx, opt in enumerate(item.options)
                    ]
                ).execute()

            if classified.topic_id:
                admin.table("question_topics").insert(
                    {"question_id": question_id, "topic_id": classified.topic_id}
                ).execute()

            if classified.company_id:
                admin.table("question_companies").insert(
                    {"question_id": question_id, "company_id": classified.company_id}
                ).execute()

            inserted_count += 1

        _finish_success(
            admin,
            job_id=job_id,
            pdf_id=pdf_id,
            uploader_id=uploader_id,
            pdf_row=pdf_row,
            inserted_count=inserted_count,
            duplicate_count=duplicate_count,
            low_confidence_count=low_confidence_count,
            settings=settings,
        )

    except (PdfTextExtractionError, AIProviderError) as exc:
        _finish_failure(admin, job_id=job_id, pdf_id=pdf_id, uploader_id=uploader_id, pdf_row=pdf_row, error=str(exc))
    except Exception as exc:  # noqa: BLE001 — never let an unexpected error leave a job stuck in "running"
        logger.exception("Unexpected pipeline failure for job %s", job_id)
        _finish_failure(
            admin,
            job_id=job_id,
            pdf_id=pdf_id,
            uploader_id=uploader_id,
            pdf_row=pdf_row,
            error=f"Unexpected error: {exc}",
        )


def _finish_success(
    admin,
    *,
    job_id: str,
    pdf_id: str,
    uploader_id: str,
    pdf_row: Dict[str, Any],
    inserted_count: int,
    duplicate_count: int,
    low_confidence_count: int,
    settings,
) -> None:
    admin.table("processing_jobs").update(
        {
            "status": "completed",
            "questions_extracted": inserted_count,
            "duplicates_found": duplicate_count,
            "low_confidence_count": low_confidence_count,
            "completed_at": _now_iso(),
        }
    ).eq("id", job_id).execute()

    admin.table("pdf_resources").update(
        {
            "processing_status": "completed",
            "extracted_question_count": pdf_row["extracted_question_count"] + inserted_count,
            "processed_at": _now_iso(),
        }
    ).eq("id", pdf_id).execute()

    # Cleanup (Step 10): temporary PDFs are deleted after a successful
    # extraction; KEEP_PERMANENT-marked PDFs are left in storage.
    if not pdf_row.get("keep_permanent"):
        try:
            admin.storage.from_(settings.PDF_STORAGE_BUCKET).remove([pdf_row["storage_path"]])
        except Exception:  # noqa: BLE001 — don't fail a successful extraction over cleanup
            logger.exception("Failed to delete temporary PDF %s after extraction", pdf_row["storage_path"])

    summary = f"Extracted {inserted_count} question(s) from \"{pdf_row['file_name']}\"."
    if duplicate_count:
        summary += f" {duplicate_count} duplicate(s) skipped."
    if low_confidence_count:
        summary += f" {low_confidence_count} flagged for review."

    notifications.notify(
        user_id=uploader_id,
        type_="extraction-complete",
        title="Extraction complete",
        message=summary,
        link_url="/pdfs",
    )

    if inserted_count > 0:
        notifications.notify(
            user_id=uploader_id,
            type_="questions-added",
            title="Question Bank updated",
            message=f"{inserted_count} new question(s) added from \"{pdf_row['file_name']}\".",
            link_url="/questions",
        )


def _finish_failure(admin, *, job_id: str, pdf_id: str, uploader_id: str, pdf_row: Dict[str, Any], error: str) -> None:
    admin.table("processing_jobs").update(
        {"status": "failed", "error_message": error, "completed_at": _now_iso()}
    ).eq("id", job_id).execute()

    admin.table("pdf_resources").update(
        {"processing_status": "failed", "error_message": error}
    ).eq("id", pdf_id).execute()

    notifications.notify(
        user_id=uploader_id,
        type_="extraction-failed",
        title="Extraction failed",
        message=f'We couldn\'t extract questions from "{pdf_row["file_name"]}": {error}',
        link_url="/pdfs",
    )
