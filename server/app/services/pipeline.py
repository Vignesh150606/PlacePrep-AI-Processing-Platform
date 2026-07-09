"""
The pipeline (Steps 4-11): Queued -> Processing -> AI Extraction ->
Validation -> Duplicate Detection -> Classification -> Storage ->
Cleanup -> Notification.

Two entry points, both called from `app/api/v1/endpoints/pdfs.py`:

  create_job(pdf_resource_id)  — inserts a new `processing_jobs` row for
                                  a fresh attempt (initial upload or retry).
  run_pipeline(job_id)         — does the actual work. Designed to run as a
                                  FastAPI `BackgroundTask` (see technical
                                  debt note in PROJECT_STATE.md about
                                  moving this to a real queue).

SPRINT 4 FIXES — "extracts zero questions from MCQ PDFs" investigation:
Four independent causes were traced and fixed, each isolated in its own
module so they can be reasoned about (and tested) separately:
  1. Scanned/image-only PDFs (services/ocr.py + services/pdf_text.py's
     quality check) — previously either failed outright or silently
     extracted near-empty "text" (running headers only) that Gemini
     correctly returned zero questions for.
  2. Weak prompting (services/ai/gemini_provider.py) — no instruction for
     "never skip/summarize" or how to use a separate answer key.
  3. Answer key parsing (services/answer_key.py) — a key section in a
     different part of the document (or different chunk, post-#4) than the
     questions it belongs to.
  4. Large document chunking (services/chunking.py) — a single call over an
     entire long paper both risks truncated model output and dilutes
     attention; now bounded per-chunk with merge + intra-run dedupe below.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from app.core.config import get_settings
from app.core.supabase_client import get_supabase_admin
from app.services import answer_key, chunking, classification, notifications, ocr
from app.services.ai.base import AIProviderError, ExtractedQuestion
from app.services.ai.service import get_ai_service
from app.services.duplicate import check_duplicate, compute_content_hash
from app.services.pdf_text import PdfTextExtractionError, extract_text_with_quality

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


def _is_valid(item: ExtractedQuestion) -> bool:
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


def _page_offset_hint(chunk_index: int, chunk_total: int, page_count: int) -> str:
    if chunk_total <= 1 or page_count <= 0:
        return f"pages 1-{page_count}" if page_count > 0 else "unknown"
    pages_per_chunk = max(1, round(page_count / chunk_total))
    start = chunk_index * pages_per_chunk + 1
    end = min(page_count, (chunk_index + 1) * pages_per_chunk)
    return f"approximately pages {start}-{max(start, end)} of {page_count}"


async def _extract_document_text(pdf_row: Dict[str, Any], file_bytes: bytes) -> Tuple[str, bool, int]:
    """Returns (full_text, ocr_used, page_count). Tries native PDF text
    first; falls back to OCR only when that text looks too sparse to be
    real content (Sprint 4 fix #1/#3)."""
    settings = get_settings()
    result = extract_text_with_quality(file_bytes)

    if not result.is_low_quality() and result.full_text.strip():
        return result.full_text, False, result.page_count

    if not settings.OCR_ENABLED or not ocr.is_available():
        if result.full_text.strip():
            # Low quality but non-empty and OCR isn't available — better to
            # try extraction on what we have than fail outright.
            logger.warning(
                "PDF '%s' looks scanned/low-text (%.1f chars/page) but OCR is unavailable; "
                "proceeding with native extraction anyway.",
                pdf_row.get("file_name"),
                result.chars_per_page,
            )
            return result.full_text, False, result.page_count
        raise PdfTextExtractionError(
            "No selectable text found in this PDF and OCR is not available on this server. "
            "See server/README.md for the tesseract-ocr / poppler-utils install step."
        )

    logger.info(
        "PDF '%s' looks scanned (%.1f chars/page across %d pages) — falling back to OCR.",
        pdf_row.get("file_name"),
        result.chars_per_page,
        result.page_count,
    )
    ocr_text = ocr.ocr_pdf_bytes(file_bytes)
    if ocr_text.strip():
        return ocr_text, True, result.page_count

    # OCR didn't help either — fall back to whatever native text we had
    # (possibly nothing), and let the final empty-text check below decide.
    if result.full_text.strip():
        return result.full_text, False, result.page_count

    raise PdfTextExtractionError(
        "No selectable text found in this PDF, and OCR did not recover any either. "
        "This file may be a low-quality scan or contain no text content."
    )


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
    ocr_used = False
    chunk_count = 1

    try:
        file_bytes = admin.storage.from_(settings.PDF_STORAGE_BUCKET).download(pdf_row["storage_path"])
        document_text, ocr_used, page_count = await _extract_document_text(pdf_row, file_bytes)

        # Sprint 4 fix — pull a trailing "Answer Key" section out before
        # chunking so it can be attached to every chunk's prompt rather than
        # only whichever chunk it physically landed in.
        split = answer_key.split_answer_key(document_text)
        chunks = chunking.split_into_chunks(split.body_text)
        chunk_count = len(chunks)

        ai_service = get_ai_service()

        # Merge extracted questions across all chunks, then de-duplicate
        # WITHIN this run (before the cross-run DB duplicate check below) —
        # chunk overlap (chunking.CHUNK_OVERLAP_CHARS) means the same
        # question can legitimately get extracted twice from two adjacent
        # chunks.
        all_extracted: List[ExtractedQuestion] = []
        seen_hashes_this_run: set[str] = set()

        for chunk in chunks:
            try:
                result = await ai_service.extract_questions(
                    document_text=chunk.text,
                    source_hint=pdf_row["file_name"],
                    chunk_index=chunk.index,
                    chunk_total=chunk.total,
                    page_offset_hint=_page_offset_hint(chunk.index, chunk.total, page_count),
                    answer_key_text=split.key_text,
                )
            except AIProviderError as exc:
                # One bad chunk (e.g. a transient Gemini error) shouldn't
                # necessarily fail the whole document if other chunks
                # succeed — log and continue, but if EVERY chunk fails the
                # `all_extracted` list stays empty and the pipeline still
                # reports honestly (zero extracted) rather than a fake success.
                logger.warning(
                    "Chunk %d/%d failed for '%s': %s", chunk.index + 1, chunk.total, pdf_row["file_name"], exc
                )
                continue

            for item in result.questions:
                content_hash = compute_content_hash(item.question_text)
                if content_hash in seen_hashes_this_run:
                    duplicate_count += 1
                    continue
                seen_hashes_this_run.add(content_hash)
                all_extracted.append(item)

        if not all_extracted and chunk_count > 0:
            logger.warning(
                "Extraction produced zero questions for '%s' across %d chunk(s) — "
                "document may not contain MCQs, or every chunk call failed (see warnings above).",
                pdf_row["file_name"],
                chunk_count,
            )

        for item in all_extracted:
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
                        "page_number": item.page_number,
                        "status": classified.status,
                        "tags": item.tags,
                        "created_by": uploader_id,
                        "confidence_score": item.confidence,
                        "ai_provider": "gemini",
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
            ocr_used=ocr_used,
            chunk_count=chunk_count,
            settings=settings,
        )

    except (PdfTextExtractionError, AIProviderError) as exc:
        _finish_failure(
            admin,
            job_id=job_id,
            pdf_id=pdf_id,
            uploader_id=uploader_id,
            pdf_row=pdf_row,
            error=str(exc),
            ocr_used=ocr_used,
            chunk_count=chunk_count,
        )
    except Exception as exc:  # noqa: BLE001 — never let an unexpected error leave a job stuck in "running"
        logger.exception("Unexpected pipeline failure for job %s", job_id)
        _finish_failure(
            admin,
            job_id=job_id,
            pdf_id=pdf_id,
            uploader_id=uploader_id,
            pdf_row=pdf_row,
            error=f"Unexpected error: {exc}",
            ocr_used=ocr_used,
            chunk_count=chunk_count,
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
    ocr_used: bool,
    chunk_count: int,
    settings,
) -> None:
    admin.table("processing_jobs").update(
        {
            "status": "completed",
            "questions_extracted": inserted_count,
            "duplicates_found": duplicate_count,
            "low_confidence_count": low_confidence_count,
            "ocr_used": ocr_used,
            "chunk_count": chunk_count,
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

    if not pdf_row.get("keep_permanent"):
        try:
            admin.storage.from_(settings.PDF_STORAGE_BUCKET).remove([pdf_row["storage_path"]])
        except Exception:  # noqa: BLE001 — don't fail a successful extraction over cleanup
            logger.exception("Failed to delete temporary PDF %s after extraction", pdf_row["storage_path"])

    summary = f"Extracted {inserted_count} question(s) from \"{pdf_row['file_name']}\"."
    if ocr_used:
        summary += " (OCR fallback was used — this looked like a scanned document.)"
    if chunk_count > 1:
        summary += f" Processed in {chunk_count} chunks."
    if duplicate_count:
        summary += f" {duplicate_count} duplicate(s) skipped."
    if low_confidence_count:
        summary += f" {low_confidence_count} flagged for review."
    if inserted_count == 0:
        summary += " No questions were found — this PDF may not contain MCQs, or extraction quality was too low; check the Processing Dashboard for details."

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


def _finish_failure(
    admin,
    *,
    job_id: str,
    pdf_id: str,
    uploader_id: str,
    pdf_row: Dict[str, Any],
    error: str,
    ocr_used: bool,
    chunk_count: int,
) -> None:
    admin.table("processing_jobs").update(
        {
            "status": "failed",
            "error_message": error,
            "ocr_used": ocr_used,
            "chunk_count": chunk_count,
            "completed_at": _now_iso(),
        }
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
