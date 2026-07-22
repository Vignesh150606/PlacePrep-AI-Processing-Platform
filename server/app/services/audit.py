"""
Admin action audit trail (Admin Portal Expansion, Module 2).

Distinct from `activity_logs` (migration 0001), which is a per-user
"recent activity" feed shown on that user's OWN dashboard (login,
pdf-uploaded, bookmark-added, ...). This is the opposite direction:
actions an ADMIN takes against content or other users' accounts, kept
for accountability and visible only to admins (see the `/admin/audit-logs`
endpoint in `admin.py` and the admin-only RLS policy in migration 0010).

Call `log_admin_action()` right after the write it's describing succeeds
-- same placement as the existing `notifications.notify()` calls this
mirrors (e.g. `pdfs.py`'s `approve_pdf`), and deliberately not wrapped in
a try/except: that matches how `notifications.notify()` already behaves
here (a failed insert propagates rather than being silently swallowed),
so this doesn't introduce a second, inconsistent failure behavior for the
same kind of best-effort side-write.
"""
from typing import Any, Dict, Optional

from app.core.supabase_client import get_supabase_admin

AuditAction = str
AuditTargetType = str  # "pdf" | "question" | "interview-experience" | "user" | "resource" | "question-import-batch"


def log_admin_action(
    *,
    admin_id: str,
    action: AuditAction,
    target_type: AuditTargetType,
    target_id: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    get_supabase_admin().table("admin_audit_logs").insert(
        {
            "admin_id": admin_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "metadata": metadata or {},
        }
    ).execute()
