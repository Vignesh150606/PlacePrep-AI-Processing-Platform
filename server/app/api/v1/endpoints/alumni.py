"""
Alumni Intelligence Network endpoints (Phase 11).

Audit summary (see migration 0013's own docstring for the full pass notes):
before this module, "alumni" meant exactly one thing in this codebase -- a
plain RBAC role (`profiles.role_id = 2`) with no backing profile data at
all. This module adds a real, structured alumni profile on top of that
existing role, reusing every adjacent system instead of duplicating it:
  - Identity: the EXISTING `profiles` row -- name/avatar/email are read
    from there (batched lookup, see `_profiles_for`), never duplicated
    onto `alumni_profiles`.
  - Role: verifying an alumni profile here calls the EXACT SAME
    `profiles.role_id` update `admin.py`'s `update_user_role` performs
    (not a parallel role concept) -- see `_set_role` below. The reverse
    (suspend / remove verification) reverts it the same way.
  - Companies: the EXISTING `companies` table, same "optional FK +
    denormalized free-text fallback" shape `resources.author` established.
  - Moderation shape: the same pending/decided lifecycle
    `interview_experiences`/`resources` established, with 'verified'
    standing in for 'approved' (identity verification, not content
    moderation -- see migration 0013's docstring).
  - Admin audit trail / notifications: the EXISTING tables, extended.
  - Contributions: computed from the EXISTING `interview_experiences` /
    `resources` tables via denormalized counters those tables' own
    triggers maintain (migration 0013) -- never duplicated data, per the
    brief's own "No duplicated data" instruction.

Workflow (student self-submits, never self-promotes):
    Student -> POST /alumni (pending-review, profile stays role_id=1)
            -> admin GET /alumni?status=pending-review
            -> admin PATCH /alumni/{id}/status (verified/rejected)
               -- verifying bumps profiles.role_id to 2 (alumni)
            -> verified alumni appear in GET /alumni (directory) and on
               their Company Hub's Alumni tab.
    Admin can also skip the request entirely via POST /alumni/manual
    ("Manual verification" per the brief) -- creates AND verifies a
    profile for any user in one step.

Distinct from `PATCH /alumni/me` (self-edit -- available to the owner at
any verification status, so a profile can be completed/kept current) and
`PATCH /alumni/{id}` (admin edit -- same field set, any alumnus).
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.query_safety import safe_filter_value
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, notifications

router = APIRouter()

_VALID_STATUSES = {"pending-review", "verified", "rejected", "suspended"}
_VALID_AVAILABILITY = {"available", "busy", "unavailable"}
_VALID_SORTS = {"newest", "most-helpful", "most-contributions"}
# Same reasoning as resources.py/interview_experiences.py's page_size caps.
_MAX_PAGE_SIZE = 100
_EMBED = "*, companies(id, name)"

_ROLE_STUDENT = 1
_ROLE_ALUMNI = 2

# Editable by the profile owner (PATCH /alumni/me) and by an admin
# (PATCH /alumni/{id}) -- deliberately excludes verification-adjacent
# fields (status/method/verified_by/verified_at/rejection_reason), which
# only change via PATCH /alumni/{id}/status.
_EDITABLE_FIELDS = (
    "is_anonymous",
    "current_company_id",
    "current_company_name",
    "job_title",
    "department",
    "graduation_year",
    "location",
    "skills",
    "domains",
    "technologies",
    "bio",
    "career_journey",
    "preparation_strategy",
    "resume_tips",
    "interview_tips",
    "placement_advice",
    "availability_status",
    "mentorship_available",
    "linkedin_url",
    "portfolio_url",
    "github_url",
    "institution_email",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AlumniSubmissionRequest(CamelModel):
    is_anonymous: bool = False
    current_company_id: Optional[str] = None
    current_company_name: Optional[str] = None
    current_role: str = Field(..., min_length=1, max_length=200)
    department: Optional[str] = None
    graduation_year: int = Field(..., ge=1990, le=2100)
    location: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)
    bio: Optional[str] = None
    career_journey: Optional[str] = None
    preparation_strategy: Optional[str] = None
    resume_tips: Optional[str] = None
    interview_tips: Optional[str] = None
    placement_advice: Optional[str] = None
    mentorship_available: bool = False
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    institution_email: Optional[str] = None


class AlumniUpdateRequest(CamelModel):
    is_anonymous: Optional[bool] = None
    current_company_id: Optional[str] = None
    current_company_name: Optional[str] = None
    current_role: Optional[str] = None
    department: Optional[str] = None
    graduation_year: Optional[int] = Field(default=None, ge=1990, le=2100)
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    domains: Optional[List[str]] = None
    technologies: Optional[List[str]] = None
    bio: Optional[str] = None
    career_journey: Optional[str] = None
    preparation_strategy: Optional[str] = None
    resume_tips: Optional[str] = None
    interview_tips: Optional[str] = None
    placement_advice: Optional[str] = None
    availability_status: Optional[str] = None
    mentorship_available: Optional[bool] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    institution_email: Optional[str] = None


class AlumniManualCreateRequest(AlumniSubmissionRequest):
    profile_id: str


class AlumniStatusUpdateRequest(CamelModel):
    status: str
    rejection_reason: Optional[str] = None


class AlumniResponse(CamelModel):
    id: str
    profile_id: str
    full_name: str
    avatar_url: Optional[str] = None
    email: str
    is_anonymous: bool
    current_company_id: Optional[str] = None
    current_company_name: str
    current_role: str
    department: Optional[str] = None
    graduation_year: int
    location: Optional[str] = None
    skills: List[str]
    domains: List[str]
    technologies: List[str]
    bio: Optional[str] = None
    career_journey: Optional[str] = None
    preparation_strategy: Optional[str] = None
    resume_tips: Optional[str] = None
    interview_tips: Optional[str] = None
    placement_advice: Optional[str] = None
    availability_status: str
    mentorship_available: bool
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    verification_status: str
    verification_method: str
    verified_by: Optional[str] = None
    verified_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    contribution_count: int
    helpful_votes_received: int
    created_at: str
    updated_at: str


class AlumniListResponse(CamelModel):
    items: List[AlumniResponse]
    total: int
    page: int
    page_size: int


class AlumniAnalyticsResponse(CamelModel):
    total_alumni: int
    verified_alumni: int
    companies_represented: int
    department_counts: List[Dict[str, Any]]
    most_active_alumni: List[Dict[str, Any]]
    mentorship_available_count: int


def _profiles_for(profile_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Batched name/avatar/email lookup -- same "small table, Python merge"
    approach `resources.py`'s `_uploader_names_for` and `admin.py`'s
    audit-log admin-name lookup already use, rather than an ambiguous
    `profiles(...)` embed (this table has TWO foreign keys into `profiles`
    -- `profile_id` and `verified_by` -- so an unqualified embed would be
    ambiguous to PostgREST anyway)."""
    if not profile_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("profiles")
        .select("id, full_name, avatar_url, email")
        .in_("id", list(set(profile_ids)))
        .execute()
        .data
        or []
    )
    return {r["id"]: r for r in rows}


