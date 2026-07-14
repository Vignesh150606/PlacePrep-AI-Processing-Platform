"""
Bookmarks endpoints (Module 5). The `bookmarks` table and its RLS policies
already existed (migration 0002_sprint3_rls_storage.sql) -- this was purely a
missing endpoint.

Phase 6A: `target_type` gained `"company"` (migration 0011) so the Company
Intelligence Hub can bookmark a company itself, same as it already could
for a question/experience/pdf. No other change needed here -- this
endpoint was already generic over target_type.
"""
from typing import List

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import AppException
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_VALID_TARGET_TYPES = {"question", "interview-experience", "pdf", "company"}


class BookmarkResponse(CamelModel):
    id: str
    user_id: str
    target_type: str
    target_id: str
    created_at: str


class BookmarkListResponse(CamelModel):
    items: List[BookmarkResponse]


class BookmarkCreateRequest(CamelModel):
    target_type: str
    target_id: str


@router.get("", response_model=ApiResponse[BookmarkListResponse])
async def list_bookmarks(current_user: CurrentUser = Depends(get_current_user)):
    rows = (
        get_supabase_admin()
        .table("bookmarks")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return ok(data=BookmarkListResponse(items=[BookmarkResponse(**r) for r in rows]), message="Bookmarks fetched.")


@router.post("", response_model=ApiResponse[BookmarkResponse])
async def create_bookmark(payload: BookmarkCreateRequest, current_user: CurrentUser = Depends(get_current_user)):
    if payload.target_type not in _VALID_TARGET_TYPES:
        raise AppException(f"Invalid target type: {payload.target_type}")

    admin = get_supabase_admin()
    existing = (
        admin.table("bookmarks")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("target_type", payload.target_type)
        .eq("target_id", payload.target_id)
        .execute()
        .data
    )
    if existing:
        return ok(data=BookmarkResponse(**existing[0]), message="Already bookmarked.")

    row = (
        admin.table("bookmarks")
        .insert(
            {
                "user_id": current_user.id,
                "target_type": payload.target_type,
                "target_id": payload.target_id,
            }
        )
        .execute()
        .data[0]
    )
    return ok(data=BookmarkResponse(**row), message="Bookmarked.")


@router.delete("/{target_type}/{target_id}", response_model=ApiResponse[None])
async def delete_bookmark(target_type: str, target_id: str, current_user: CurrentUser = Depends(get_current_user)):
    get_supabase_admin().table("bookmarks").delete().eq("user_id", current_user.id).eq(
        "target_type", target_type
    ).eq("target_id", target_id).execute()
    return ok(message="Bookmark removed.")
