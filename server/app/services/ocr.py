"""
OCR fallback for scanned/image-only PDFs (Sprint 4 fix #3), and the engine
behind direct image uploads (Phase 6 -- see services/image_text.py, which
is a thin wrapper reusing `image_to_string` below for a single-image input
instead of a rasterized PDF page).

PHASE 7 FIX (Critical Issue 1): every `image_to_string()` call here used to
run with Tesseract's default page-segmentation mode (PSM 3, "fully
automatic"), which is tuned for detecting multi-region newspaper-style
layouts. On a page that's mostly a short numbered list -- which describes
an answer key almost exactly, and is common for MCQ option blocks too --
PSM 3 frequently misreads column/line structure and produces badly garbled
text (verified: a real answer-key-shaped test page came out as
"CON AnRWNe\\nDBrunmwraoednwa..." under PSM 3). `--psm 6` ("assume a single
uniform block of text") fixed this completely in that same test (clean
"1.B\\n2.C\\n3.D...") while performing identically well on ordinary dense
paragraph-style scanned question text -- verified against both shapes
before applying this everywhere OCR runs.
"""
import logging
from functools import lru_cache
from typing import List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# See module docstring -- verified better than Tesseract's PSM-3 default
# for both list/grid-shaped content (answer keys, option blocks) and
# ordinary paragraph-style scanned text, so used unconditionally rather
# than branching on a guess about page content.
_TESSERACT_CONFIG = "--psm 6"


@lru_cache
def is_available() -> bool:
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
    except Exception as exc:  # noqa: BLE001 -- any missing-binary failure
        logger.warning("OCR requested but the tesseract binary isn't usable: %s", exc)
        return False

    return True


def ocr_pdf_bytes(pdf_bytes: bytes, *, max_pages: Optional[int] = None) -> str:
    if not is_available():
        return ""

    import pytesseract
    from pdf2image import convert_from_bytes

    settings = get_settings()

    try:
        images = convert_from_bytes(pdf_bytes, dpi=settings.OCR_DPI)
    except Exception as exc:  # noqa: BLE001 -- poppler/decoding failures
        logger.warning("OCR rasterization failed: %s", exc)
        return ""

    if max_pages is not None:
        images = images[:max_pages]

    pages_text: List[str] = []
    for i, image in enumerate(images):
        try:
            pages_text.append(pytesseract.image_to_string(image, config=_TESSERACT_CONFIG) or "")
        except Exception as exc:  # noqa: BLE001 -- a single bad page shouldn't fail the whole doc
            logger.warning("OCR failed on page %d: %s", i + 1, exc)

    return "\n\n".join(t for t in pages_text if t.strip())


def ocr_pdf_pages(pdf_bytes: bytes, page_numbers: List[int]) -> "dict[int, str]":
    """Phase 7 (mixed-PDF support): OCR only the given 1-indexed pages of a
    PDF, instead of the whole document. Used when a document is otherwise
    fine (native text extraction worked for most pages) but a handful of
    individual pages -- e.g. photographed/scanned solution pages mixed into
    an otherwise text-based question paper -- have no usable extracted
    text. Rasterizing and OCR'ing only those pages, rather than the whole
    document via `ocr_pdf_bytes`, keeps this cheap even on long PDFs where
    only a small minority of pages actually need it.

    Returns a dict of {page_number: ocr_text}; a page that fails to
    rasterize or OCR is simply omitted (never raises) so one bad page can't
    take down the rest.
    """
    if not page_numbers or not is_available():
        return {}

    import pytesseract
    from pdf2image import convert_from_bytes

    settings = get_settings()
    results: dict[int, str] = {}

    for page_number in page_numbers:
        try:
            images = convert_from_bytes(
                pdf_bytes, dpi=settings.OCR_DPI, first_page=page_number, last_page=page_number
            )
        except Exception as exc:  # noqa: BLE001 -- poppler/decoding failures for this one page
            logger.warning("OCR rasterization failed for page %d: %s", page_number, exc)
            continue
        if not images:
            continue
        try:
            text = pytesseract.image_to_string(images[0], config=_TESSERACT_CONFIG) or ""
        except Exception as exc:  # noqa: BLE001 -- a single bad page shouldn't fail the whole doc
            logger.warning("OCR failed on page %d: %s", page_number, exc)
            continue
        if text.strip():
            results[page_number] = text

    return results


def ocr_image_bytes(image_bytes: bytes) -> str:
    """OCR a single standalone image (Phase 6 direct image upload --
    services/image_text.py). Separate from `ocr_pdf_bytes` because there's
    no `pdf2image` rasterization step: the bytes are already a raster
    image, just opened directly with Pillow and handed to Tesseract."""
    if not is_available():
        return ""

    import io

    import pytesseract
    from PIL import Image

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            # Tesseract wants a fully-decoded, non-lazy image; load() forces
            # that while the buffer above is still in scope.
            image.load()
            return pytesseract.image_to_string(image, config=_TESSERACT_CONFIG) or ""
    except Exception as exc:  # noqa: BLE001 -- decode/OCR failures of any kind
        logger.warning("OCR failed on standalone image: %s", exc)
        return ""
