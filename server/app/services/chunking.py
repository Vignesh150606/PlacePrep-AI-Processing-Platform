"""
Splits long document text into model-sized chunks (Sprint 4 fix #4).

Why this exists: a single Gemini call over an entire 50-100 page placement
paper was the leading suspect for "extracts zero questions" on longer PDFs —
either the model truncates its own JSON output before closing the array
(caught before this fix by the strict JSON parse in gemini_provider.py, which
would then just fail the whole file), or attention gets diluted across too
much irrelevant text. Chunking bounds each call to a size the model handles
reliably, and the pipeline merges + de-duplicates results afterward.
"""
from dataclasses import dataclass
from typing import List

from app.core.config import get_settings


@dataclass
class TextChunk:
    index: int
    total: int
    text: str


def split_into_chunks(document_text: str) -> List[TextChunk]:
    settings = get_settings()
    max_chars = settings.CHUNK_MAX_CHARS
    overlap = settings.CHUNK_OVERLAP_CHARS

    if len(document_text) <= max_chars:
        return [TextChunk(index=0, total=1, text=document_text)]

    # Split on blank-line paragraph boundaries first so we never cut a
    # question's stem away from its own options mid-sentence.
    paragraphs = document_text.split("\n\n")

    chunks: List[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) > max_chars and current:
            chunks.append(current)
            # Carry a small overlap forward so a question split across the
            # boundary still has its start-of-stem visible in the next chunk.
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}\n\n{paragraph}" if tail else paragraph
        else:
            current = candidate

        # A single paragraph longer than max_chars on its own (rare — e.g. a
        # wall of unbroken OCR text) still needs a hard split so we never
        # send an unbounded chunk to the model.
        while len(current) > max_chars * 1.5:
            chunks.append(current[:max_chars])
            current = current[max_chars - overlap :]

    if current.strip():
        chunks.append(current)

    if not chunks:
        chunks = [document_text]

    total = len(chunks)
    return [TextChunk(index=i, total=total, text=chunk) for i, chunk in enumerate(chunks)]
