"""
Duplicate detection (Step 6).

Two layers:
  1. Exact match — a normalized hash of the question text, checked against
     the DB-level `questions.content_hash` unique constraint. Cheap and
     authoritative for byte-identical questions re-uploaded from the same
     or a different PDF.
  2. Fuzzy match — rapidfuzz similarity against a bounded candidate set
     (same question type + difficulty, most recent N), for reworded
     near-duplicates that hashing can't catch. A `pg_trgm` index already
     exists on `questions.question_text` (migration 0003) for a future
     SQL-side version of this at scale; doing the comparison in Python here
     keeps this sprint's implementation simple and doesn't require a
     bespoke Postgres RPC function.
"""
import hashlib
import re
from dataclasses import dataclass
from typing import Optional

from rapidfuzz import fuzz

from app.core.config import get_settings
from app.core.supabase_client import get_supabase_admin

_CANDIDATE_LIMIT = 300


def compute_content_hash(question_text: str) -> str:
    normalized = re.sub(r"\s+", " ", question_text.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@dataclass
class DuplicateCheckResult:
    is_duplicate: bool
    matched_question_id: Optional[str] = None
    reason: Optional[str] = None  # "exact-hash" | "fuzzy-similarity"


def check_duplicate(question_text: str, content_hash: str, *, question_type: str, difficulty: str) -> DuplicateCheckResult:
    admin = get_supabase_admin()

    exact = (
        admin.table("questions")
        .select("id")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
    )
    if exact.data:
        return DuplicateCheckResult(is_duplicate=True, matched_question_id=exact.data[0]["id"], reason="exact-hash")

    settings = get_settings()
    candidates = (
        admin.table("questions")
        .select("id, question_text")
        .eq("type", question_type)
        .eq("difficulty", difficulty)
        .order("created_at", desc=True)
        .limit(_CANDIDATE_LIMIT)
        .execute()
    )

    best_score = 0.0
    best_id: Optional[str] = None
    for row in candidates.data or []:
        score = fuzz.token_sort_ratio(question_text, row["question_text"]) / 100.0
        if score > best_score:
            best_score = score
            best_id = row["id"]

    if best_score >= settings.DUPLICATE_SIMILARITY_THRESHOLD:
        return DuplicateCheckResult(is_duplicate=True, matched_question_id=best_id, reason="fuzzy-similarity")

    return DuplicateCheckResult(is_duplicate=False)
