"""
Extracts plain text from a PDF's raw bytes.

Deliberately its own module, separate from the AI provider layer: the
pipeline always hands the AIProvider plain text, never a PDF file, so a
future provider that can't accept PDF attachments (or one that's cheaper to
call with text) works without changes here.
"""
import io
import logging

from pypdf import PdfReader

from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


class PdfTextExtractionError(AppException):
    status_code = 422
    message = "Could not extract text from this PDF."


def extract_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:  # noqa: BLE001 — pypdf raises several exception types
        raise PdfTextExtractionError(f"This file could not be read as a PDF: {exc}")

    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:  # noqa: BLE001
            raise PdfTextExtractionError("This PDF is password-protected.")

    pages_text = []
    for page in reader.pages:
        try:
            pages_text.append(page.extract_text() or "")
        except Exception as exc:  # noqa: BLE001 — a single malformed page shouldn't fail the whole doc
            logger.warning("Failed to extract text from a page: %s", exc)

    text = "\n\n".join(t for t in pages_text if t.strip())

    if not text.strip():
        # Most likely a scanned/image-only PDF. OCR is out of scope for this
        # sprint (see technical debt notes) — surface a clear, actionable
        # error instead of silently producing zero questions.
        raise PdfTextExtractionError(
            "No selectable text found in this PDF. Scanned/image-only PDFs "
            "aren't supported yet — OCR is planned for a future sprint."
        )

    return text
