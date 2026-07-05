"""
Profile endpoints. The row itself is created automatically by the
`handle_new_user()` Postgres trigger the moment Supabase Auth creates the
`auth.users` row — there is deliberately no POST/create endpoint here.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_ROLE_NAMES = {1: "student", 2: "alumni", 3: "admin"}
_COMPLETABLE_FIELDS = ("avatar_url", "college", "department", "year")


def _compute_completion(row: Dict[str, Any]) -> int:
    filled = sum(1 for field in _COMPLETABLE_FIELDS if row.get(field))
    return round(100 * filled / len(_COMPLETABLE_FIELDS))


class ProfileResponse(CamelModel):
    id: str
    email: str
    full_name: str
    avatar_url: Optional[str]
    role: str
    college: Optional[str]
    department: Optional[str]
    year: Optional[int]
    profile_completion: int
    created_at: str
    updated_at: str


class ProfileUpdateRequest(CamelModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    avatar_url: Optional[str] = None
    college: Optional[str] = Field(default=None, max_length=200)
    department: Optional[str] = Field(default=None, max_length=200)
    year: Optional[int] = Field(default=None, ge=1900, le=2100)


def _row_to_response(row: Dict[str, Any]) -> ProfileResponse:
    return ProfileResponse(
        id=row["id"],
        email=row["email"],
        full_name=row["full_name"],
        avatar_url=row.get("avatar_url"),
        role=_ROLE_NAMES.get(row["role_id"], "student"),
        college=row.get("college"),
        department=row.get("department"),
        year=row.get("year"),
        profile_completion=_compute_completion(row),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _fetch_profile_row(user_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin()
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Profile not found. Please sign out and sign in again.")
        raise

    return result.data


@router.get("/me", response_model=ApiResponse[ProfileResponse])
async def get_my_profile(current_user: CurrentUser = Depends(get_current_user)):
    row = _fetch_profile_row(current_user.id)
    return ok(data=_row_to_response(row), message="Profile fetched.")


@router.patch("/me", response_model=ApiResponse[ProfileResponse])
async def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    if updates:
        get_supabase_admin().table("profiles").update(updates).eq("id", current_user.id).execute()

    row = _fetch_profile_row(current_user.id)
    return ok(data=_row_to_response(row), message="Profile updated.")
