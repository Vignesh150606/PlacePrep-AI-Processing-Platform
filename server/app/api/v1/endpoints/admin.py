"""
Admin Portal -- Dashboard summary + User & Role management.

Before this, the only admin-specific surface was the Question Review Queue
(`/admin/review`) plus admin-only tabs bolted onto otherwise-shared pages
(PDF Library's Pending Approval / Processing Dashboard tabs, Calendar's
inline edit controls, Interview Experiences' inline moderation controls).
There was no single admin landing page, and -- more importantly -- no way
to view the user list or change a user's role without going into the
Supabase table editor directly. This module adds both, following the same
`require_admin`-gated, self-contained endpoint-module pattern used
throughout the rest of the API (see `processing.py` for the closest
precedent -- this file's dashboard-summary endpoint mirrors its
count-per-status query style).

Deliberately NOT built here (separate, larger passes -- see
PROJECT_STATE.md): an audit trail for role changes, storage/AI usage
tracking, and persisted error logs. Bundling those in would mean five
half-built things instead of one complete one.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_ROLE_NAMES = {1: "student", 2: "alumni", 3: "admin"}
_ROLE_IDS = {name: role_id for role_id, name in _ROLE_NAMES.items()}
_VALID_ROLES = tuple(_ROLE_IDS.keys())


class DashboardSummary(CamelModel):
    pending_pdf_approvals: int
    pending_question_reviews: int
    pending_interview_reviews: int
    reported_experience_count: int
    failed_processing_jobs: int
    total_users: int
    total_admins: int


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
        admin.table("questions").select("id", count="exact").eq("status", "pending-review").execute()
    )
    pending_experiences = (
        admin.table("interview_experiences")
        .select("id", count="exact")
        .eq("status", "pending-review")
        .execute()
    )
    failed_jobs = admin.table("processing_jobs").select("id", count="exact").eq("status", "failed").execute()
    total_users = admin.table("profiles").select("id", count="exact").execute()
    total_admins = admin.table("profiles").select("id", count="exact").eq("role_id", 3).execute()

    # No count=exact groupby support over a join here, so pull the (small)
    # reports table and de-dupe by experience_id in Python -- same approach
    # interview_experiences.py's own `_report_counts_for` already uses.
    report_rows = admin.table("interview_experience_reports").select("experience_id").execute().data or []
    reported_count = len({r["experience_id"] for r in report_rows})

    summary = DashboardSummary(
        pending_pdf_approvals=pending_pdfs.count or 0,
        pending_question_reviews=pending_questions.count or 0,
        pending_interview_reviews=pending_experiences.count or 0,
        reported_experience_count=reported_count,
        failed_processing_jobs=failed_jobs.count or 0,
        total_users=total_users.count or 0,
        total_admins=total_admins.count or 0,
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
        like_pattern = f"%{search}%"
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
    existing = admin.table("profiles").select("id").eq("id", user_id).execute().data
    if not existing:
        raise NotFoundError("User not found.")

    admin.table("profiles").update({"role_id": _ROLE_IDS[payload.role]}).eq("id", user_id).execute()
    row = admin.table("profiles").select("*").eq("id", user_id).single().execute().data
    return ok(data=_user_row_to_response(row), message=f"Role updated to {payload.role}.")
