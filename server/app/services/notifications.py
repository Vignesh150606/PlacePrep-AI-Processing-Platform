"""
Notification creation (Step 11). Thin wrapper over an insert so every call
site is one line and the shape can't drift.
"""
from typing import Optional

from app.core.supabase_client import get_supabase_admin

NotificationType = str  # "extraction-started" | "extraction-complete" | "extraction-failed" | "questions-added"


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
