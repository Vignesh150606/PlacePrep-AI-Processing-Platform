"""
Notification creation (Step 11). Thin wrapper over an insert so every call
site is one line and the shape can't drift.

Phase 16 added preference gating for exactly two categories -- see
migration 0018's docstring for why only these two: everything else this
module sends is a direct outcome of the recipient's own action or account
status (their upload got approved/rejected, their alumni verification
changed, they got suspended, ...) and muting those would hide things people
need to see, not reduce noise.
"""
from typing import Optional

from app.core.supabase_client import get_supabase_admin

NotificationType = str  # "extraction-started" | "extraction-complete" | "extraction-failed" | "questions-added"
# Phase 10 added "resource-pending-review" | "resource-approved" | "resource-rejected"
# Phase 13 added "question-pending-review" | "question-approved" | "question-rejected"
# -- see migration 0015's notifications_type_check for the authoritative list.

# The only two types Settings' notification_prefs actually gates -- pure
# discovery/social pings, not outcomes of the recipient's own actions.
_GATED_CATEGORIES = {
    "new-company": "contentUpdates",
    "new-resource": "contentUpdates",
    "calendar-update": "contentUpdates",
    "community-reply": "communityActivity",
}


def _is_muted(user_id: str, type_: str) -> bool:
    category = _GATED_CATEGORIES.get(type_)
    if category is None:
        return False  # not a discretionary type -- always sent, no lookup needed

    try:
        row = (
            get_supabase_admin()
            .table("profiles")
            .select("notification_prefs")
            .eq("id", user_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        return False  # fetch failed for any reason -- fail open, don't silently drop a notification

    prefs = (row or {}).get("notification_prefs") or {}
    return prefs.get(category, True) is False


def notify(*, user_id: str, type_: NotificationType, title: str, message: str, link_url: Optional[str] = None) -> None:
    if _is_muted(user_id, type_):
        return

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
