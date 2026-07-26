"""
Company Directory endpoints.

Phase 18 -- Company Admin Management. Until this phase this module was
deliberately read-only (see the git history for this file's original
docstring: "there's no create/update endpoint here, since admin-managed
company profiles are a later feature"). Companies were only ever
auto-upserted by the classification step during PDF extraction (see
`app/services/classification.py`'s `_get_or_create_company`), with no way
for an admin to create one directly, fix a typo, merge an accidental
duplicate (classification dedupes by exact slug match, so "Google" and
"Google Inc" would previously have created two separate directory
entries), or remove one that shouldn't be in the directory.

This phase adds the same archive/soft-delete/restore/permanent-delete/
bulk-action shape every other admin-managed table in this codebase already
has (`questions.py`, `resources.py`), reusing the shared `lifecycle.py`
helpers rather than inventing a fourth copy of the same four transitions --
see migration 0021's docstring for why companies get a smaller two-state
`status` ('active' | 'archived') instead of the draft/pending-review/
approved/rejected workflow questions/resources have (a company is never
in a review queue to begin with).

Visibility rule (unchanged from before this phase, just now stated
explicitly): a non-admin only ever sees `status = 'active'`, non-deleted
companies, whether browsing the list or hitting a detail slug directly --
same rule `GET /search`'s company results now also apply (see that
module's own update this phase).
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, company_merge, lifecycle
from app.services.classification import slugify

router = APIRouter()

_VALID_TIERS = {"dream", "super-dream", "core", "mass-recruiter"}
_VALID_STATUSES = {"active", "archived"}
_VALID_BULK_ACTIONS = {"archive", "unarchive", "delete", "restore", "permanent-delete"}
# Same "clean, one-call inverse" convention as questions.py/resources.py --
# approve/reject/permanent-delete are excluded there for the same reason
# permanent-delete is excluded here: no inverse.
_UNDOABLE_BULK_ACTIONS = {"archive": "unarchive", "unarchive": "archive", "delete": "restore"}


class CompanyResponse(CamelModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    description: str
    website: Optional[str] = None
    industry: str
    tier: str
    roles: List[str]
    average_package_lpa: Optional[float] = None
    question_count: int
    experience_count: int
    upcoming_visit_date: Optional[str] = None
    created_at: str
    # Phase 18 -- Company Admin Management.
    status: str
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None
    updated_at: str
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class CompanyListResponse(CamelModel):
    items: List[CompanyResponse]


class CompanyCreateRequest(CamelModel):
    name: str
    industry: str
    tier: str
    description: Optional[str] = None
    website: Optional[str] = None
    roles: Optional[List[str]] = None
    average_package_lpa: Optional[float] = None
    upcoming_visit_date: Optional[str] = None
    logo_url: Optional[str] = None


class CompanyUpdateRequest(CamelModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    tier: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    roles: Optional[List[str]] = None
    average_package_lpa: Optional[float] = None
    upcoming_visit_date: Optional[str] = None
    logo_url: Optional[str] = None


class CompanyBulkActionRequest(CamelModel):
    company_ids: List[str]
    action: str


class CompanyBulkActionResponse(CamelModel):
    succeeded: List[str]
    failed: List[Dict[str, str]]
    undo_action: Optional[str] = None


class CompanyMergeRequest(CamelModel):
    duplicate_id: str


class CompanyMergeResponse(CamelModel):
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


def _question_counts_by_company() -> Dict[str, int]:
    rows = get_supabase_admin().table("question_companies").select("company_id").execute().data or []
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["company_id"]] = counts.get(row["company_id"], 0) + 1
    return counts


def _row_to_response(row: Dict[str, Any], question_count: int) -> CompanyResponse:
    return CompanyResponse(
        id=row["id"],
        name=row["name"],
        slug=row["slug"],
        logo_url=row.get("logo_url"),
        description=row.get("description") or "",
        website=row.get("website"),
        industry=row.get("industry") or "",
        tier=row["tier"],
        roles=row.get("roles") or [],
        average_package_lpa=row.get("average_package_lpa"),
        question_count=question_count,
        experience_count=row.get("experience_count", 0),
        upcoming_visit_date=row.get("upcoming_visit_date"),
        created_at=row["created_at"],
        status=row.get("status", "active"),
        archived_at=row.get("archived_at"),
        archived_by=row.get("archived_by"),
        updated_at=row.get("updated_at") or row["created_at"],
        deleted_at=row.get("deleted_at"),
        deleted_by=row.get("deleted_by"),
    )


def _get_company_by_id_or_404(company_id: str) -> Dict[str, Any]:
    rows = get_supabase_admin().table("companies").select("*").eq("id", company_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Company not found.")
    return rows[0]


def _unique_slug(name: str) -> str:
    """Same `slugify()` classification.py already uses for auto-upserted
    companies, but with real collision handling: an explicit admin
    "create company" action should never silently return an existing row
    the way classification's upsert-by-slug does -- see `create_company`'s
    own docstring for why a collision is a 409, not a dedupe."""
    admin = get_supabase_admin()
    base_slug = slugify(name)
    slug = base_slug
    suffix = 2
    while admin.table("companies").select("id").eq("slug", slug).limit(1).execute().data:
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


@router.get("", response_model=ApiResponse[CompanyListResponse])
async def list_companies(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    status: Optional[str] = Query(None, description="active | archived -- admin only; students always get active"),
    deleted: bool = Query(False, description="admin-only Deleted tab -- mutually exclusive with `status`"),
):
    if deleted and not admin:
        raise ForbiddenError("Only admins can view deleted companies.")
    if status is not None and status not in _VALID_STATUSES:
        raise AppException(f"Invalid status filter: {status}", status_code=422)
    if status is not None and not admin:
        raise ForbiddenError("Only admins can filter by status.")

    query = get_supabase_admin().table("companies").select("*")
    if deleted:
        query = query.not_.is_("deleted_at", "null")
    else:
        query = query.is_("deleted_at", "null")
        if admin and status:
            query = query.eq("status", status)
        elif not admin:
            query = query.eq("status", "active")
        # admin + no status filter: both active and archived, just not deleted.

    rows = query.order("name").execute().data or []
    counts = _question_counts_by_company()
    items = [_row_to_response(r, counts.get(r["id"], 0)) for r in rows]
    return ok(data=CompanyListResponse(items=items), message="Companies fetched.")


@router.get("/{slug}", response_model=ApiResponse[CompanyResponse])
async def get_company(
    slug: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
):
    try:
        row = get_supabase_admin().table("companies").select("*").eq("slug", slug).single().execute().data
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Company not found.")
        raise
    if not admin and (row.get("status") != "active" or row.get("deleted_at")):
        # Same visibility rule `list_companies` applies -- a direct link to
        # an archived/deleted company should 404 for a student exactly as
        # if it never existed, not leak its existence via a 403.
        raise NotFoundError("Company not found.")
    counts = _question_counts_by_company()
    return ok(data=_row_to_response(row, counts.get(row["id"], 0)), message="Company fetched.")


@router.post("", response_model=ApiResponse[CompanyResponse])
async def create_company(payload: CompanyCreateRequest, admin_user: CurrentUser = Depends(require_admin)):
    """Admin-only. Real create -- distinct from classification.py's
    `_get_or_create_company`, which silently reuses an existing row on a
    slug collision because it's an automated upsert, not a deliberate
    admin action. Here, a name that already maps to an existing slug gets
    a numbered suffix (`acme-2`) rather than being folded into the
    existing company -- if the admin actually meant "this is the same
    company", `POST /{id}/merge` is the right tool, not a silent dedupe."""
    if not payload.name.strip():
        raise AppException("Company name is required.", status_code=422)
    if payload.tier not in _VALID_TIERS:
        raise AppException(f"Invalid tier: {payload.tier}", status_code=422)

    slug = _unique_slug(payload.name)
    insert_data: Dict[str, Any] = {
        "name": payload.name.strip(),
        "slug": slug,
        "industry": payload.industry.strip(),
        "tier": payload.tier,
        "description": payload.description or "",
        "website": payload.website,
        "roles": payload.roles or [],
        "average_package_lpa": payload.average_package_lpa,
        "upcoming_visit_date": payload.upcoming_visit_date,
        "logo_url": payload.logo_url,
    }
    row = get_supabase_admin().table("companies").insert(insert_data).execute().data[0]
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-created", target_type="company", target_id=row["id"],
        metadata={"name": row["name"]},
    )
    return ok(data=_row_to_response(row, 0), message=f'"{row["name"]}" created.')


