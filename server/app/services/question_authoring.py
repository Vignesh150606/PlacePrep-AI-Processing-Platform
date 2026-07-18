"""
Question Authoring System (Phase 13).

Audit summary (see migration 0015's own docstring for the schema side):
before this module, the ONLY way a row ever landed in `questions` was
`services/pipeline.py`'s AI extraction run -- there was no create endpoint,
manual or otherwise, anywhere in the API. This module is the shared write
path for all three new entry points (Admin Manual Builder, Student
Submission, Smart Bulk Parser), built by lifting the AI pipeline's own
insert logic out into one function instead of writing it a fourth time --
`pipeline.py` now calls `create_question_record()` too, so there is exactly
one place that ever writes a `questions` + `question_options` +
`question_topics` + `question_companies` row-set.

Reused, not reimplemented:
  - `services/duplicate.py` -- `compute_content_hash()` / `check_duplicate()`
    are already generic over "some question text"; nothing here duplicates
    that logic. An EXACT hash match is treated as a hard block everywhere
    (the DB's `content_hash` unique constraint would reject it anyway --
    this just turns that into a friendly error/preview warning instead of
    a raw Postgres 409). A FUZZY near-match is a warning, never a block --
    the admin (manual builder, bulk import) or the reviewing admin
    (student submission) makes the final call, same as Admin Review
    already does for AI-extracted questions today.
  - `services/classification.py` -- `classify()` already does
    get-or-create resolution of subject/topic/company names to ids. Its
    confidence-driven `status` field is NOT used here (every caller of
    `create_question_record` decides `status` explicitly -- a manual
    author isn't a confidence score); only `.subject_id` / `.topic_id` /
    `.company_id` are read.

The Smart Bulk Parser (`parse_bulk_text`) is deliberately pure text
processing -- no AI/LLM call of any kind, per the brief. It recognizes the
same "Q1. / A. B. C. D. / Answer: / Solution:" convention shown in the
brief's own example, plus a few reasonable variants (a `---`/`===` divider
line as an alternative question boundary; "Question 1" spelled out;
"Explanation:" as a synonym for "Solution:"), and is intentionally
conservative about what counts as "cleanly parsed" -- anything ambiguous
becomes a warning for the admin to look at in the preview table rather
than a silent guess.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.core.supabase_client import get_supabase_admin
from app.services import classification, duplicate

_VALID_TYPES = {"mcq", "multi-select", "coding", "subjective"}
_VALID_DIFFICULTIES = {"easy", "medium", "hard"}


@dataclass
class OptionInput:
    label: str
    text: str
    is_correct: bool


@dataclass
class QuestionCreateResult:
    question_id: Optional[str]
    is_duplicate: bool
    duplicate_of: Optional[str] = None
    duplicate_reason: Optional[str] = None  # "exact-hash" | "fuzzy-similarity"


class QuestionAuthoringError(Exception):
    """Raised for a validation failure that should stop a single create
    (the router turns this into a 400 for single-question endpoints, or a
    per-item 'invalid' preview/import result for bulk endpoints)."""


def _validate_options(options: List[OptionInput], type_: str) -> None:
    if len(options) < 2:
        raise QuestionAuthoringError("At least two options are required.")
    correct_count = sum(1 for o in options if o.is_correct)
    if correct_count == 0:
        raise QuestionAuthoringError("At least one option must be marked correct.")
    if type_ == "mcq" and correct_count > 1:
        raise QuestionAuthoringError("An MCQ question can only have one correct option.")


def create_question_record(
    *,
    type_: str,
    question_text: str,
    options: List[OptionInput],
    correct_explanation: Optional[str] = None,
    solution_steps: Optional[str] = None,
    interview_tip: Optional[str] = None,
    reference_note: Optional[str] = None,
    difficulty: str,
    subject_name: Optional[str] = None,
    topic_name: Optional[str] = None,
    company_name: Optional[str] = None,
    tags: Optional[List[str]] = None,
    image_urls: Optional[List[str]] = None,
    attachment_urls: Optional[List[str]] = None,
    source_pdf_id: Optional[str] = None,
    page_number: Optional[int] = None,
    confidence_score: Optional[float] = None,
    ai_provider: Optional[str] = None,
    created_by: Optional[str],
    source_type: str,
    submission_method: Optional[str] = None,
    status: str,
    check_duplicates: bool = True,
    block_fuzzy_duplicates: bool = False,
) -> QuestionCreateResult:
    """The one place a `questions` row-set is ever written. Every caller
    (AI pipeline, Admin Manual Builder, Student Submission, Smart Bulk
    Parser) decides `status`/`source_type`/`submission_method` up front --
    this function's only job is validation, dedup, classification, and the
    actual multi-table insert.

    Returns `is_duplicate=True` (and no `question_id`) rather than raising
    when a duplicate is found and should block the insert, so bulk import
    can count it and move on to the next item instead of aborting the
    whole batch -- see the module docstring. An exact content-hash match
    ALWAYS blocks (the DB's unique constraint would reject the insert
    anyway); a fuzzy near-match only blocks when `block_fuzzy_duplicates`
    is set (the AI pipeline wants this -- it has no human reviewing each
    extraction in real time -- manual/bulk callers default to leaving it
    as a non-blocking warning instead, since a human is right there to
    decide).
    """
    if type_ not in _VALID_TYPES:
        raise QuestionAuthoringError(f"Invalid question type '{type_}'.")
    if difficulty not in _VALID_DIFFICULTIES:
        raise QuestionAuthoringError(f"Invalid difficulty '{difficulty}'.")
    if not question_text or not question_text.strip():
        raise QuestionAuthoringError("Question text is required.")
    if type_ in ("mcq", "multi-select"):
        _validate_options(options, type_)

    admin = get_supabase_admin()
    content_hash = duplicate.compute_content_hash(question_text)

    if check_duplicates:
        dup_check = duplicate.check_duplicate(
            question_text, content_hash, question_type=type_, difficulty=difficulty
        )
        should_block = dup_check.is_duplicate and (dup_check.reason == "exact-hash" or block_fuzzy_duplicates)
        if should_block:
            return QuestionCreateResult(
                question_id=None, is_duplicate=True,
                duplicate_of=dup_check.matched_question_id, duplicate_reason=dup_check.reason,
            )

    classified = classification.classify(
        subject_name=subject_name,
        topic_name=topic_name,
        company_name=company_name,
        confidence=1.0,  # status is decided by the caller, not by classify()'s threshold
    )

    # `questions.confidence_score` is `numeric(4,3) NOT NULL DEFAULT 1.0`.
    # Passing `confidence_score=None` through as a literal insert value sends
    # an explicit SQL NULL, which overrides the column's own DEFAULT and
    # violates the NOT NULL constraint -- defaults only apply when a column
    # is omitted, not when it's present as NULL. The AI pipeline always
    # supplies a real extraction confidence here; Admin Manual Builder,
    # Student Submission, and Smart Bulk Parser have no AI-derived score and
    # previously left this as None. 1.0 is correct for those callers -- full
    # confidence, since a human wrote or is directly responsible for the
    # content instead of an AI extraction.
    effective_confidence_score = confidence_score if confidence_score is not None else 1.0

    question_row = (
        admin.table("questions")
        .insert(
            {
                "type": type_,
                "question_text": question_text.strip(),
                "content_hash": content_hash,
                "correct_explanation": correct_explanation,
                "solution_steps": solution_steps,
                "interview_tip": interview_tip,
                "reference_note": reference_note,
                "difficulty": difficulty,
                "source_pdf_id": source_pdf_id,
                "page_number": page_number,
                "status": status,
                "tags": tags or [],
                "image_urls": image_urls or [],
                "attachment_urls": attachment_urls or [],
                "created_by": created_by,
                "confidence_score": effective_confidence_score,
                "ai_provider": ai_provider,
                "source_type": source_type,
                "submission_method": submission_method,
            }
        )
        .execute()
    )
    question_id = question_row.data[0]["id"]

    if options:
        admin.table("question_options").insert(
            [
                {
                    "question_id": question_id,
                    "label": opt.label,
                    "option_text": opt.text,
                    "is_correct": opt.is_correct,
                    "order_index": idx,
                }
                for idx, opt in enumerate(options)
            ]
        ).execute()

    if classified.topic_id:
        admin.table("question_topics").insert(
            {"question_id": question_id, "topic_id": classified.topic_id}
        ).execute()

    if classified.company_id:
        admin.table("question_companies").insert(
            {"question_id": question_id, "company_id": classified.company_id}
        ).execute()

    return QuestionCreateResult(question_id=question_id, is_duplicate=False)


# =============================================================================
# Smart Bulk Question Parser -- no AI, pure text processing.
# =============================================================================

_QUESTION_BOUNDARY_RE = re.compile(
    r"^\s*(?:Q(?:uestion)?\.?\s*(\d+)[\.\):]?|(-{3,}|={3,}))\s*$",
    re.IGNORECASE,
)
# A question can also start inline, e.g. "Q1. What is..." on one line --
# handled separately in `_split_blocks` since the regex above only matches
# a boundary marker that is the WHOLE line (the separator case).
_INLINE_Q_START_RE = re.compile(r"^\s*Q(?:uestion)?\.?\s*(\d+)[\.\):]\s*(.*)$", re.IGNORECASE)
_OPTION_RE = re.compile(r"^\s*([A-Za-z])[\.\):]\s*(.+)$")
_ANSWER_RE = re.compile(r"^\s*Answer\s*[:\-]\s*(.+)$", re.IGNORECASE)
_SOLUTION_RE = re.compile(r"^\s*(?:Solution|Explanation)\s*[:\-]\s*(.*)$", re.IGNORECASE)
_DIFFICULTY_RE = re.compile(r"^\s*Difficulty\s*[:\-]\s*(.+)$", re.IGNORECASE)
_TAGS_RE = re.compile(r"^\s*Tags?\s*[:\-]\s*(.+)$", re.IGNORECASE)
_COMPANY_RE = re.compile(r"^\s*Company\s*[:\-]\s*(.+)$", re.IGNORECASE)
_SUBJECT_RE = re.compile(r"^\s*Subject\s*[:\-]\s*(.+)$", re.IGNORECASE)
_TOPIC_RE = re.compile(r"^\s*Topic\s*[:\-]\s*(.+)$", re.IGNORECASE)
_SEPARATOR_LINE_RE = re.compile(r"^\s*[-=]{3,}\s*$")


@dataclass
class ParsedQuestionBlock:
    question_text: str = ""
    options: List[OptionInput] = field(default_factory=list)
    correct_labels: List[str] = field(default_factory=list)
    solution: Optional[str] = None
    difficulty: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    company: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None


@dataclass
class BulkPreviewItem:
    index: int
    status: str  # "parsed" | "warning-missing-answer" | "warning-missing-option" |
    #                "warning-duplicate" | "invalid"
    warnings: List[str]
    raw_block: str
    parsed: Optional[ParsedQuestionBlock]
    duplicate_of_question_id: Optional[str] = None


def _split_blocks(raw_text: str) -> List[str]:
    """Splits pasted text into one chunk per detected question, on either
    an inline 'Q<n>.' line or a standalone '---'/'===' separator line --
    both shown as valid conventions in the brief's own example."""
    lines = raw_text.replace("\r\n", "\n").split("\n")
    blocks: List[List[str]] = []
    current: List[str] = []

    for line in lines:
        if _SEPARATOR_LINE_RE.match(line):
            if current:
                blocks.append(current)
                current = []
            continue
        if _INLINE_Q_START_RE.match(line) and current:
            # A new "Q<n>." line starts -- close off the previous block
            # first (unless `current` is still empty, i.e. this IS the
            # first line of the very first block).
            blocks.append(current)
            current = []
        current.append(line)

    if current:
        blocks.append(current)

    # Drop blocks that are purely whitespace (e.g. leading text before the
    # first real question, or trailing blank lines after the last).
    return ["\n".join(b).strip() for b in blocks if "\n".join(b).strip()]


