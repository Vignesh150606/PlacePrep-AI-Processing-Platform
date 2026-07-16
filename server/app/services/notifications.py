"""
Notification creation (Step 11). Thin wrapper over an insert so every call
site is one line and the shape can't drift.
"""
from typing import Optional

from app.core.supabase_client import get_supabase_admin

NotificationType = str  # "extraction-started" | "extraction-complete" | "extraction-failed" | "questions-added"
# Phase 10 added "resource-pending-review" | "resource-approved" | "resource-rejected"
# -- see migration 0012's notifications_type_check for the authoritative list.


def notify(*, user_id: str, type_: NotificationType, title: str, message: str, link_url: Optional[str] = None) -> None:
    get_supabase_admin().table("notifications").insert(
        {
            "user_id": user_id,
            "type": type_,
            "title": title,
            "message": message,
            "link_url": link_url,
        }
    ).execute()


def notify_admins(*, type_: NotificationType, title: str, message: str, link_url: Optional[str] = None) -> None:
    """Phase 7 (upload approval workflow): broadcast a notification to
    every admin, e.g. when a new upload is waiting for approval before AI
    processing can start. One row per admin (same shape as `notify()`) so
    the existing per-user notification feed/RLS needs no new concept."""
    admin = get_supabase_admin()
    admins = admin.table("profiles").select("id").eq("role_id", 3).execute().data or []
    for row in admins:
        notify(user_id=row["id"], type_=type_, title=title, message=message, link_url=link_url)