@router.patch("/{company_id}", response_model=ApiResponse[CompanyResponse])
async def update_company(
    company_id: str, payload: CompanyUpdateRequest, admin_user: CurrentUser = Depends(require_admin)
):
    """Admin-only edit. Every field independently optional -- same "send
    only what changed" shape as `ResourceUpdateInput`. Editing `name`
    deliberately does NOT regenerate `slug` -- companies are linked from
    bookmarks, quiz configs, and external references by slug; silently
    changing it out from under those would be a worse bug than living with
    a slug that no longer matches a corrected name. An admin who genuinely
    needs the slug changed can do so as a deliberate follow-up once this
    is a real product need, not a side effect of a name typo fix."""
    existing = _get_company_by_id_or_404(company_id)
    if payload.tier is not None and payload.tier not in _VALID_TIERS:
        raise AppException(f"Invalid tier: {payload.tier}", status_code=422)

    update_data: Dict[str, Any] = {}
    for field in (
        "name", "industry", "tier", "description", "website", "roles",
        "average_package_lpa", "upcoming_visit_date", "logo_url",
    ):
        value = getattr(payload, field)
        if value is not None:
            update_data[field] = value.strip() if isinstance(value, str) and field in ("name", "industry") else value

    if not update_data:
        raise AppException("Provide at least one field to update.", status_code=422)

    get_supabase_admin().table("companies").update(update_data).eq("id", company_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-edited", target_type="company", target_id=company_id,
        metadata={"fields": list(update_data.keys())},
    )
    updated = _get_company_by_id_or_404(company_id)
    counts = _question_counts_by_company()
    return ok(data=_row_to_response(updated, counts.get(company_id, existing.get("question_count", 0))), message="Company updated.")


