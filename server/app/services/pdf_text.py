"""
Extracts plain text from a PDF's raw bytes.

PHASE 7 FIX (Critical Issue 1 -- "Mixed PDF" support): `is_low_quality()`
used to be the ONLY quality signal, and it averaged `chars_per_page` across
the WHOLE document. A document with, say, 10 dense native-text question
pages and 5 scanned/photographed solution pages easily averages above the
OCR threshold even though those 5 pages individually have ~0 extractable
text -- so OCR never ran on them, and (because `full_text` also silently
drops any page with no text at all) their content simply vanished before
Gemini ever saw it, with no error and no trace. `low_quality_page_numbers`
below is the new per-page signal `pipeline.py` uses to OCR *just* the pages
that actually need it, on an otherwise-fine document, instead of an
all-or-nothing whole-document decision.
"""
import io
import logging
from dataclasses import dataclass
from typing import List

from pypdf import PdfReader

from app.core.config import get_settings
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


class PdfTextExtractionError(AppException):
    status_code = 422
    message = "Could not extract text from this PDF."


@dataclass
class PageText:
    page_number: int
    text: str

    @property
    def is_low_quality(self) -> bool:
        return len(self.text) < get_settings().OCR_MIN_CHARS_PER_PAGE


@dataclass
class ExtractionResult:
    pages: List[PageText]
    page_count: int

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages if p.text.strip())

    @property
    def chars_per_page(self) -> float:
        if self.page_count == 0:
            return 0.0
        return sum(len(p.text) for p in self.pages) / self.page_count

    def is_low_quality(self) -> bool:
        """Whole-document signal -- kept for the case where a document has
        no usable text at all (every page low-quality), which is cheapest
        to detect and fully OCR in one pass rather than page by page. See
        `low_quality_page_numbers` for the mixed-document case."""
        return self.chars_per_page < get_settings().OCR_MIN_CHARS_PER_PAGE

    @property
    def low_quality_page_numbers(self) -> List[int]:
        """Per-page signal (Phase 7): which individual 1-indexed pages look
        like they have little/no real text, regardless of how the document
        averages out overall. This is what makes a "10 text pages + 5
        scanned pages" mixed document detectable -- the average alone
        can't see it, but each page's own char count can."""
        return [p.page_number for p in self.pages if p.is_low_quality]


def extract_text_with_quality(pdf_bytes: bytes) -> ExtractionResult:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:  # noqa: BLE001 -- pypdf raises several exception types
        raise PdfTextExtractionError(f"This file could not be read as a PDF: {exc}")

    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:  # noqa: BLE001
            raise PdfTextExtractionError("This PDF is password-protected.")

    pages: List[PageText] = []
    for i, page in enumerate(reader.pages):
        try:
            pages.append(PageText(page_number=i + 1, text=page.extract_text() or ""))
        except Exception as exc:  # noqa: BLE001 -- a single malformed page shouldn't fail the whole doc
            logger.warning("Failed to extract text from page %d: %s", i + 1, exc)
            pages.append(PageText(page_number=i + 1, text=""))

    return ExtractionResult(pages=pages, page_count=len(pages))


def extract_text(pdf_bytes: bytes) -> str:
    result = extract_text_with_quality(pdf_bytes)
    text = result.full_text
    if not text.strip():
        raise PdfTextExtractionError(
            "No selectable text found in this PDF. Scanned/image-only PDFs "
            "go through the OCR fallback automatically -- see services/ocr.py."
        )
    return text
