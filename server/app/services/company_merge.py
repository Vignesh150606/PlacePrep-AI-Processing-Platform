"""
Admin Company Management -- "Merge duplicate companies" (Phase 18).

Mirrors `question_merge.py`'s shape exactly (combine stats, reassign every
historical reference, then remove the duplicate) applied to the six tables
that hold a `company_id` foreign key, plus the one place a company shows up
as a bookmark target:

  - `question_companies` (question_id, company_id) -- composite primary
    key, so a straight UPDATE could collide if some question already links
    to both the canonical and the duplicate company. Same conflict shape
    as `question_merge.py`'s bookmark reassignment: if the canonical link
    already exists, the duplicate's link row is simply dropped instead of
    violating the primary key with a blind UPDATE.
  - `interview_experiences.company_id` -- `not null`, one row/one FK column,
    no unique constraint involving it -- a plain UPDATE.
  - `resources.company_id`, `alumni_profiles.current_company_id`,
    `community_posts.company_id`, `calendar_events.company_id` -- all
    nullable, none participate in a unique constraint -- plain UPDATEs.
  - `bookmarks` where `target_type = 'company'` -- `unique(user_id,
    target_type, target_id)`, the exact same conflict shape
    `question_merge.py` already handles for question bookmarks: if a user
    already has the canonical company bookmarked, the duplicate's bookmark
    row is dropped rather than erroring; otherwise it's repointed.

`question_count`/`experience_count` are summed onto the canonical row (same
"don't silently lose accumulated stats" reasoning as `question_merge.py`'s
`times_attempted`/`times_correct` combine) before the duplicate is removed.

The duplicate itself is soft-deleted (`lifecycle.soft_delete_row`), not
hard-deleted -- an admin who merged the wrong pair can still find it on the
Deleted tab and reason about what happened, same recoverability every
other lifecycle action in this app already gives. A real, irreversible
removal is still available afterward via the existing
`DELETE /companies/{id}/permanent` endpoint, same as every other
soft-deletable table.

Data-volume note, same one `question_merge.py` already flags for its own
per-row loops: every reassignment here is O(rows referencing the
duplicate), fine at this app's current scale (a duplicate company
realistically has low tens of linked questions/resources/experiences, not
thousands) but would want a real SQL migration/RPC if that changes.
"""
from dataclasses import dataclass
from typing import Any, Dict

from app.core.exceptions import AppException, NotFoundError
from app.core.supabase_client import get_supabase_admin
from app.services import lifecycle


@dataclass
class CompanyMergeResult:
    canonical_id: str
    duplicate_id: str
    question_links_reassigned: int
    interview_experiences_reassigned: int
    resources_reassigned: int
    alumni_profiles_reassigned: int
    community_posts_reassigned: int
    calendar_events_reassigned: int
    bookmarks_reassigned: int
    bookmarks_dropped_as_duplicate: int


def _fetch_company(company_id: str) -> Dict[str, Any]:
    rows = get_supabase_admin().table("companies").select("*").eq("id", company_id).limit(1).execute().data
    if not rows:
        raise NotFoundError(f"Company {company_id} not found.")
    return rows[0]


def _reassign_simple(admin, table: str, company_id_column: str, *, canonical_id: str, duplicate_id: str) -> int:
    """Plain UPDATE reassignment for FK columns with no unique constraint
    of their own -- `interview_experiences`, `resources`, `alumni_profiles`,
    `community_posts`, `calendar_events`. Counts affected rows first
    (postgrest's `update()` doesn't hand back a row count directly)."""
    affected = admin.table(table).select("id").eq(company_id_column, duplicate_id).execute().data or []
    if not affected:
        return 0
    admin.table(table).update({company_id_column: canonical_id}).eq(company_id_column, duplicate_id).execute()
    return len(affected)