# =============================================================================
# Phase 18 -- Lifecycle: archive / unarchive / soft delete / restore /
# permanent delete. Same shared-helper shape as questions.py/resources.py --
# see `lifecycle.py` for the actual transitions; the wrappers below just
# supply this table's name, fetch-or-404, and audit-log call.
# =============================================================================


def _archive_one(company_id: str, admin_id: str) -> None:
    lifecycle.archive_row(
        "companies", company_id, admin_id, fetch_or_404=_get_company_by_id_or_404, noun="company",
        require_status="active",
    )


def _unarchive_one(company_id: str) -> None:
    lifecycle.unarchive_row(
        "companies", company_id, fetch_or_404=_get_company_by_id_or_404, noun="company", restore_status="active",
    )


def _soft_delete_one(company_id: str, admin_id: str) -> None:
    lifecycle.soft_delete_row("companies", company_id, admin_id, fetch_or_404=_get_company_by_id_or_404, noun="company")


def _restore_one(company_id: str) -> None:
    lifecycle.restore_row("companies", company_id, fetch_or_404=_get_company_by_id_or_404, noun="company")


def _permanent_delete_one(company_id: str) -> None:
    lifecycle.permanent_delete_row("companies", company_id, fetch_or_404=_get_company_by_id_or_404)


@router.patch("/{company_id}/archive", response_model=ApiResponse[CompanyResponse])
async def archive_company(company_id: str, admin_user: CurrentUser = Depends(require_admin)):
    _archive_one(company_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-archived", target_type="company", target_id=company_id,
    )
    updated = _get_company_by_id_or_404(company_id)
    return ok(data=_row_to_response(updated, _question_counts_by_company().get(company_id, 0)), message="Company archived.")


@router.patch("/{company_id}/unarchive", response_model=ApiResponse[CompanyResponse])
async def unarchive_company(company_id: str, admin_user: CurrentUser = Depends(require_admin)):
    _unarchive_one(company_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-unarchived", target_type="company", target_id=company_id,
    )
    updated = _get_company_by_id_or_404(company_id)
    return ok(data=_row_to_response(updated, _question_counts_by_company().get(company_id, 0)), message="Company unarchived.")


