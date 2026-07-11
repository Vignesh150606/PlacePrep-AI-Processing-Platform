"""
Notification read endpoints -- the counterpart to `app.services.notifications`
(which only writes).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


class NotificationResponse(CamelModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    is_read: bool
    link_url: Optional[str]
    created_at: str


class NotificationListResponse(CamelModel):
    items: List[NotificationResponse]
    unread_count: int


@router.get("", response_model=ApiResponse[NotificationListResponse])
async def list_notifications(current_user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    rows = (
        admin.table("notifications")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    unread = admin.table("notifications").select("id", count="exact").eq("user_id", current_user.id).eq(
        "is_read", False
    ).execute()

    items = [NotificationResponse(**r) for r in rows]
    return ok(data=NotificationListResponse(items=items, unread_count=unread.count or 0), message="Notifications fetched.")


@router.post("/{notification_id}/read", response_model=ApiResponse[None])
async def mark_read(notification_id: str, current_user: CurrentUser = Depends(get_current_user)):
    get_supabase_admin().table("notifications").update({"is_read": True}).eq("id", notification_id).eq(
        "user_id", current_user.id
    ).execute()
    return ok(message="Notification marked as read.")


@router.post("/read-all", response_model=ApiResponse[None])
async def mark_all_read(current_user: CurrentUser = Depends(get_current_user)):
    get_supabase_admin().table("notifications").update({"is_read": True}).eq("user_id", current_user.id).eq(
        "is_read", False
    ).execute()
    return ok(message="All notifications marked as read.")
