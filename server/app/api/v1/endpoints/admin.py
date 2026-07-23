"""
Admin Portal -- Dashboard summary, User & Role management, and the Audit
Log (Modules 1 and 2 of the Admin Portal Expansion).

Before Module 1, the only admin-specific surface was the Question Review
Queue (`/admin/review`) plus admin-only tabs bolted onto otherwise-shared
pages (PDF Library's Pending Approval / Processing Dashboard tabs,
Calendar's inline edit controls, Interview Experiences' inline moderation
controls). There was no single admin landing page, and -- more
importantly -- no way to view the user list or change a user's role
without going into the Supabase table editor directly. Module 1 added
both. Module 2 adds the audit trail those role changes (and every other
admin write across the API) now feed into -- see `app/services/audit.py`
for the logging helper and migration `0010` for the table/RLS.

Follows the same `require_admin`-gated, self-contained endpoint-module
pattern used throughout the rest of the API (see `processing.py` for the
closest precedent -- the dashboard-summary endpoint mirrors its
count-per-status query style).

Still deliberately NOT built here (separate, larger passes -- see
PROJECT_STATE.md): storage/AI usage tracking and persisted error logs.

Phase 10: dashboard summary gained `pending_resource_reviews`, and the
audit target-type/action check constraints (migration 0012) gained
`"resource"` and the resource-specific actions -- the actual "Pending
Resources" moderation queue lives in `resources.py` (its own router,
mounted at `/resources`, not `/admin/resources`) plus a dedicated
`AdminResourcesPage` on the frontend, the same "own page, still part of
the Admin Portal" shape `/admin/review` already established for Question
Bank moderation -- not a second admin system.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.query_safety import safe_filter_value
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit

router = APIRouter()

_ROLE_NAMES = {1: "student", 2: "alumni", 3: "admin"}
_ROLE_IDS = {name: role_id for role_id, name in _ROLE_NAMES.items()}
_VALID_ROLES = tuple(_ROLE_IDS.keys())
_VALID_AUDIT_TARGET_TYPES = (
    "pdf", "question", "interview-experience", "user", "resource", "alumni",
    "community-post", "community-comment",
)


class DashboardSummary(CamelModel):
    pending_pdf_approvals: int
    pending_question_reviews: int
    pending_interview_reviews: int
    pending_resource_reviews: int
    pending_alumni_verifications: int
    reported_experience_count: int
    reported_community_content_count: int
    failed_processing_jobs: int
    total_users: int
    total_admins: int
    # Phase 15, Part 1 -- Question Lifecycle Management.
    archived_question_count: int
    deleted_question_count: int
    # Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management.
    archived_resource_count: int
    deleted_resource_count: int


class AdminUserResponse(CamelModel):
    id: str
    email: str
    full_name: str
    avatar_url: Optional[str]
    role: str
    college: Optional[str]
    department: Optional[str]
    year: Optional[int]
    created_at: str


class AdminUserListResponse(CamelModel):
    items: List[AdminUserResponse]
    total: int
    page: int
    page_size: int


class RoleUpdateRequest(CamelModel):
    role: str


def _user_row_to_response(row: Dict[str, Any]) -> AdminUserResponse:
    return AdminUserResponse(
        id=row["id"],
        email=row["email"],
        full_name=row["full_name"],
        avatar_url=row.get("avatar_url"),
        role=_ROLE_NAMES.get(row["role_id"], "student"),
        college=row.get("college"),
        department=row.get("department"),
        year=row.get("year"),
        created_at=row["created_at"],
    )


@router.get("/dashboard-summary", response_model=ApiResponse[DashboardSummary])
async def get_dashboard_summary(_admin: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()

    pending_pdfs = (
        admin.table("pdf_resources")
        .select("id", count="exact")
        .eq("processing_status", "pending-approval")
        .execute()
    )
    pending_questions = (
        admin.table("questions")
        .select("id", count="exact")
        .eq("status", "pending-review")
        .is_("deleted_at", "null")
        .execute()
    )
    pending_experiences = (
        admin.table("interview_experiences")
        .select("id", count="exact")
        .eq("status", "pending-review")
        .execute()
    )
    # Phase 15, Part 2: also needs the `deleted_at is null` filter --
    # same fix Part 1 already made to `pending_questions` above (a soft-
    # deleted-while-pending-review resource shouldn't still count as
    # "pending review" once it's been deleted).
    pending_resources = (
        admin.table("resources")
        .select("id", count="exact")
        .eq("status", "pending-review")
        .is_("deleted_at", "null")
        .execute()
    )
    pending_alumni = (
        admin.table("alumni_profiles").select("id", count="exact").eq("verification_status", "pending-review").execute()
    )
    failed_jobs = admin.table("processing_jobs").select("id", count="exact").eq("status", "failed").execute()
    total_users = admin.table("profiles").select("id", count="exact").execute()
    total_admins = admin.table("profiles").select("id", count="exact").eq("role_id", 3).execute()
    archived_questions = (
        admin.table("questions")
        .select("id", count="exact")
        .eq("status", "archived")
        .is_("deleted_at", "null")
        .execute()
    )
    deleted_questions = (
        admin.table("questions").select("id", count="exact").not_.is_("deleted_at", "null").execute()
    )
    archived_resources = (
        admin.table("resources")
        .select("id", count="exact")
        .eq("status", "archived")
        .is_("deleted_at", "null")
        .execute()
    )
    deleted_resources = (
        admin.table("resources").select("id", count="exact").not_.is_("deleted_at", "null").execute()
    )

    # No count=exact groupby support over a join here, so pull the (small)
    # reports table and de-dupe by experience_id in Python -- same approach
    # interview_experiences.py's own `_report_counts_for` already uses.
    report_rows = admin.table("interview_experience_reports").select("experience_id").execute().data or []
    reported_count = len({r["experience_id"] for r in report_rows})

    # Phase 12: same "small table, Python de-dupe" approach as the
    # interview-experience reports above -- reported posts + reported
    # comments, de-duped by their own id (not summed report rows).
    community_post_report_rows = admin.table("community_post_reports").select("post_id").execute().data or []
    community_comment_report_rows = (
        admin.table("community_comment_reports").select("comment_id").execute().data or []
    )
    reported_community_count = len({r["post_id"] for r in community_post_report_rows}) + len(
        {r["comment_id"] for r in community_comment_report_rows}
    )

    summary = DashboardSummary(
        pending_pdf_approvals=pending_pdfs.count or 0,
        pending_question_reviews=pending_questions.count or 0,
        pending_interview_reviews=pending_experiences.count or 0,
        pending_resource_reviews=pending_resources.count or 0,
        pending_alumni_verifications=pending_alumni.count or 0,
        reported_experience_count=reported_count,
        reported_community_content_count=reported_community_count,
        failed_processing_jobs=failed_jobs.count or 0,
        total_users=total_users.count or 0,
        total_admins=total_admins.count or 0,
        archived_question_count=archived_questions.count or 0,
        deleted_question_count=deleted_questions.count or 0,
        archived_resource_count=archived_resources.count or 0,
        deleted_resource_count=deleted_resources.count or 0,
    )
    return ok(data=summary, message="Dashboard summary fetched.")


@router.get("/users", response_model=ApiResponse[AdminUserListResponse])
async def list_users(
    _admin: CurrentUser = Depends(require_admin),
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    role: Optional[str] = None,
):
    if role is not None and role not in _VALID_ROLES:
        raise AppException(f"Invalid role filter: {role}", status_code=422)

    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    start = (page - 1) * page_size
    end = start + page_size - 1

    admin = get_supabase_admin()
    count_query = admin.table("profiles").select("id", count="exact")
    list_query = admin.table("profiles").select("*").order("created_at", desc=True).range(start, end)

    if role is not None:
        count_query = count_query.eq("role_id", _ROLE_IDS[role])
        list_query = list_query.eq("role_id", _ROLE_IDS[role])
    if search:
        like_pattern = safe_filter_value(f"%{search}%")
        or_filter = f"full_name.ilike.{like_pattern},email.ilike.{like_pattern}"
        count_query = count_query.or_(or_filter)
        list_query = list_query.or_(or_filter)

    count_result = count_query.execute()
    result = list_query.execute()
    items = [_user_row_to_response(r) for r in result.data or []]
    return ok(
        data=AdminUserListResponse(items=items, total=count_result.count or 0, page=page, page_size=page_size),
        message="Users fetched.",
    )


@router.patch("/users/{user_id}/role", response_model=ApiResponse[AdminUserResponse])
async def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    if payload.role not in _VALID_ROLES:
        raise AppException(f"Invalid role: {payload.role}", status_code=422)
    if user_id == admin_user.id:
        raise AppException("You can't change your own role. Ask another admin.", status_code=400)

    admin = get_supabase_admin()
    existing = admin.table("profiles").select("id, role_id").eq("id", user_id).execute().data
    if not existing:
        raise NotFoundError("User not found.")
    previous_role = _ROLE_NAMES.get(existing[0]["role_id"], "student")

    admin.table("profiles").update({"role_id": _ROLE_IDS[payload.role]}).eq("id", user_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="user-role-changed",
        target_type="user",
        target_id=user_id,
        metadata={"from": previous_role, "to": payload.role},
    )
    row = admin.table("profiles").select("*").eq("id", user_id).single().execute().data
    return ok(data=_user_row_to_response(row), message=f"Role updated to {payload.role}.")


class AuditLogEntry(CamelModel):
    id: str
    admin_id: str
    admin_name: str
    action: str
    target_type: str
    target_id: str
    metadata: Dict[str, Any]
    created_at: str


class AuditLogListResponse(CamelModel):
    items: List[AuditLogEntry]
    total: int
    page: int
    page_size: int


@router.get("/audit-logs", response_model=ApiResponse[AuditLogListResponse])
async def list_audit_logs(
    _admin: CurrentUser = Depends(require_admin),
    page: int = 1,
    page_size: int = 20,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
):
    if target_type is not None and target_type not in _VALID_AUDIT_TARGET_TYPES:
        raise AppException(f"Invalid target_type filter: {target_type}", status_code=422)

    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    start = (page - 1) * page_size
    end = start + page_size - 1

    admin = get_supabase_admin()
    count_query = admin.table("admin_audit_logs").select("id", count="exact")
    list_query = admin.table("admin_audit_logs").select("*").order("created_at", desc=True).range(start, end)

    if action:
        count_query = count_query.eq("action", action)
        list_query = list_query.eq("action", action)
    if target_type:
        count_query = count_query.eq("target_type", target_type)
        list_query = list_query.eq("target_type", target_type)

    count_result = count_query.execute()
    rows = list_query.execute().data or []

    # No FK-embed here (unlike some other list endpoints) -- this is the
    # only table in the codebase that would need a single-column embed
    # straight to `profiles`, and there's no existing precedent for that
    # exact shape to copy with confidence. A batch lookup + Python merge
    # is the same approach already used for cross-table names elsewhere
    # (see `processing.py`'s pdf-name lookup), just applied here too.
    admin_ids = sorted({r["admin_id"] for r in rows})
    admin_names: Dict[str, str] = {}
    if admin_ids:
        profile_rows = admin.table("profiles").select("id, full_name").in_("id", admin_ids).execute().data or []
        admin_names = {p["id"]: p["full_name"] for p in profile_rows}

    items = [
        AuditLogEntry(
            id=row["id"],
            admin_id=row["admin_id"],
            admin_name=admin_names.get(row["admin_id"], "Unknown"),
            action=row["action"],
            target_type=row["target_type"],
            target_id=row["target_id"],
            metadata=row.get("metadata") or {},
            created_at=row["created_at"],
        )
        for row in rows
    ]
    return ok(
        data=AuditLogListResponse(items=items, total=count_result.count or 0, page=page, page_size=page_size),
        message="Audit logs fetched.",
    )
