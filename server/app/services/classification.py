"""
Classification (Step 7).

Turns the free-text `topic` / `subject` / `company` strings a provider
returns into real foreign keys — creating `companies` / `subjects` /
`topics` rows on first sight, reusing them on repeat — and decides whether
a question is confident enough to auto-publish or should be held for
review.

`companies` already exists as a richer, admin-curated table (tier, roles,
package data — see 0001_sprint3_schema.sql) — auto-creating a row here only
fills in the columns this pipeline actually knows about (name/slug) and
leaves the rest for an admin to enrich later, rather than trying to guess
tier/package/roles from a PDF.
"""
import re
from dataclasses import dataclass
from typing import Optional

from app.core.config import get_settings
from app.core.supabase_client import get_supabase_admin


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "untitled"


@dataclass
class ClassificationResult:
    subject_id: Optional[str]
    topic_id: Optional[str]
    company_id: Optional[str]
    status: str  # "approved" | "pending-review"


def _get_or_create_subject(name: str) -> str:
    admin = get_supabase_admin()
    slug = slugify(name)
    existing = admin.table("subjects").select("id").eq("slug", slug).limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]
    created = admin.table("subjects").insert({"name": name.strip(), "slug": slug}).execute()
    return created.data[0]["id"]


def _get_or_create_topic(name: str, subject_id: str) -> str:
    admin = get_supabase_admin()
    slug = slugify(name)
    existing = (
        admin.table("topics")
        .select("id")
        .eq("slug", slug)
        .eq("subject_id", subject_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    created = admin.table("topics").insert({"name": name.strip(), "slug": slug, "subject_id": subject_id}).execute()
    return created.data[0]["id"]


def _get_or_create_company(name: str) -> str:
    admin = get_supabase_admin()
    slug = slugify(name)
    existing = admin.table("companies").select("id").eq("slug", slug).limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]
    # `tier` has no sensible default an AI extraction can infer responsibly —
    # 'core' is the most common bucket for auto-created companies pending
    # admin review, not a claim about the company's actual prestige tier.
    created = (
        admin.table("companies")
        .insert({"name": name.strip(), "slug": slug, "tier": "core"})
        .execute()
    )
    return created.data[0]["id"]


def classify(
    *,
    subject_name: Optional[str],
    topic_name: Optional[str],
    company_name: Optional[str],
    confidence: float,
) -> ClassificationResult:
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    company_id: Optional[str] = None

    if subject_name and subject_name.strip():
        subject_id = _get_or_create_subject(subject_name)
        if topic_name and topic_name.strip():
            topic_id = _get_or_create_topic(topic_name, subject_id)

    if company_name and company_name.strip():
        company_id = _get_or_create_company(company_name)

    threshold = get_settings().AI_CONFIDENCE_THRESHOLD
    status = "approved" if confidence >= threshold else "pending-review"

    return ClassificationResult(subject_id=subject_id, topic_id=topic_id, company_id=company_id, status=status)
