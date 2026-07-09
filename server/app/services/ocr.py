"""
OCR fallback for scanned/image-only PDFs (Sprint 4 fix #3).

`pdf_text.py` decides *whether* OCR is needed (based on extracted-text
density); this module does the actual OCR once that decision is made.

Requires two SYSTEM packages beyond the pip requirements, neither of which
pip can install for you:
  - tesseract-ocr   (the OCR engine pytesseract shells out to)
  - poppler-utils   (gives pdf2image a `pdftoppm` binary to rasterize pages)

On Debian/Ubuntu (e.g. the Render deploy target):
    apt-get update && apt-get install -y tesseract-ocr poppler-utils

If those aren't present, `is_available()` returns False and the pipeline
falls back to its previous behavior (surface `PdfTextExtractionError` for
scanned PDFs) instead of crashing.
"""
import logging
from functools import lru_cache
from typing import List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def is_available() -> bool:
    """Cheap, import-only check — never raises. Cached because it's called
    once per pipeline run and the answer can't change mid-process."""
    settings = get_settings()
    if not settings.OCR_ENABLED:
        return False
    try:
        import pytesseract  # noqa: F401
        from pdf2image import convert_from_bytes  # noqa: F401
    except ImportError:
        logger.warning(
            "OCR requested but pytesseract/pdf2image are not installed. "
            "Run `pip install pytesseract pdf2image` and ensure the "
            "tesseract-ocr and poppler-utils system packages are present."
        )
        return False

    try:
        import pytesseract

        pytesseract.get_tesseract_version()
    except Exception as exc:  # noqa: BLE001 — any missing-binary failure
        logger.warning("OCR requested but the tesseract binary isn't usable: %s", exc)
        return False

    return True


def ocr_pdf_bytes(pdf_bytes: bytes, *, max_pages: Optional[int] = None) -> str:
    """Rasterizes each page and runs Tesseract over it. Returns the
    concatenated per-page text (same shape as pdf_text.extract_text), or an
    empty string if OCR isn't available/produced nothing — callers should
    treat an empty result as "OCR didn't help" rather than crash."""
    if not is_available():
        return ""

    import pytesseract
    from pdf2image import convert_from_bytes

    settings = get_settings()

    try:
        images = convert_from_bytes(pdf_bytes, dpi=settings.OCR_DPI)
    except Exception as exc:  # noqa: BLE001 — poppler/decoding failures
        logger.warning("OCR rasterization failed: %s", exc)
        return ""

    if max_pages is not None:
        images = images[:max_pages]

    pages_text: List[str] = []
    for i, image in enumerate(images):
        try:
            pages_text.append(pytesseract.image_to_string(image) or "")
        except Exception as exc:  # noqa: BLE001 — a single bad page shouldn't fail the whole doc
            logger.warning("OCR failed on page %d: %s", i + 1, exc)

    return "\n\n".join(t for t in pages_text if t.strip())
