"""
Detects a separate "Answer Key" / "Solutions" section in extracted PDF text
and lifts it out so it can be attached to every chunk sent to the model.

PHASE 7 FIX (Critical Issue 1 -- "some PDFs produce zero extracted
questions, question pages and solution pages are stored separately"):

The previous version rejected the *entire* key section outright the moment
it exceeded a fixed 6,000-character budget -- which silently discarded
genuinely large solutions sections (worked explanations for 40+ questions
routinely blow past that) and left every chunk sent to Gemini with zero
answer-key context for the whole document. Combined with a chunk-level AI
failure being silently swallowed elsewhere in the pipeline (see
pipeline.py's PHASE 7 fix), a large answer key was the single most likely
real-world cause of a "valid MCQs but zero extracted" report.

Two changes:
  1. The hard length cutoff is now a generous sanity ceiling (40,000 chars)
     rather than the real gate. gemini-2.5-flash's context window makes
     even a much larger key trivial to include (see gemini_provider.py,
     which also raised its own truncation budget accordingly).
  2. The real gate is now SHAPE, not length: does the candidate text
     actually look like a list of answer entries ("1. B", "12) A", "Q5: C",
     "23-D", packed one-per-line or in a multi-column grid)? This also
     fixes the failure mode the old length check was probably trying (and
     failing) to guard against -- a false header match in running prose
     (a question whose body happens to contain the word "solutions")
     no longer swallows the rest of the document into "key text" just
     because it happened to be short; it's rejected if what follows it
     doesn't actually look like a key, regardless of length.
"""
import re
from dataclasses import dataclass
from typing import Optional

# Loosened slightly from "header alone on its own line" to also catch the
# extremely common "ANSWER KEY - SET A" / "Solutions (Section B)" shape --
# safe to loosen because the shape check below is now the real gate against
# false positives, not this pattern alone.
_HEADER_PATTERN = re.compile(
    r"^\s*(answer\s*key|answers?|answer\s*sheet|solutions?|correct\s*answers?)"
    r"\s*[:\-]?\s*[\w\s()]{0,30}$",
    re.IGNORECASE | re.MULTILINE,
)

# A single answer-key entry: a question number followed by one option
# letter/number, in any of the common shapes a printed key uses --
# "1. B", "12) A", "Q5: C", "23 - D", "45.(B)", "10.b" -- whether laid out
# one-per-line or packed several-per-line in a grid.
_ENTRY_TOKEN_PATTERN = re.compile(r"\bq?\.?\s*\d{1,4}\s*[\.\)\-:]\s*\(?[a-dA-D]\)?\b")

# Sanity ceiling only -- guards against genuinely pathological input, not a
# normal long answer key. Well within gemini-2.5-flash's context window.
_MAX_KEY_SECTION_CHARS = 40_000
# A candidate section must contain at least this many answer-shaped tokens,
# AND at a minimum density (tokens per character), to be trusted as a real
# key rather than a couple of coincidental number+letter matches inside
# unrelated prose following a false header hit.
_MIN_ENTRIES = 3
_MIN_ENTRY_DENSITY = 1 / 250


@dataclass
class AnswerKeyExtraction:
    body_text: str
    key_text: Optional[str]


def _looks_like_answer_key(candidate: str) -> bool:
    entries = _ENTRY_TOKEN_PATTERN.findall(candidate)
    if len(entries) < _MIN_ENTRIES:
        return False
    density = len(entries) / max(len(candidate), 1)
    return density >= _MIN_ENTRY_DENSITY


def split_answer_key(document_text: str) -> AnswerKeyExtraction:
    matches = list(_HEADER_PATTERN.finditer(document_text))
    if not matches:
        return AnswerKeyExtraction(body_text=document_text, key_text=None)

    # Try header matches from LAST to FIRST -- a document can legitimately
    # contain the word "solutions"/"answers" more than once (e.g. in a
    # table of contents, or per-section) before the real key section, so
    # the last match isn't automatically the right one; the first one that
    # actually looks like a key, scanning backwards, is.
    for header_match in reversed(matches):
        candidate_key_text = document_text[header_match.end():].strip()
        if not candidate_key_text or len(candidate_key_text) > _MAX_KEY_SECTION_CHARS:
            continue
        if not _looks_like_answer_key(candidate_key_text):
            continue
        body_text = document_text[: header_match.start()].strip()
        return AnswerKeyExtraction(body_text=body_text, key_text=candidate_key_text)

    return AnswerKeyExtraction(body_text=document_text, key_text=None)