def _parse_block(block_text: str) -> ParsedQuestionBlock:
    parsed = ParsedQuestionBlock()
    question_lines: List[str] = []
    solution_lines: List[str] = []
    mode = "question"  # "question" | "solution"

    for raw_line in block_text.split("\n"):
        line = raw_line.rstrip()

        inline_start = _INLINE_Q_START_RE.match(line)
        if inline_start and not question_lines and not parsed.options:
            # Strip the "Q1." prefix off the very first line only.
            question_lines.append(inline_start.group(2))
            continue

        opt_match = _OPTION_RE.match(line) if mode == "question" else None
        if opt_match:
            parsed.options.append(OptionInput(label=opt_match.group(1).upper(), text=opt_match.group(2).strip(), is_correct=False))
            continue

        ans_match = _ANSWER_RE.match(line)
        if ans_match:
            labels = re.split(r"[,\s/&]+", ans_match.group(1).strip())
            parsed.correct_labels = [lbl.strip().upper().rstrip(".") for lbl in labels if lbl.strip()]
            continue

        sol_match = _SOLUTION_RE.match(line)
        if sol_match:
            mode = "solution"
            if sol_match.group(1):
                solution_lines.append(sol_match.group(1))
            continue

        diff_match = _DIFFICULTY_RE.match(line)
        if diff_match:
            parsed.difficulty = diff_match.group(1).strip().lower()
            continue
        tags_match = _TAGS_RE.match(line)
        if tags_match:
            parsed.tags = [t.strip() for t in tags_match.group(1).split(",") if t.strip()]
            continue
        company_match = _COMPANY_RE.match(line)
        if company_match:
            parsed.company = company_match.group(1).strip()
            continue
        subject_match = _SUBJECT_RE.match(line)
        if subject_match:
            parsed.subject = subject_match.group(1).strip()
            continue
        topic_match = _TOPIC_RE.match(line)
        if topic_match:
            parsed.topic = topic_match.group(1).strip()
            continue

        if mode == "solution":
            solution_lines.append(line)
        elif not parsed.options:
            question_lines.append(line)
        # else: stray line after options but before Answer/Solution -- ignored
        # rather than guessed at.

    parsed.question_text = "\n".join(question_lines).strip()
    solution_text = "\n".join(solution_lines).strip()
    parsed.solution = solution_text or None

    if parsed.correct_labels:
        correct_set = set(parsed.correct_labels)
        for opt in parsed.options:
            if opt.label in correct_set:
                opt.is_correct = True

    return parsed


