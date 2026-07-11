"""
Detects a separate "Answer Key" section in extracted PDF text and lifts it
out so it can be attached to every chunk sent to the model.
"""
import re
from dataclasses import dataclass
from typing import Optional

_HEADER_PATTERN = re.compile(
    r"^\s*(answer\s*key|answers?|answer\s*sheet|solutions?|correct\s*answers?)\s*[:\-]?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_MAX_KEY_SECTION_CHARS = 6_000


@dataclass
class AnswerKeyExtraction:
    body_text: str
    key_text: Optional[str]


def split_answer_key(document_text: str) -> AnswerKeyExtraction:
    matches = list(_HEADER_PATTERN.finditer(document_text))
    if not matches:
        return AnswerKeyExtraction(body_text=document_text, key_text=None)

    header_match = matches[-1]
    candidate_key_text = document_text[header_match.end():].strip()

    if not candidate_key_text or len(candidate_key_text) > _MAX_KEY_SECTION_CHARS:
        return AnswerKeyExtraction(body_text=document_text, key_text=None)

    body_text = document_text[: header_match.start()].strip()
    return AnswerKeyExtraction(body_text=body_text, key_text=candidate_key_text)
