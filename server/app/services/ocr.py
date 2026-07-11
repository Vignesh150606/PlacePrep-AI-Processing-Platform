"""
OCR fallback for scanned/image-only PDFs (Sprint 4 fix #3), and the engine
behind direct image uploads (Phase 6 -- see services/image_text.py, which
is a thin wrapper reusing `image_to_string` below for a single-image input
instead of a rasterized PDF page).
"""
import logging
from functools import lru_cache
from typing import List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


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
            pages_text.append(pytesseract.image_to_string(image) or "")
        except Exception as exc:  # noqa: BLE001 -- a single bad page shouldn't fail the whole doc
            logger.warning("OCR failed on page %d: %s", i + 1, exc)

    return "\n\n".join(t for t in pages_text if t.strip())


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
            return pytesseract.image_to_string(image) or ""
    except Exception as exc:  # noqa: BLE001 -- decode/OCR failures of any kind
        logger.warning("OCR failed on standalone image: %s", exc)
        return ""