def _row_to_response(row: Dict[str, Any], profile: Optional[Dict[str, Any]] = None) -> AlumniResponse:
    profile = profile or {}
    return AlumniResponse(
        id=row["id"],
        profile_id=row["profile_id"],
        full_name=profile.get("full_name", "Unknown"),
        avatar_url=profile.get("avatar_url"),
        email=profile.get("email", ""),
        is_anonymous=row["is_anonymous"],
        current_company_id=row.get("current_company_id"),
        current_company_name=row.get("current_company_name") or "",
        current_role=row.get("job_title") or "",
        department=row.get("department"),
        graduation_year=row["graduation_year"],
        location=row.get("location"),
        skills=row.get("skills") or [],
        domains=row.get("domains") or [],
        technologies=row.get("technologies") or [],
        bio=row.get("bio"),
        career_journey=row.get("career_journey"),
        preparation_strategy=row.get("preparation_strategy"),
        resume_tips=row.get("resume_tips"),
        interview_tips=row.get("interview_tips"),
        placement_advice=row.get("placement_advice"),
        availability_status=row["availability_status"],
        mentorship_available=row["mentorship_available"],
        linkedin_url=row.get("linkedin_url"),
        portfolio_url=row.get("portfolio_url"),
        github_url=row.get("github_url"),
        verification_status=row["verification_status"],
        verification_method=row["verification_method"],
        verified_by=row.get("verified_by"),
        verified_at=row.get("verified_at"),
        rejection_reason=row.get("rejection_reason"),
        contribution_count=row.get("contribution_count", 0),
        helpful_votes_received=row.get("helpful_votes_received", 0),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _get_alumni_or_404(alumni_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin().table("alumni_profiles").select(_EMBED).eq("id", alumni_id).single().execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Alumni profile not found.")
        raise
    return result.data


def _get_alumni_by_profile_id(profile_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        get_supabase_admin().table("alumni_profiles").select(_EMBED).eq("profile_id", profile_id).execute().data
        or []
    )
    return rows[0] if rows else None


def _visible_or_404(row: Dict[str, Any], current_user: CurrentUser, admin: bool) -> Dict[str, Any]:
    if row["verification_status"] != "verified" and row["profile_id"] != current_user.id and not admin:
        raise NotFoundError("Alumni profile not found.")
    return row


def _set_role(profile_id: str, role_id: int) -> None:
    """Reuses the EXACT same `profiles.role_id` write `admin.py`'s
    `update_user_role` performs -- not a parallel role-change codepath.
    Only touches the row when the role actually needs to move, so
    verifying/suspending a profile whose role was already changed by an
    admin directly (via the Users & Roles page) is a harmless no-op."""
    get_supabase_admin().table("profiles").update({"role_id": role_id}).eq("id", profile_id).execute()


def _company_name_for(company_id: Optional[str]) -> Optional[str]:
    if not company_id:
        return None
    row = get_supabase_admin().table("companies").select("name").eq("id", company_id).execute().data
    return row[0]["name"] if row else None


@router.get("", response_model=ApiResponse[AlumniListResponse])
async def list_alumni(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    search: Optional[str] = Query(None, description="Matches name, role, bio, or current company"),
    company_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    graduation_year: Optional[int] = Query(None),
    domain: Optional[str] = Query(None, description="Comma-separated -- matches ANY of the given domains"),
    skill: Optional[str] = Query(None, description="Comma-separated -- matches ANY of the given skills"),
    mentorship_available: Optional[bool] = Query(None),
    status: Optional[str] = Query(None, description="pending-review | verified | rejected | suspended -- admin only"),
    sort_by: str = Query("newest", description="newest | most-helpful | most-contributions"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=_MAX_PAGE_SIZE),
):
    """Non-admins see verified alumni plus their own profile regardless of
    status (matches `resources.py`/`interview_experiences.py`'s "you can
    always see your own submission" pattern). Admins can additionally
    filter by `status` to work the verification queue."""
    if sort_by not in _VALID_SORTS:
        raise AppException(f"Invalid sort_by: {sort_by}", status_code=422)
    if status is not None and status not in _VALID_STATUSES:
        raise AppException(f"Invalid status: {status}", status_code=422)

    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    # Search also matches full_name via a small separate lookup (rather
    # than an ambiguous `profiles(...)` embed -- see `_profiles_for`'s
    # docstring for why) -- a real match, not a documented caveat.
    matching_profile_ids: List[str] = []
    if search:
        matching_profile_ids = [
            r["id"]
            for r in (
                admin_client.table("profiles").select("id").ilike("full_name", f"%{search}%").execute().data or []
            )
        ]

    def _base_query(select: str, count: Optional[str] = None):
        q = (
            admin_client.table("alumni_profiles").select(select, count=count)
            if count
            else admin_client.table("alumni_profiles").select(select)
        )
        if not admin:
            # NEW (Phase 16): a verified alumnus can opt out of the public
            # directory (`directory_visible`, migration 0018) without
            # losing their own ability to see their row -- same "you can
            # always see your own" shape as every other status filter in
            # this query, just nested inside the "verified" branch instead
            # of replacing it.
            q = q.or_(
                f"and(verification_status.eq.verified,directory_visible.eq.true),"
                f"profile_id.eq.{current_user.id}"
            )
        elif status:
            q = q.eq("verification_status", status)
        if company_id:
            q = q.eq("current_company_id", company_id)
        if department:
            q = q.ilike("department", f"%{department}%")
        if graduation_year:
            q = q.eq("graduation_year", graduation_year)
        if domain:
            domain_list = [d.strip() for d in domain.split(",") if d.strip()]
            if domain_list:
                q = q.overlaps("domains", domain_list)
        if skill:
            skill_list = [s.strip() for s in skill.split(",") if s.strip()]
            if skill_list:
                q = q.overlaps("skills", skill_list)
        if mentorship_available is not None:
            q = q.eq("mentorship_available", mentorship_available)
        if search:
            like = safe_filter_value(f"%{search}%")
            or_clauses = f"job_title.ilike.{like},bio.ilike.{like},current_company_name.ilike.{like}"
            if matching_profile_ids:
                or_clauses += f",profile_id.in.({','.join(matching_profile_ids)})"
            q = q.or_(or_clauses)
        return q

    order_column = {
        "newest": "created_at",
        "most-helpful": "helpful_votes_received",
        "most-contributions": "contribution_count",
    }[sort_by]

    rows = _base_query(_EMBED).order(order_column, desc=True).range(start, end).execute().data or []
    total = _base_query("id", count="exact").execute().count or 0

    profiles = _profiles_for([r["profile_id"] for r in rows])
    items = [_row_to_response(r, profiles.get(r["profile_id"])) for r in rows]

    return ok(
        data=AlumniListResponse(items=items, total=total, page=page, page_size=page_size),
        message="Alumni fetched.",
    )


@router.get("/analytics", response_model=ApiResponse[AlumniAnalyticsResponse])
async def alumni_analytics(current_user: CurrentUser = Depends(get_current_user)):
    """Open to any signed-in user, not admin-gated: every number here is
    either a verified-alumni aggregate (already public via the directory)
    or an admin-facing total -- nothing sensitive. Powers both the public
    Alumni Directory header and the Admin Alumni page's stats section, so
    it isn't duplicated in two places."""
    admin_client = get_supabase_admin()

    total_alumni = admin_client.table("alumni_profiles").select("id", count="exact").execute().count or 0
    verified_rows = (
        admin_client.table("alumni_profiles")
        .select("profile_id, current_company_id, current_company_name, department, contribution_count")
        .eq("verification_status", "verified")
        .execute()
        .data
        or []
    )
    mentorship_count = (
        admin_client.table("alumni_profiles")
        .select("id", count="exact")
        .eq("verification_status", "verified")
        .eq("mentorship_available", True)
        .execute()
        .count
        or 0
    )

    # Small table (verified alumni only) -- de-duped in Python, same
    # "no count=exact groupby over a join" approach admin.py's
    # dashboard-summary already uses for reported-experience counts.
    companies = {r["current_company_id"] or r["current_company_name"] for r in verified_rows if (r["current_company_id"] or r["current_company_name"])}

    dept_counts: Dict[str, int] = {}
    for r in verified_rows:
        dept = r.get("department")
        if dept:
            dept_counts[dept] = dept_counts.get(dept, 0) + 1
    department_counts = [{"department": d, "count": c} for d, c in sorted(dept_counts.items(), key=lambda x: -x[1])]

    top_contributors = sorted(verified_rows, key=lambda r: r.get("contribution_count", 0), reverse=True)[:5]
    top_contributors = [r for r in top_contributors if r.get("contribution_count", 0) > 0]
    top_profiles = _profiles_for([r["profile_id"] for r in top_contributors])
    most_active = [
        {
            "profileId": r["profile_id"],
            "fullName": top_profiles.get(r["profile_id"], {}).get("full_name", "Unknown"),
            "contributionCount": r.get("contribution_count", 0),
        }
        for r in top_contributors
    ]

    return ok(
        data=AlumniAnalyticsResponse(
            total_alumni=total_alumni,
            verified_alumni=len(verified_rows),
            companies_represented=len(companies),
            department_counts=department_counts,
            most_active_alumni=most_active,
            mentorship_available_count=mentorship_count,
        ),
        message="Alumni analytics fetched.",
    )


@router.get("/me", response_model=ApiResponse[Optional[AlumniResponse]])
async def get_my_alumni_profile(current_user: CurrentUser = Depends(get_current_user)):
    """Returns `null` (not a 404) when the signed-in user has never
    submitted an alumni profile -- the frontend uses this to decide
    between showing "Become an Alumni" versus "Edit my profile"."""
    row = _get_alumni_by_profile_id(current_user.id)
    if not row:
        return ok(data=None, message="No alumni profile yet.")
    profile = _profiles_for([current_user.id]).get(current_user.id)
    return ok(data=_row_to_response(row, profile), message="Alumni profile fetched.")


@router.get("/{alumni_id}", response_model=ApiResponse[AlumniResponse])
async def get_alumni(
    alumni_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
):
    row = _visible_or_404(_get_alumni_or_404(alumni_id), current_user, admin)
    profile = _profiles_for([row["profile_id"]]).get(row["profile_id"])
    return ok(data=_row_to_response(row, profile), message="Alumni profile fetched.")


@router.post("", response_model=ApiResponse[AlumniResponse])
async def submit_alumni_profile(
    payload: AlumniSubmissionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Self-submission -- always `profile_id = current_user.id`, always
    starts `pending-review`. Students cannot self-promote: only
    `PATCH /alumni/{id}/status` (admin-only) can move a profile to
    'verified', which is the only thing that changes `profiles.role_id`."""
    if _get_alumni_by_profile_id(current_user.id):
        raise AppException("You already have an alumni profile.", status_code=409)

    admin_client = get_supabase_admin()
    company_name = payload.current_company_name or _company_name_for(payload.current_company_id) or ""

    insert_payload: Dict[str, Any] = {
        "profile_id": current_user.id,
        "is_anonymous": payload.is_anonymous,
        "current_company_id": payload.current_company_id or None,
        "current_company_name": company_name,
        "job_title": payload.current_role,
        "department": payload.department,
        "graduation_year": payload.graduation_year,
        "location": payload.location,
        "skills": payload.skills,
        "domains": payload.domains,
        "technologies": payload.technologies,
        "bio": payload.bio,
        "career_journey": payload.career_journey,
        "preparation_strategy": payload.preparation_strategy,
        "resume_tips": payload.resume_tips,
        "interview_tips": payload.interview_tips,
        "placement_advice": payload.placement_advice,
        "mentorship_available": payload.mentorship_available,
        "linkedin_url": payload.linkedin_url,
        "portfolio_url": payload.portfolio_url,
        "github_url": payload.github_url,
        "institution_email": payload.institution_email,
        "verification_status": "pending-review",
        "verification_method": "self-submitted",
    }
    row_id = admin_client.table("alumni_profiles").insert(insert_payload).execute().data[0]["id"]
    row = _get_alumni_or_404(row_id)

    notifications.notify_admins(
        type_="alumni-verification-pending",
        title="New alumni verification request",
        message=f'"{payload.current_role}" at {company_name or "an unlisted company"} is waiting for verification.',
        link_url="/admin/alumni",
    )

    profile = _profiles_for([current_user.id]).get(current_user.id)
    return ok(data=_row_to_response(row, profile), message="Submitted. It's now waiting for admin verification.")


def _apply_editable_updates(payload: CamelModel, existing: Dict[str, Any]) -> Dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    # `current_role` (the API/Pydantic field, matching the frontend's
    # `currentRole`) maps to the `job_title` DB column -- `current_role`
    # itself can't be a bare column identifier (CURRENT_ROLE is a reserved
    # SQL keyword), see migration 0013's note on the column.
    if "current_role" in updates:
        updates["job_title"] = updates.pop("current_role")
    updates = {k: v for k, v in updates.items() if k in _EDITABLE_FIELDS}
    if "availability_status" in updates and updates["availability_status"] not in _VALID_AVAILABILITY:
        raise AppException(f"Invalid availability_status: {updates['availability_status']}", status_code=422)
    # Keep the denormalized company name in sync with a newly-chosen
    # company_id, same "auto-fill from the directory" step submission uses.
    if "current_company_id" in updates and "current_company_name" not in updates:
        looked_up = _company_name_for(updates["current_company_id"])
        if looked_up:
            updates["current_company_name"] = looked_up
    return updates


@router.patch("/me", response_model=ApiResponse[AlumniResponse])
async def update_my_alumni_profile(
    payload: AlumniUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Self-edit -- available at ANY verification status (including
    'pending-review' and 'verified'), so an alumnus can complete or keep
    their own bio/tips/availability/mentorship flag current without admin
    involvement for every small change. Verification-adjacent fields
    aren't in `_EDITABLE_FIELDS` at all, so they can't be set this way."""
    existing = _get_alumni_by_profile_id(current_user.id)
    if not existing:
        raise NotFoundError("You don't have an alumni profile yet. Submit one first.")

    updates = _apply_editable_updates(payload, existing)
    if updates:
        get_supabase_admin().table("alumni_profiles").update(updates).eq("id", existing["id"]).execute()

    row = _get_alumni_or_404(existing["id"])
    profile = _profiles_for([current_user.id]).get(current_user.id)
    return ok(data=_row_to_response(row, profile), message="Alumni profile updated.")


@router.patch("/{alumni_id}", response_model=ApiResponse[AlumniResponse])
async def admin_update_alumni(
    alumni_id: str,
    payload: AlumniUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin edit -- same editable field set as self-edit, any alumnus."""
    existing = _get_alumni_or_404(alumni_id)
    updates = _apply_editable_updates(payload, existing)
    if updates:
        get_supabase_admin().table("alumni_profiles").update(updates).eq("id", alumni_id).execute()
        audit.log_admin_action(
            admin_id=admin_user.id,
            action="alumni-edited",
            target_type="alumni",
            target_id=alumni_id,
            metadata={"fields_changed": sorted(updates.keys())},
        )

    row = _get_alumni_or_404(alumni_id)
    profile = _profiles_for([row["profile_id"]]).get(row["profile_id"])
    return ok(data=_row_to_response(row, profile), message="Alumni profile updated.")


@router.patch("/{alumni_id}/status", response_model=ApiResponse[AlumniResponse])
async def update_alumni_status(
    alumni_id: str,
    payload: AlumniStatusUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin verification workflow: Approve ('verified') / Reject /
    Suspend / Remove Verification ('pending-review'). This is the ONLY
    codepath (besides `POST /alumni/manual`) that touches `profiles.role_id`
    -- verifying bumps a student to the alumni role; suspending or removing
    verification reverts it, so a suspended/unverified alumnus doesn't keep
    alumni-gated capabilities elsewhere in the app. Transitions are
    restricted to ones that make sense (e.g. you can't "reject" an already
    -verified profile -- suspend or remove-verification is the right tool
    for that), same care `resources.py`'s status endpoint takes with
    rejection_reason being required."""
    if payload.status not in _VALID_STATUSES:
        raise AppException(f"status must be one of {sorted(_VALID_STATUSES)}.", status_code=422)
    if payload.status == "rejected" and not payload.rejection_reason:
        raise AppException("rejection_reason is required when rejecting a request.", status_code=422)

    row = _get_alumni_or_404(alumni_id)
    current_status = row["verification_status"]

    valid_transitions = {
        "verified": {"pending-review"},
        "rejected": {"pending-review"},
        "suspended": {"verified"},
        "pending-review": {"verified", "suspended", "rejected"},
    }
    if current_status not in valid_transitions[payload.status]:
        raise AppException(
            f"Can't move a '{current_status}' profile to '{payload.status}'.", status_code=422
        )

    updates: Dict[str, Any] = {"verification_status": payload.status}
    if payload.status == "verified":
        updates.update({"verified_by": admin_user.id, "verified_at": _now_iso(), "rejection_reason": None})
        _set_role(row["profile_id"], _ROLE_ALUMNI)
    elif payload.status == "rejected":
        updates["rejection_reason"] = payload.rejection_reason
    elif payload.status == "suspended":
        _set_role(row["profile_id"], _ROLE_STUDENT)
    elif payload.status == "pending-review":
        updates.update({"verified_by": None, "verified_at": None, "rejection_reason": None})
        _set_role(row["profile_id"], _ROLE_STUDENT)

    get_supabase_admin().table("alumni_profiles").update(updates).eq("id", alumni_id).execute()

    action_map = {
        "verified": "alumni-verified",
        "rejected": "alumni-rejected",
        "suspended": "alumni-suspended",
        "pending-review": "alumni-verification-removed",
    }
    audit.log_admin_action(
        admin_id=admin_user.id,
        action=action_map[payload.status],
        target_type="alumni",
        target_id=alumni_id,
        metadata={"current_role": row.get("job_title"), "from_status": current_status},
    )

    notify_map = {
        "verified": ("alumni-verified", "You're a verified alumnus!", "Your alumni profile is now live in the directory."),
        "rejected": ("alumni-rejected", "Alumni request rejected", f"Reason: {payload.rejection_reason}"),
        "suspended": ("alumni-suspended", "Alumni profile suspended", "Your alumni profile has been suspended by an admin."),
        "pending-review": ("alumni-rejected", "Alumni verification removed", "Your alumni verification was reset. You can update your profile and it will be reviewed again."),
    }
    notif_type, notif_title, notif_message = notify_map[payload.status]
    notifications.notify(
        user_id=row["profile_id"], type_=notif_type, title=notif_title, message=notif_message, link_url="/alumni"
    )

    updated_row = _get_alumni_or_404(alumni_id)
    profile = _profiles_for([updated_row["profile_id"]]).get(updated_row["profile_id"])
    return ok(data=_row_to_response(updated_row, profile), message=f"Alumni profile {payload.status}.")


@router.post("/manual", response_model=ApiResponse[AlumniResponse])
async def manual_create_alumni(
    payload: AlumniManualCreateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin "Manual verification": creates AND immediately verifies a
    profile on behalf of another user in one step -- distinct from
    approving a self-submitted request (see this module's docstring)."""
    if _get_alumni_by_profile_id(payload.profile_id):
        raise AppException("This user already has an alumni profile.", status_code=409)

    admin_client = get_supabase_admin()
    company_name = payload.current_company_name or _company_name_for(payload.current_company_id) or ""
    now = _now_iso()

    insert_payload: Dict[str, Any] = {
        "profile_id": payload.profile_id,
        "is_anonymous": payload.is_anonymous,
        "current_company_id": payload.current_company_id or None,
        "current_company_name": company_name,
        "job_title": payload.current_role,
        "department": payload.department,
        "graduation_year": payload.graduation_year,
        "location": payload.location,
        "skills": payload.skills,
        "domains": payload.domains,
        "technologies": payload.technologies,
        "bio": payload.bio,
        "career_journey": payload.career_journey,
        "preparation_strategy": payload.preparation_strategy,
        "resume_tips": payload.resume_tips,
        "interview_tips": payload.interview_tips,
        "placement_advice": payload.placement_advice,
        "mentorship_available": payload.mentorship_available,
        "linkedin_url": payload.linkedin_url,
        "portfolio_url": payload.portfolio_url,
        "github_url": payload.github_url,
        "institution_email": payload.institution_email,
        "verification_status": "verified",
        "verification_method": "admin-manual",
        "verified_by": admin_user.id,
        "verified_at": now,
    }
    row_id = admin_client.table("alumni_profiles").insert(insert_payload).execute().data[0]["id"]
    _set_role(payload.profile_id, _ROLE_ALUMNI)

    audit.log_admin_action(
        admin_id=admin_user.id,
        action="alumni-manual-created",
        target_type="alumni",
        target_id=row_id,
        metadata={"profile_id": payload.profile_id, "current_role": payload.current_role},
    )
    notifications.notify(
        user_id=payload.profile_id,
        type_="alumni-verified",
        title="You're a verified alumnus!",
        message="An admin created and verified your alumni profile. You can edit it any time.",
        link_url="/alumni",
    )

    row = _get_alumni_or_404(row_id)
    profile = _profiles_for([payload.profile_id]).get(payload.profile_id)
    return ok(data=_row_to_response(row, profile), message="Alumni profile created and verified.")


@router.delete("/{alumni_id}", response_model=ApiResponse[None])
async def delete_alumni(alumni_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Hard delete -- for spam/bad-faith submissions. Reverts the role to
    student first if it had been bumped to alumni, same cleanup
    `update_alumni_status`'s suspend/remove-verification paths perform."""
    row = _get_alumni_or_404(alumni_id)
    if row["verification_status"] == "verified":
        _set_role(row["profile_id"], _ROLE_STUDENT)
    get_supabase_admin().table("alumni_profiles").delete().eq("id", alumni_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="alumni-deleted",
        target_type="alumni",
        target_id=alumni_id,
        metadata={"current_role": row.get("job_title")},
    )
    return ok(data=None, message="Alumni profile deleted.")
