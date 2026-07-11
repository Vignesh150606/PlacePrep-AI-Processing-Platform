"""
Text extraction for a directly-uploaded image (Phase 6 -- "support PNG,
JPG, JPEG, scanned papers, screenshots, mobile photos").

Design: rather than inventing a second extraction pipeline, an uploaded
image is treated as a single-page "PDF" for every downstream purpose --
`ExtractionResult` below has the exact same shape as `pdf_text.py`'s (one
`PageText` entry, `page_count == 1`), so `pipeline.py`'s OCR-fallback /
chunking / answer-key / classification logic doesn't need to know or care
whether the bytes it received started life as a PDF or a JPEG. The only
image-specific code lives here and in the upload endpoint's MIME check.

Unlike a PDF, an image has no embedded text layer to try first -- OCR is
not a *fallback* for images, it's the only path, so this always calls
straight into `services/ocr.py`'s Tesseract wrapper.
"""
import logging

from PIL import Image, UnidentifiedImageError

from app.core.exceptions import AppException
from app.services import ocr
from app.services.pdf_text import ExtractionResult, PageText

logger = logging.getLogger(__name__)


class ImageTextExtractionError(AppException):
    status_code = 422
    message = "Could not extract text from this image."


def extract_text_from_image(image_bytes: bytes) -> ExtractionResult:
    """Mirrors `pdf_text.extract_text_with_quality()`'s return shape so the
    pipeline can treat a single image identically to a one-page PDF."""
    try:
        # Validate it's actually a readable image before handing it to
        # Tesseract -- a corrupt/truncated upload should fail fast with a
        # clear message rather than a confusing OCR error three calls deep.
        with Image.open(_bytes_io(image_bytes)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageTextExtractionError(f"This file could not be read as an image: {exc}")

    if not ocr.is_available():
        raise ImageTextExtractionError(
            "OCR is required to read text from an uploaded image, but it isn't available on "
            "this server. See server/README.md for the tesseract-ocr / poppler-utils install step."
        )

    text = ocr.ocr_image_bytes(image_bytes)
    if not text.strip():
        raise ImageTextExtractionError(
            "No readable text was found in this image. Make sure the photo is in focus, "
            "well-lit, and the question paper fills most of the frame."
        )

    return ExtractionResult(pages=[PageText(page_number=1, text=text)], page_count=1)


def _bytes_io(data: bytes):
    import io

    return io.BytesIO(data)