def parse_bulk_text(raw_text: str, *, run_duplicate_check: bool = True) -> List[BulkPreviewItem]:
    """Pure parsing + validation + (optional) duplicate lookup. Writes
    nothing to the database -- this backs the preview table only; see
    `bulk_import` for the step that actually inserts rows."""
    blocks = _split_blocks(raw_text)
    items: List[BulkPreviewItem] = []

    for idx, block_text in enumerate(blocks):
        parsed = _parse_block(block_text)
        warnings: List[str] = []
        status = "parsed"

        if not parsed.question_text or len(parsed.question_text) < 5:
            items.append(
                BulkPreviewItem(
                    index=idx, status="invalid", warnings=["Could not detect question text."],
                    raw_block=block_text, parsed=None,
                )
            )
            continue

        if len(parsed.options) < 2:
            status = "warning-missing-option"
            warnings.append(f"Only {len(parsed.options)} option(s) detected -- need at least 2.")
        elif not parsed.correct_labels:
            status = "warning-missing-answer"
            warnings.append("No 'Answer:' line detected.")
        elif not any(o.is_correct for o in parsed.options):
            status = "warning-missing-answer"
            warnings.append(f"Answer '{', '.join(parsed.correct_labels)}' doesn't match any detected option letter.")

        duplicate_of: Optional[str] = None
        if status == "parsed" and run_duplicate_check:
            content_hash = duplicate.compute_content_hash(parsed.question_text)
            dup = duplicate.check_duplicate(
                parsed.question_text, content_hash, question_type="mcq", difficulty=parsed.difficulty or "medium"
            )
            if dup.is_duplicate:
                status = "warning-duplicate"
                duplicate_of = dup.matched_question_id
                warnings.append("Closely matches an existing question already in the bank.")

        items.append(
            BulkPreviewItem(
                index=idx, status=status, warnings=warnings, raw_block=block_text,
                parsed=parsed, duplicate_of_question_id=duplicate_of,
            )
        )

    return items


def record_import_batch(
    *, admin_id: str, label: Optional[str], total_detected: int, total_imported: int,
    total_duplicate: int, total_error: int,
) -> Dict[str, Any]:
    result = (
        get_supabase_admin()
        .table("question_import_batches")
        .insert(
            {
                "admin_id": admin_id,
                "label": label,
                "total_detected": total_detected,
                "total_imported": total_imported,
                "total_duplicate": total_duplicate,
                "total_error": total_error,
            }
        )
        .execute()
    )
    return result.data[0]