def merge_companies(*, canonical_id: str, duplicate_id: str, admin_id: str) -> CompanyMergeResult:
    if canonical_id == duplicate_id:
        raise AppException("A company cannot be merged into itself.")

    admin = get_supabase_admin()
    canonical = _fetch_company(canonical_id)
    duplicate = _fetch_company(duplicate_id)

    # --- 1. Combine directory-level counts onto the canonical row ---
    admin.table("companies").update(
        {
            "question_count": (canonical.get("question_count") or 0) + (duplicate.get("question_count") or 0),
            "experience_count": (canonical.get("experience_count") or 0) + (duplicate.get("experience_count") or 0),
        }
    ).eq("id", canonical_id).execute()

    # --- 2a. Reassign question_companies (composite PK -- dedupe first) ---
    duplicate_links = (
        admin.table("question_companies").select("question_id").eq("company_id", duplicate_id).execute().data or []
    )
    question_links_reassigned = 0
    for link in duplicate_links:
        already_linked = (
            admin.table("question_companies")
            .select("question_id")
            .eq("question_id", link["question_id"])
            .eq("company_id", canonical_id)
            .limit(1)
            .execute()
            .data
        )
        if already_linked:
            admin.table("question_companies").delete().eq("question_id", link["question_id"]).eq(
                "company_id", duplicate_id
            ).execute()
        else:
            admin.table("question_companies").update({"company_id": canonical_id}).eq(
                "question_id", link["question_id"]
            ).eq("company_id", duplicate_id).execute()
        question_links_reassigned += 1

    # --- 2b-2e. Plain reassignments (no unique constraint on the FK) ---
    interview_experiences_reassigned = _reassign_simple(
        admin, "interview_experiences", "company_id", canonical_id=canonical_id, duplicate_id=duplicate_id
    )
    resources_reassigned = _reassign_simple(
        admin, "resources", "company_id", canonical_id=canonical_id, duplicate_id=duplicate_id
    )
    alumni_profiles_reassigned = _reassign_simple(
        admin, "alumni_profiles", "current_company_id", canonical_id=canonical_id, duplicate_id=duplicate_id
    )
    community_posts_reassigned = _reassign_simple(
        admin, "community_posts", "company_id", canonical_id=canonical_id, duplicate_id=duplicate_id
    )
    calendar_events_reassigned = _reassign_simple(
        admin, "calendar_events", "company_id", canonical_id=canonical_id, duplicate_id=duplicate_id
    )

    # --- 2f. Reassign company bookmarks (respecting the unique(user_id, target_type, target_id) constraint) ---
    duplicate_bookmarks = (
        admin.table("bookmarks")
        .select("id, user_id")
        .eq("target_type", "company")
        .eq("target_id", duplicate_id)
        .execute()
        .data
        or []
    )
    bookmarks_reassigned = 0
    bookmarks_dropped = 0
    for bookmark in duplicate_bookmarks:
        already_has_canonical = (
            admin.table("bookmarks")
            .select("id")
            .eq("user_id", bookmark["user_id"])
            .eq("target_type", "company")
            .eq("target_id", canonical_id)
            .limit(1)
            .execute()
            .data
        )
        if already_has_canonical:
            admin.table("bookmarks").delete().eq("id", bookmark["id"]).execute()
            bookmarks_dropped += 1
        else:
            admin.table("bookmarks").update({"target_id": canonical_id}).eq("id", bookmark["id"]).execute()
            bookmarks_reassigned += 1

    # --- 3. Soft-delete the duplicate (recoverable from the Deleted tab) ---
    lifecycle.soft_delete_row("companies", duplicate_id, admin_id, fetch_or_404=_fetch_company, noun="company")

    return CompanyMergeResult(
        canonical_id=canonical_id,
        duplicate_id=duplicate_id,
        question_links_reassigned=question_links_reassigned,
        interview_experiences_reassigned=interview_experiences_reassigned,
        resources_reassigned=resources_reassigned,
        alumni_profiles_reassigned=alumni_profiles_reassigned,
        community_posts_reassigned=community_posts_reassigned,
        calendar_events_reassigned=calendar_events_reassigned,
        bookmarks_reassigned=bookmarks_reassigned,
        bookmarks_dropped_as_duplicate=bookmarks_dropped,
    )