@router.delete("/{company_id}", response_model=ApiResponse[None])
async def delete_company(company_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Soft delete -- recoverable from the Deleted tab via `restore_company`,
    same shape as `delete_resource`/`delete_question`'s move away from a
    real row delete. A real, irreversible delete is `permanent_delete_company`."""
    _soft_delete_one(company_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-deleted", target_type="company", target_id=company_id,
    )
    return ok(data=None, message="Company deleted. It can be restored from the Deleted tab.")


@router.patch("/{company_id}/restore", response_model=ApiResponse[CompanyResponse])
async def restore_company(company_id: str, admin_user: CurrentUser = Depends(require_admin)):
    _restore_one(company_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-restored", target_type="company", target_id=company_id,
    )
    updated = _get_company_by_id_or_404(company_id)
    return ok(data=_row_to_response(updated, _question_counts_by_company().get(company_id, 0)), message="Company restored.")


@router.delete("/{company_id}/permanent", response_model=ApiResponse[None])
async def permanent_delete_company(company_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """The real, irreversible `delete()` -- `question_companies` rows
    cascade (migration 0001); `interview_experiences`/`resources`/
    `alumni_profiles`/`community_posts`/`calendar_events` all use
    `on delete set null`, so history referencing this company survives
    with a now-null company reference rather than cascading away, same as
    every other FK in this schema pointing at `companies`."""
    _permanent_delete_one(company_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-permanently-deleted", target_type="company", target_id=company_id,
    )
    return ok(message="Company permanently deleted.")


@router.post("/bulk-action", response_model=ApiResponse[CompanyBulkActionResponse])
async def bulk_company_action(payload: CompanyBulkActionRequest, admin_user: CurrentUser = Depends(require_admin)):
    """Bulk Archive / Unarchive / Delete / Restore / Permanent Delete --
    same `lifecycle.run_bulk` loop-and-collect-succeeded/failed shape every
    other bulk endpoint in this codebase already uses."""
    if payload.action not in _VALID_BULK_ACTIONS:
        raise AppException(f"Invalid bulk action: {payload.action}", status_code=422)
    if not payload.company_ids:
        raise AppException("Provide at least one company id.", status_code=422)
    if len(payload.company_ids) > 200:
        raise AppException("Bulk actions are limited to 200 companies at a time.", status_code=422)

    def _run_one(company_id: str) -> None:
        if payload.action == "archive":
            _archive_one(company_id, admin_user.id)
        elif payload.action == "unarchive":
            _unarchive_one(company_id)
        elif payload.action == "delete":
            _soft_delete_one(company_id, admin_user.id)
        elif payload.action == "restore":
            _restore_one(company_id)
        elif payload.action == "permanent-delete":
            _permanent_delete_one(company_id)

    succeeded, failed = lifecycle.run_bulk(payload.company_ids, _run_one)

    bulk_audit_action = {
        "archive": "company-bulk-archived",
        "unarchive": "company-bulk-unarchived",
        "delete": "company-bulk-deleted",
        "restore": "company-bulk-restored",
        "permanent-delete": "company-bulk-permanently-deleted",
    }[payload.action]
    if succeeded:
        audit.log_admin_action(
            admin_id=admin_user.id, action=bulk_audit_action, target_type="company", target_id=succeeded[0],
            metadata={"count": len(succeeded), "company_ids": succeeded},
        )

    return ok(
        data=CompanyBulkActionResponse(
            succeeded=succeeded, failed=failed, undo_action=_UNDOABLE_BULK_ACTIONS.get(payload.action),
        ),
        message=f"{len(succeeded)} compan{'y' if len(succeeded) == 1 else 'ies'} updated"
        + (f", {len(failed)} failed." if failed else "."),
    )


@router.post("/{canonical_id}/merge", response_model=ApiResponse[CompanyMergeResponse])
async def merge_company(
    canonical_id: str, payload: CompanyMergeRequest, admin_user: CurrentUser = Depends(require_admin)
):
    """Merge `duplicate_id` into `canonical_id` -- see `company_merge.py`
    for what actually happens (reassigns every table referencing
    `company_id`, combines question/experience counts, soft-deletes the
    duplicate)."""
    result = company_merge.merge_companies(
        canonical_id=canonical_id, duplicate_id=payload.duplicate_id, admin_id=admin_user.id
    )
    audit.log_admin_action(
        admin_id=admin_user.id, action="company-merged", target_type="company", target_id=canonical_id,
        metadata={"duplicate_id": payload.duplicate_id},
    )
    return ok(
        data=CompanyMergeResponse(
            canonical_id=result.canonical_id,
            duplicate_id=result.duplicate_id,
            question_links_reassigned=result.question_links_reassigned,
            interview_experiences_reassigned=result.interview_experiences_reassigned,
            resources_reassigned=result.resources_reassigned,
            alumni_profiles_reassigned=result.alumni_profiles_reassigned,
            community_posts_reassigned=result.community_posts_reassigned,
            calendar_events_reassigned=result.calendar_events_reassigned,
            bookmarks_reassigned=result.bookmarks_reassigned,
            bookmarks_dropped_as_duplicate=result.bookmarks_dropped_as_duplicate,
        ),
        message="Companies merged.",
    )
