"""
Phase 15, Part 2 (Slice A) -- Feature 8: Shared Lifecycle Framework.

Extracted from the archive/soft-delete/restore/permanent-delete shape
Phase 15, Part 1 first built one-off inside `questions.py` (see migration
0016 and that module's `_archive_one`/`_unarchive_one`/`_soft_delete_one`/
`_restore_one`/`_permanent_delete_one`), once `resources.py` needed the
exact same four transitions on a second table this pass. This is a
genuine "two real callers" extraction, not a speculative one: both
`questions` and `resources` use the same generic column pair shape
(`archived_at`/`archived_by`, `deleted_at`/`deleted_by`) with the same
rules --
  - archive only ever happens from one specific "live" status (`'approved'`
    for both tables today);
  - soft delete is independent of `status` entirely -- a draft, approved,
    rejected, or archived row can each be deleted and later restored back
    to whichever status it actually had;
  - restore only ever undoes soft delete, never archive (that's what
    unarchive is for);
  - permanent delete is a real, irreversible row `delete()`, same as every
    table's pre-lifecycle `DELETE` endpoint used to do unconditionally.

What's deliberately NOT here: `questions.py`'s `_approve_or_reject_one` and
`_publish_one` stay put -- their notification calls and duplicate-recheck
side effects are genuinely table-specific, so forcing them into a shared
shape here would be a duplicate concept wearing a shared-looking wrapper,
not a real reduction in duplication. Only the four archive/delete-family
transitions, plus the bulk loop-and-collect-succeeded/failed shape every
bulk endpoint in this codebase already used (`resources.py`'s original
`bulk_action`, `questions.py`'s `bulk_question_action`), are common enough
across both tables to be worth a shared home.

`questions.py`'s own five helpers now call into this module instead of
keeping a second copy of the same SQL shapes -- their call sites (the
single-item endpoints, `bulk_question_action`), audit-log actions, and
Part 1 behavior are all unchanged. The one deliberate, non-behavioral
difference: validation-error wording is now generated from a `noun`
parameter (e.g. "Only approved questions can be archived...") rather than
hardcoded per table -- slightly less specific than Part 1's original
"approved (published) questions" wording, but the same condition, the same
status code, and the same field the frontend already only ever displays
in a toast.
"""
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Tuple

from app.core.exceptions import AppException
from app.core.supabase_client import get_supabase_admin

FetchOr404 = Callable[[str], Dict[str, Any]]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def archive_row(
    table: str,
    row_id: str,
    admin_id: str,
    *,
    fetch_or_404: FetchOr404,
    noun: str,
    require_status: str = "approved",
    status_column: str = "status",
) -> None:
    """Moves a row from `require_status` (default `'approved'` -- the one
    status every table's brief calls "live"/"published") to `'archived'`,
    stamping `archived_at`/`archived_by`."""
    row = fetch_or_404(row_id)
    if row.get(status_column) != require_status:
        raise AppException(
            f"Only {require_status} {noun}s can be archived -- this one is '{row.get(status_column)}'.",
            status_code=422,
        )
    get_supabase_admin().table(table).update(
        {status_column: "archived", "archived_at": _now_iso(), "archived_by": admin_id}
    ).eq("id", row_id).execute()


def unarchive_row(
    table: str,
    row_id: str,
    *,
    fetch_or_404: FetchOr404,
    noun: str,
    restore_status: str = "approved",
    status_column: str = "status",
) -> None:
    """Undoes `archive_row` -- back to `restore_status`, clearing
    `archived_at`/`archived_by`."""
    row = fetch_or_404(row_id)
    if row.get(status_column) != "archived":
        raise AppException(f"{noun.capitalize()} is '{row.get(status_column)}', not archived.", status_code=422)
    get_supabase_admin().table(table).update(
        {status_column: restore_status, "archived_at": None, "archived_by": None}
    ).eq("id", row_id).execute()


def soft_delete_row(table: str, row_id: str, admin_id: str, *, fetch_or_404: FetchOr404, noun: str) -> None:
    """Independent of `status` -- doesn't care what state the row is in,
    only whether it's already deleted."""
    row = fetch_or_404(row_id)
    if row.get("deleted_at"):
        raise AppException(f"{noun.capitalize()} is already deleted.", status_code=422)
    get_supabase_admin().table(table).update(
        {"deleted_at": _now_iso(), "deleted_by": admin_id}
    ).eq("id", row_id).execute()


def restore_row(table: str, row_id: str, *, fetch_or_404: FetchOr404, noun: str) -> None:
    """Undoes `soft_delete_row` only -- leaves whatever `status` the row
    already had untouched (that's the whole point: restoring a deleted-
    while-archived row comes back archived, not approved)."""
    row = fetch_or_404(row_id)
    if not row.get("deleted_at"):
        raise AppException(f"{noun.capitalize()} isn't deleted.", status_code=422)
    get_supabase_admin().table(table).update(
        {"deleted_at": None, "deleted_by": None}
    ).eq("id", row_id).execute()


def permanent_delete_row(table: str, row_id: str, *, fetch_or_404: FetchOr404) -> None:
    """The real, irreversible `delete()` -- usually reached from the
    Deleted tab after `soft_delete_row`, but not technically gated on it,
    same as Part 1's `permanent_delete_question`."""
    fetch_or_404(row_id)
    get_supabase_admin().table(table).delete().eq("id", row_id).execute()


def run_bulk(ids: List[str], action_fn: Callable[[str], None]) -> Tuple[List[str], List[Dict[str, str]]]:
    """The loop-and-collect-succeeded/failed shape every bulk endpoint in
    this codebase already had its own copy of (`resources.py`'s original
    `bulk_action`, `questions.py`'s `bulk_question_action`) -- one bad id
    fails just that id, not the whole batch. `action_fn` is expected to
    raise `AppException` (or a subclass, e.g. `NotFoundError`) on failure;
    its `.message` is what a fetch-or-404 helper already raises with the
    correct per-table wording (e.g. "Resource not found."), so this
    doesn't need a separate not-found message of its own."""
    succeeded: List[str] = []
    failed: List[Dict[str, str]] = []
    for item_id in ids:
        try:
            action_fn(item_id)
            succeeded.append(item_id)
        except AppException as exc:
            failed.append({"id": item_id, "error": exc.message})
    return succeeded, failed
