"""
Settings endpoints (Phase 16).

Deliberately thin. Most of what the Settings *page* does is NOT here:
  - Profile fields (name/avatar/college/department/year) are the EXISTING
    PATCH /profiles/me (profiles.py) -- this file doesn't touch them.
  - Password change, Google account linking, and "sign out of other
    devices" are Supabase Auth actions the frontend calls directly via
    `supabase.auth.*` -- there is no PlacePrep-owned state for any of them,
    so no endpoint belongs here either.
  - Theme and accessibility (reduced motion, font size) are client-only,
    same as theme-provider.tsx already established.

What IS here is the handful of things that genuinely need a server round
trip: the two preference columns migration 0018 added (notification
categories, default interview-experience anonymity, alumni directory
visibility), plus the two irreversible account-level actions (export,
delete) that have to be server-side because they touch data across many
tables the client can't query directly.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import AppException, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


class NotificationPrefs(CamelModel):
    content_updates: bool = True
    community_activity: bool = True


class SettingsResponse(CamelModel):
    notification_prefs: NotificationPrefs
    default_anonymous_interview: bool
    # null for students -- only a verified-or-pending alumnus has a row to
    # carry this preference on.
    alumni_directory_visible: Optional[bool]


class SettingsUpdateRequest(CamelModel):
    notification_prefs: Optional[NotificationPrefs] = None
    default_anonymous_interview: Optional[bool] = None
    alumni_directory_visible: Optional[bool] = None


def _fetch_profile_row(user_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin()
            .table("profiles")
            .select("id, role_id, notification_prefs, default_anonymous_interview")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Profile not found. Please sign out and sign in again.")
        raise
    return result.data


def _fetch_alumni_row(user_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        get_supabase_admin()
        .table("alumni_profiles")
        .select("directory_visible")
        .eq("profile_id", user_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _row_to_response(profile_row: Dict[str, Any], alumni_row: Optional[Dict[str, Any]]) -> SettingsResponse:
    prefs = profile_row.get("notification_prefs") or {}
    return SettingsResponse(
        notification_prefs=NotificationPrefs(
            content_updates=prefs.get("contentUpdates", prefs.get("content_updates", True)),
            community_activity=prefs.get("communityActivity", prefs.get("community_activity", True)),
        ),
        default_anonymous_interview=profile_row.get("default_anonymous_interview", False),
        alumni_directory_visible=alumni_row["directory_visible"] if alumni_row else None,
    )


@router.get("/me", response_model=ApiResponse[SettingsResponse])
async def get_my_settings(current_user: CurrentUser = Depends(get_current_user)):
    profile_row = _fetch_profile_row(current_user.id)
    alumni_row = _fetch_alumni_row(current_user.id)
    return ok(data=_row_to_response(profile_row, alumni_row), message="Settings fetched.")


@router.patch("/me", response_model=ApiResponse[SettingsResponse])
async def update_my_settings(
    payload: SettingsUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    admin = get_supabase_admin()
    profile_updates: Dict[str, Any] = {}
    if payload.notification_prefs is not None:
        profile_updates["notification_prefs"] = {
            "contentUpdates": payload.notification_prefs.content_updates,
            "communityActivity": payload.notification_prefs.community_activity,
        }
    if payload.default_anonymous_interview is not None:
        profile_updates["default_anonymous_interview"] = payload.default_anonymous_interview
    if profile_updates:
        admin.table("profiles").update(profile_updates).eq("id", current_user.id).execute()

    if payload.alumni_directory_visible is not None:
        alumni_row = _fetch_alumni_row(current_user.id)
        if alumni_row is None:
            raise AppException("Only alumni profiles have a directory visibility setting.", status_code=400)
        admin.table("alumni_profiles").update(
            {"directory_visible": payload.alumni_directory_visible}
        ).eq("profile_id", current_user.id).execute()

    profile_row = _fetch_profile_row(current_user.id)
    alumni_row = _fetch_alumni_row(current_user.id)
    return ok(data=_row_to_response(profile_row, alumni_row), message="Settings updated.")


# --- Data export -------------------------------------------------------------
# One query per table the user owns data in, all keyed off their own
# `current_user.id` -- exactly the same tables/columns every other endpoint
# in this API already reads, just gathered in one place instead of one
# table. No new table, no background job: the volume of data a single
# student generates (quiz attempts, bookmarks, a handful of submissions)
# is small enough to assemble synchronously.
class DataExportResponse(CamelModel):
    exported_at: str
    profile: Dict[str, Any]
    quiz_attempts: List[Dict[str, Any]]
    bookmarks: List[Dict[str, Any]]
    wrong_answer_marks: List[Dict[str, Any]]
    submitted_questions: List[Dict[str, Any]]
    submitted_resources: List[Dict[str, Any]]
    submitted_interview_experiences: List[Dict[str, Any]]
    community_posts: List[Dict[str, Any]]
    community_comments: List[Dict[str, Any]]


@router.get("/export", response_model=ApiResponse[DataExportResponse])
async def export_my_data(current_user: CurrentUser = Depends(get_current_user)):
    from datetime import datetime, timezone

    admin = get_supabase_admin()
    uid = current_user.id

    def rows(table: str, column: str) -> List[Dict[str, Any]]:
        return admin.table(table).select("*").eq(column, uid).execute().data or []

    data = DataExportResponse(
        exported_at=datetime.now(timezone.utc).isoformat(),
        profile=_fetch_profile_row(uid),
        quiz_attempts=rows("quiz_attempts", "user_id"),
        bookmarks=rows("bookmarks", "user_id"),
        wrong_answer_marks=rows("wrong_answer_marks", "user_id"),
        submitted_questions=rows("questions", "created_by"),
        submitted_resources=rows("resources", "uploaded_by"),
        submitted_interview_experiences=rows("interview_experiences", "author_id"),
        community_posts=rows("community_posts", "author_id"),
        community_comments=rows("community_comments", "author_id"),
    )
    return ok(data=data, message="Export ready.")


# --- Delete account -----------------------------------------------------------
@router.delete("/account", response_model=ApiResponse[None])
async def delete_my_account(current_user: CurrentUser = Depends(get_current_user)):
    """Deletes the Supabase Auth user, which cascades through every
    `references public.profiles (id) on delete cascade` FK already in the
    schema (quiz_attempts, bookmarks, wrong_answer_marks, notifications,
    alumni_profiles, ...) -- no manual cleanup needed, same as every other
    place in this codebase that relies on that cascade.

    Admins are blocked from self-deleting, the same "you can't touch your
    own [admin-relevant state]" guard `admin.py`'s `update_user_role`
    already established for role changes -- deleting the only admin (or
    any admin, since there's no cheap way to tell "only" from here without
    a second query race) would either strand the app admin-less or require
    a judgment call this endpoint shouldn't make silently. An admin who
    wants to leave should have another admin remove them.
    """
    admin = get_supabase_admin()
    profile = (
        admin.table("profiles").select("role_id").eq("id", current_user.id).single().execute().data
    )
    if profile and profile.get("role_id") == 3:
        raise AppException(
            "Admin accounts can't be self-deleted. Ask another admin to remove your account.",
            status_code=400,
        )

    admin.auth.admin.delete_user(current_user.id)
    return ok(message="Account deleted.")
