"""
Splits long document text into model-sized chunks (Sprint 4 fix #4).
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

    paragraphs = document_text.split("\n\n")

    chunks: List[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) > max_chars and current:
            chunks.append(current)
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}\n\n{paragraph}" if tail else paragraph
        else:
            current = candidate

        while len(current) > max_chars * 1.5:
            chunks.append(current[:max_chars])
            current = current[max_chars - overlap :]

    if current.strip():
        chunks.append(current)

    if not chunks:
        chunks = [document_text]

    total = len(chunks)
    return [TextChunk(index=i, total=total, text=chunk) for i, chunk in enumerate(chunks)]
