"""
Resource Intelligence Hub endpoints (Phase 10).

Audit summary (see PROJECT_STATE.md for the full pass notes): before this
module, "resources" only meant `pdf_resources` -- files uploaded
specifically to feed the AI question-extraction pipeline (see `pdfs.py`).
There was no generic resource -- no cheat sheets, formula sheets, roadmaps,
previous papers, external links, or videos anywhere in the schema. This
module adds exactly that, reusing every adjacent system instead of
duplicating it:
  - Storage: the EXISTING 'pdfs' bucket, same path convention
    (`{uploader_id}/{uuid}.{ext}`) `pdfs.py`'s `upload_pdf` already uses,
    so the EXISTING storage RLS policies (migration 0002) apply unchanged.
    No new bucket.
  - Bookmarks: the EXISTING generic `bookmarks` table
    (`target_type = 'resource'`) -- see `bookmarks.py`, unchanged here.
  - Taxonomy: the EXISTING `subjects` / `topics` / `companies` tables
    (via the new-but-minimal `subjects.py` / `topics.py` read endpoints
    and the EXISTING `companies.py`).
  - Moderation shape: the same pending-review -> approved/rejected
    lifecycle `interview_experiences.py` established, including its
    "non-admins see approved plus their own regardless of status" rule.
  - Admin audit trail: the EXISTING `admin_audit_logs` table (migration
    0010), extended with resource-specific actions.

Workflow (student submits, never publishes directly):
    Student -> POST /resources (pending-review)
            -> admin GET /resources?status=pending-review
            -> admin PATCH /resources/{id}/status (approve/reject)
               or PATCH /resources/{id} (edit) or DELETE /resources/{id}
               or POST /resources/bulk-action (bulk approve/reject/delete)
            -> approved resources are visible to everyone via
               GET /resources (students) and the Company Hub's Resources tab.

`bookmark_count` and `download_count` are real, tracked numbers, not
decoration -- see migration 0012's docstring for how each is kept
consistent (a trigger for the former, an atomic RPC for the latter).
`version` is a genuine edit-revision counter: it only increments in
`update_resource` when a real field actually changes, mirroring how
`questions.py`'s `update_question` only audits when `updates` is
non-empty.

Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management (Feature 1):
extends the above with the same archive/soft-delete/restore/permanent-
delete shape migration 0016 first gave `questions` -- see migration 0017
and `app/services/lifecycle.py` (Feature 8's "Shared Lifecycle Framework",
also now used by `questions.py`). `DELETE /{id}` changed from a real
`delete()` to a soft delete, same reasoning as Part 1's change to
`delete_question` ("Deletion should NEVER immediately remove data"); the
real, irreversible delete is now `DELETE /{id}/permanent`. `POST
/bulk-action` gained bulk archive/unarchive/restore/permanent-delete
alongside its original approve/reject/delete; a new `PATCH /bulk-update`
covers Feature 1's "Bulk Category Update" / "Bulk Tag Update" as one
endpoint, mirroring `questions.py`'s `bulk_update_questions` shape.
"""
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.config import get_settings
from app.core.exceptions import AppException, NotFoundError
from app.core.rate_limit import upload_limit
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, lifecycle, notifications

router = APIRouter()

_VALID_CATEGORIES = {
    "company", "subject", "topic", "aptitude", "technical", "interview",
    "cheat-sheet", "formula-sheet", "roadmap", "previous-paper",
    "external-link", "video", "pdf-notes",
}
_VALID_DIFFICULTIES = {"easy", "medium", "hard"}
# 'archived' is Phase 15, Part 2 (Slice A) -- see migration 0017's docstring
# for why it's not a separate "published" concept (same reasoning Part 1
# already established for `questions`: `'approved'` already means "live"
# everywhere this module's own `list_resources`/`_visible_or_404` check it).
_VALID_STATUSES = {"pending-review", "approved", "rejected", "archived"}
_VALID_SORTS = {"newest", "most-downloaded", "most-bookmarked"}
# Phase 15, Part 2 (Slice A): extended with archive/unarchive/restore/
# permanent-delete, mirroring questions.py's `_VALID_BULK_ACTIONS` (a
# resource's lifecycle now has the same shape, just without the
# draft/publish states a manually-authored question can be in).
_VALID_BULK_ACTIONS = {"approve", "reject", "delete", "archive", "unarchive", "restore", "permanent-delete"}
# Actions with a clean, one-call inverse -- surfaced as an "Undo" action on
# the bulk toolbar's result toast. Same reasoning as questions.py's own set:
# approve/reject/permanent-delete are excluded (no clean inverse, or reusing
# the opposite action would silently drop the other one's own semantics).
_UNDOABLE_BULK_ACTIONS = {"archive": "unarchive", "unarchive": "archive", "delete": "restore"}
_BULK_ACTION_PAST_TENSE = {
    "approve": "approved",
    "reject": "rejected",
    "delete": "deleted",
    "archive": "archived",
    "unarchive": "unarchived",
    "restore": "restored",
    "permanent-delete": "permanently deleted",
}
# Same reasoning as questions.py/interview_experiences.py's page_size caps --
# bounds a single request's cost regardless of what the client asks for.
_MAX_PAGE_SIZE = 100
_EMBED = "*, subjects(id, name), topics(id, name), companies(id, name)"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResourceResponse(CamelModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    topic_id: Optional[str] = None
    topic_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    difficulty: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    author: Optional[str] = None
    uploaded_by: str
    uploader_name: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_kind: Optional[str] = None
    external_url: Optional[str] = None
    version: int
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    download_count: int
    bookmark_count: int
    uploaded_at: str
    updated_at: str
    # Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management.
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class ResourceListResponse(CamelModel):
    items: List[ResourceResponse]
    total: int
    page: int
    page_size: int


class ResourceStatusUpdateRequest(CamelModel):
    status: str
    rejection_reason: Optional[str] = None


class ResourceUpdateRequest(CamelModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    company_id: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    external_url: Optional[str] = None


class BulkActionRequest(CamelModel):
    resource_ids: List[str] = Field(..., min_length=1, max_length=200)
    action: str
    rejection_reason: Optional[str] = None


class BulkActionResponse(CamelModel):
    succeeded: List[str]
    failed: List[Dict[str, str]]
    # Phase 15, Part 2 (Slice A) -- Feature 1's "Undo when possible", same
    # shape as `QuestionBulkActionResponse.undo_action`.
    undo_action: Optional[str] = None


# =============================================================================
# Phase 15, Part 2 (Slice A) -- Feature 1's "Bulk Category Update" / "Bulk Tag
# Update", as one endpoint rather than two near-identical ones -- mirrors
# questions.py's `QuestionBulkUpdateRequest`/`bulk_update_questions` shape.
# =============================================================================

class ResourceBulkUpdateRequest(CamelModel):
    resource_ids: List[str] = Field(..., min_length=1, max_length=200)
    category: Optional[str] = None
    add_tags: Optional[List[str]] = None


class ResourceBulkUpdateResponse(CamelModel):
    succeeded: List[str]
    failed: List[Dict[str, str]]


class DownloadResponse(CamelModel):
    download_url: str
    kind: str  # "file" | "external"
    download_count: int


# =============================================================================
# Phase 15, Part 2 (Slice A) -- Feature 6 (Analytics), scoped to resources --
# mirrors questions.py's `QuestionAnalyticsResponse` docstring for why
# interview-experience/alumni/community/company-wide analytics are a
# separate, deferred pass.
# =============================================================================

class ResourceGrowthPoint(CamelModel):
    date: str
    count: int


class ResourceModeratorActivityEntry(CamelModel):
    admin_id: str
    admin_name: str
    action_count: int


class ResourceAnalyticsResponse(CamelModel):
    by_status: Dict[str, int]
    by_category: Dict[str, int]
    total_active: int
    archived_count: int
    deleted_count: int
    approval_rate: float
    growth_last_30_days: List[ResourceGrowthPoint]
    moderator_activity: List[ResourceModeratorActivityEntry]


def _uploader_names_for(user_ids: List[str]) -> Dict[str, str]:
    if not user_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("profiles")
        .select("id, full_name")
        .in_("id", list(set(user_ids)))
        .execute()
        .data
        or []
    )
    return {r["id"]: r["full_name"] for r in rows}


def _row_to_response(row: Dict[str, Any], uploader_name: Optional[str] = None) -> ResourceResponse:
    subject = row.get("subjects") or {}
    topic = row.get("topics") or {}
    company = row.get("companies") or {}
    return ResourceResponse(
        id=row["id"],
        title=row["title"],
        description=row.get("description"),
        category=row["category"],
        subject_id=row.get("subject_id"),
        subject_name=subject.get("name"),
        topic_id=row.get("topic_id"),
        topic_name=topic.get("name"),
        company_id=row.get("company_id"),
        company_name=company.get("name"),
        difficulty=row.get("difficulty"),
        tags=row.get("tags") or [],
        author=row.get("author"),
        uploaded_by=row["uploaded_by"],
        uploader_name=uploader_name,
        file_name=row.get("file_name"),
        file_size_bytes=row.get("file_size_bytes"),
        file_kind=row.get("file_kind"),
        external_url=row.get("external_url"),
        version=row["version"],
        status=row["status"],
        reviewed_by=row.get("reviewed_by"),
        reviewed_at=row.get("reviewed_at"),
        rejection_reason=row.get("rejection_reason"),
        download_count=row.get("download_count", 0),
        bookmark_count=row.get("bookmark_count", 0),
        uploaded_at=row["created_at"],
        updated_at=row["updated_at"],
        archived_at=row.get("archived_at"),
        archived_by=row.get("archived_by"),
        deleted_at=row.get("deleted_at"),
        deleted_by=row.get("deleted_by"),
    )


def _get_resource_or_404(resource_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("resources").select(_EMBED).eq("id", resource_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Resource not found.")
        raise
    return result.data


def _visible_or_404(row: Dict[str, Any], current_user: CurrentUser, admin: bool) -> Dict[str, Any]:
    if row["status"] != "approved" and row["uploaded_by"] != current_user.id and not admin:
        raise NotFoundError("Resource not found.")
    return row


@router.get("", response_model=ApiResponse[ResourceListResponse])
async def list_resources(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    search: Optional[str] = Query(None, description="Case-insensitive match on title or description"),
    category: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    subject_id: Optional[str] = Query(None),
    topic_id: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated -- matches ANY of the given tags"),
    status: Optional[str] = Query(None, description="pending-review | approved | rejected | archived -- admin only"),
    sort_by: str = Query("newest", description="newest | most-downloaded | most-bookmarked"),
    deleted: bool = Query(
        False, description="Phase 15, Part 2 -- admin only: true shows ONLY soft-deleted resources (the Deleted tab)"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=_MAX_PAGE_SIZE),
):
    """Non-admins see approved resources plus their own regardless of
    status (matches the `pdfs.py` / `interview_experiences.py` "you can
    always see your own submission" pattern). Admins can additionally
    filter by `status` to work the moderation queue."""
    if category is not None and category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {category}", status_code=422)
    if difficulty is not None and difficulty not in _VALID_DIFFICULTIES:
        raise AppException(f"Invalid difficulty: {difficulty}", status_code=422)
    if sort_by not in _VALID_SORTS:
        raise AppException(f"Invalid sort_by: {sort_by}", status_code=422)
    if deleted and not admin:
        raise AppException("Only admins can view deleted resources.", status_code=403)

    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    def _base_query(select: str, count: Optional[str] = None):
        q = admin_client.table("resources").select(select, count=count) if count else admin_client.table(
            "resources"
        ).select(select)
        # Phase 15, Part 2 -- soft-deleted resources are hidden everywhere by
        # default (Question Bank's sibling behavior for `questions`, migration
        # 0016/0017); only an explicit admin `deleted=true` request (the admin
        # "Deleted" tab) sees them, and it sees ONLY them regardless of
        # `status` -- same mutually-exclusive-with-every-other-tab shape
        # `list_questions` already established.
        if deleted:
            q = q.not_.is_("deleted_at", "null")
        else:
            q = q.is_("deleted_at", "null")
        if not admin:
            q = q.or_(f"status.eq.approved,uploaded_by.eq.{current_user.id}")
        elif status:
            if status not in _VALID_STATUSES:
                raise AppException(f"Invalid status: {status}", status_code=422)
            q = q.eq("status", status)
        if category:
            q = q.eq("category", category)
        if company_id:
            q = q.eq("company_id", company_id)
        if subject_id:
            q = q.eq("subject_id", subject_id)
        if topic_id:
            q = q.eq("topic_id", topic_id)
        if difficulty:
            q = q.eq("difficulty", difficulty)
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                q = q.overlaps("tags", tag_list)
        if search:
            like = f"%{search}%"
            q = q.or_(f"title.ilike.{like},description.ilike.{like}")
        return q

    order_column = {
        "newest": "created_at",
        "most-downloaded": "download_count",
        "most-bookmarked": "bookmark_count",
    }[sort_by]

    query = _base_query(_EMBED).order(order_column, desc=True).range(start, end)
    rows = query.execute().data or []

    count_query = _base_query("id", count="exact")
    total = count_query.execute().count or 0

    uploader_names = _uploader_names_for([r["uploaded_by"] for r in rows])
    items = [_row_to_response(r, uploader_names.get(r["uploaded_by"])) for r in rows]

    return ok(
        data=ResourceListResponse(items=items, total=total, page=page, page_size=page_size),
        message="Resources fetched.",
    )


@router.get("/{resource_id}", response_model=ApiResponse[ResourceResponse])
async def get_resource(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
):
    row = _visible_or_404(_get_resource_or_404(resource_id), current_user, admin)
    uploader_name = _uploader_names_for([row["uploaded_by"]]).get(row["uploaded_by"])
    return ok(data=_row_to_response(row, uploader_name), message="Resource fetched.")


@router.post("", response_model=ApiResponse[ResourceResponse])
@upload_limit()
async def create_resource(
    request: Request,  # required by slowapi's decorator to read the client IP
    title: str = Form(..., min_length=1, max_length=200),
    description: Optional[str] = Form(None),
    category: str = Form(...),
    subject_id: Optional[str] = Form(None),
    topic_id: Optional[str] = Form(None),
    company_id: Optional[str] = Form(None),
    difficulty: Optional[str] = Form(None),
    tags: Optional[str] = Form(None, description="Comma-separated"),
    author: Optional[str] = Form(None),
    external_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    if category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {category}", status_code=422)
    if difficulty is not None and difficulty not in _VALID_DIFFICULTIES:
        raise AppException(f"Invalid difficulty: {difficulty}", status_code=422)

    has_file = file is not None and file.filename
    if not has_file and not external_url:
        raise AppException("Provide either a file or an external link.", status_code=422)
    if has_file and external_url:
        raise AppException("Provide either a file or an external link, not both.", status_code=422)
    if external_url and not (external_url.startswith("http://") or external_url.startswith("https://")):
        raise AppException("External link must start with http:// or https://.", status_code=422)

    admin = get_supabase_admin()
    settings = get_settings()
    insert_payload: Dict[str, Any] = {
        "title": title,
        "description": description,
        "category": category,
        "subject_id": subject_id or None,
        "topic_id": topic_id or None,
        "company_id": company_id or None,
        "difficulty": difficulty,
        "tags": [t.strip() for t in tags.split(",")] if tags else [],
        "author": author,
        "uploaded_by": current_user.id,
        "external_url": None,
        "status": "pending-review",
    }

    if has_file:
        # Same validation + storage convention as pdfs.py's upload_pdf --
        # reuses the SAME 'pdfs' bucket and the SAME `{uploader}/{uuid}.ext`
        # path shape, so the existing storage RLS policies apply unchanged.
        is_pdf = file.content_type in settings.allowed_pdf_mime_types
        is_image = file.content_type in settings.allowed_image_mime_types
        if not is_pdf and not is_image:
            raise AppException("Only PDF, PNG, or JPEG files are accepted.", status_code=415)
        file_kind = "pdf" if is_pdf else "image"

        contents = await file.read()
        max_bytes = settings.MAX_PDF_SIZE_BYTES if is_pdf else settings.MAX_IMAGE_SIZE_BYTES
        if len(contents) > max_bytes:
            max_mb = max_bytes // (1024 * 1024)
            raise AppException(f"File exceeds the {max_mb}MB limit.", status_code=413)
        if len(contents) == 0:
            raise AppException("Uploaded file is empty.", status_code=400)

        extension = "pdf" if is_pdf else (file.content_type.split("/")[-1] or "jpg")
        storage_path = f"{current_user.id}/{uuid.uuid4()}.{extension}"
        admin.storage.from_(settings.PDF_STORAGE_BUCKET).upload(
            storage_path, contents, {"content-type": file.content_type}
        )
        insert_payload.update(
            {
                "file_storage_path": storage_path,
                "file_name": file.filename or f"upload.{extension}",
                "file_size_bytes": len(contents),
                "file_kind": file_kind,
            }
        )
    else:
        insert_payload["external_url"] = external_url

    row_id = admin.table("resources").insert(insert_payload).execute().data[0]["id"]
    row = _get_resource_or_404(row_id)

    notifications.notify_admins(
        type_="resource-pending-review",
        title="New resource awaiting review",
        message=f'"{title}" was submitted and is waiting for admin review before publishing.',
        link_url="/admin/resources",
    )

    return ok(data=_row_to_response(row), message="Resource submitted. It's now waiting for admin review.")


@router.post("/{resource_id}/download", response_model=ApiResponse[DownloadResponse])
async def download_resource(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
):
    """Increments `download_count` atomically (see migration 0012's
    `increment_resource_downloads`) and hands back something the frontend
    can actually open: a short-lived signed URL for an uploaded file (the
    'pdfs' bucket is private, so a raw path is useless to the browser), or
    the external link as-is for a link/video resource."""
    row = _visible_or_404(_get_resource_or_404(resource_id), current_user, admin)
    admin_client = get_supabase_admin()

    if row.get("file_storage_path"):
        signed = admin_client.storage.from_(get_settings().PDF_STORAGE_BUCKET).create_signed_url(
            row["file_storage_path"], 300
        )
        download_url = signed.get("signedURL") or signed.get("signedUrl")
        kind = "file"
    else:
        download_url = row["external_url"]
        kind = "external"

    new_count = admin_client.rpc("increment_resource_downloads", {"p_resource_id": resource_id}).execute().data
    return ok(
        data=DownloadResponse(download_url=download_url, kind=kind, download_count=new_count),
        message="Download ready.",
    )


@router.patch("/{resource_id}/status", response_model=ApiResponse[ResourceResponse])
async def update_resource_status(
    resource_id: str,
    payload: ResourceStatusUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Approve / Reject."""
    if payload.status not in ("approved", "rejected"):
        raise AppException("status must be 'approved' or 'rejected'.")
    if payload.status == "rejected" and not payload.rejection_reason:
        raise AppException("rejection_reason is required when rejecting a resource.", status_code=422)

    row = _get_resource_or_404(resource_id)
    updates = {
        "status": payload.status,
        "reviewed_by": admin_user.id,
        "reviewed_at": _now_iso(),
        "rejection_reason": payload.rejection_reason if payload.status == "rejected" else None,
    }
    get_supabase_admin().table("resources").update(updates).eq("id", resource_id).execute()

    audit.log_admin_action(
        admin_id=admin_user.id,
        action="resource-approved" if payload.status == "approved" else "resource-rejected",
        target_type="resource",
        target_id=resource_id,
        metadata={"title": row["title"]},
    )
    notifications.notify(
        user_id=row["uploaded_by"],
        type_="resource-approved" if payload.status == "approved" else "resource-rejected",
        title=f"Resource {payload.status}",
        message=(
            f'"{row["title"]}" is now published and visible to everyone.'
            if payload.status == "approved"
            else f'"{row["title"]}" was rejected: {payload.rejection_reason}'
        ),
        link_url="/resources",
    )

    updated_row = _get_resource_or_404(resource_id)
    uploader_name = _uploader_names_for([updated_row["uploaded_by"]]).get(updated_row["uploaded_by"])
    return ok(data=_row_to_response(updated_row, uploader_name), message=f"Resource {payload.status}.")


@router.patch("/bulk-update", response_model=ApiResponse[ResourceBulkUpdateResponse])
async def bulk_update_resources(
    payload: ResourceBulkUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Feature 1's "Bulk Category Update" / "Bulk Tag Update" -- one
    endpoint, not two near-identical ones, mirroring `questions.py`'s
    `bulk_update_questions` shape (every field independently optional;
    `add_tags` merges into each resource's existing tags rather than
    replacing them, same as that endpoint's own `add_tags`). MUST be
    registered before `PATCH /{resource_id}` below -- both are single-
    path-segment PATCH routes, so "bulk-update" would otherwise be
    swallowed as a `resource_id` value by the earlier match. This is the
    exact registration-order hazard Part 1 first found (and fixed the
    same way) for `questions.py`'s own bulk-update route."""
    if payload.category is not None and payload.category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {payload.category}", status_code=422)
    if payload.category is None and not payload.add_tags:
        raise AppException("Provide at least one field to bulk-update.", status_code=422)

    fields_touched: set = set()

    def _run_one(resource_id: str) -> None:
        row = _get_resource_or_404(resource_id)
        updates: Dict[str, Any] = {}
        if payload.category is not None:
            updates["category"] = payload.category
            fields_touched.add("category")
        if payload.add_tags:
            existing_tags = set(row.get("tags") or [])
            updates["tags"] = sorted(existing_tags | set(payload.add_tags))
            fields_touched.add("tags")
        if updates:
            updates["version"] = row["version"] + 1
            get_supabase_admin().table("resources").update(updates).eq("id", resource_id).execute()

    succeeded, failed = lifecycle.run_bulk(payload.resource_ids, _run_one)

    audit.log_admin_action(
        admin_id=admin_user.id,
        action="resource-bulk-updated",
        target_type="resource",
        target_id=succeeded[0] if succeeded else payload.resource_ids[0],
        metadata={
            "resource_ids": succeeded,
            "fields_changed": sorted(fields_touched),
            "count": len(succeeded),
            "failed_count": len(failed),
        },
    )
    return ok(
        data=ResourceBulkUpdateResponse(succeeded=succeeded, failed=failed),
        message=f"{len(succeeded)} resource(s) updated, {len(failed)} failed.",
    )


@router.patch("/{resource_id}", response_model=ApiResponse[ResourceResponse])
async def update_resource(
    resource_id: str,
    payload: ResourceUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Edit. Only increments `version` when a field
    genuinely changes -- mirrors `questions.py`'s "only audit when
    `updates` is non-empty" pattern."""
    row = _get_resource_or_404(resource_id)
    if payload.category is not None and payload.category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {payload.category}", status_code=422)
    if payload.difficulty is not None and payload.difficulty not in _VALID_DIFFICULTIES:
        raise AppException(f"Invalid difficulty: {payload.difficulty}", status_code=422)

    updates: Dict[str, Any] = {}
    if payload.title is not None:
        updates["title"] = payload.title
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.category is not None:
        updates["category"] = payload.category
    if payload.subject_id is not None:
        updates["subject_id"] = payload.subject_id
    if payload.topic_id is not None:
        updates["topic_id"] = payload.topic_id
    if payload.company_id is not None:
        updates["company_id"] = payload.company_id
    if payload.difficulty is not None:
        updates["difficulty"] = payload.difficulty
    if payload.tags is not None:
        updates["tags"] = payload.tags
    if payload.author is not None:
        updates["author"] = payload.author
    if payload.external_url is not None:
        updates["external_url"] = payload.external_url

    if updates:
        updates["version"] = row["version"] + 1
        get_supabase_admin().table("resources").update(updates).eq("id", resource_id).execute()
        audit.log_admin_action(
            admin_id=admin_user.id,
            action="resource-edited",
            target_type="resource",
            target_id=resource_id,
            metadata={"fields_changed": sorted(updates.keys() - {"version"})},
        )

    updated_row = _get_resource_or_404(resource_id)
    uploader_name = _uploader_names_for([updated_row["uploaded_by"]]).get(updated_row["uploaded_by"])
    return ok(data=_row_to_response(updated_row, uploader_name), message="Resource updated.")


# =============================================================================
# Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management (Feature 1):
# shared per-resource helpers, all delegating to `app/services/lifecycle.py`
# (Feature 8) rather than keeping a private copy of the same SQL shapes
# `questions.py` already established in Part 1. Both the single-item
# endpoints below AND `bulk_action`/`bulk_update_resources` call these.
# =============================================================================

def _archive_one(resource_id: str, admin_id: str) -> None:
    lifecycle.archive_row("resources", resource_id, admin_id, fetch_or_404=_get_resource_or_404, noun="resource")


def _unarchive_one(resource_id: str) -> None:
    lifecycle.unarchive_row("resources", resource_id, fetch_or_404=_get_resource_or_404, noun="resource")


def _soft_delete_one(resource_id: str, admin_id: str) -> None:
    lifecycle.soft_delete_row(
        "resources", resource_id, admin_id, fetch_or_404=_get_resource_or_404, noun="resource",
    )


def _restore_one(resource_id: str) -> None:
    lifecycle.restore_row("resources", resource_id, fetch_or_404=_get_resource_or_404, noun="resource")


def _permanent_delete_one(resource_id: str) -> None:
    """The real, irreversible delete -- includes the best-effort storage
    cleanup the old unconditional `DELETE /{resource_id}` used to do
    before this phase (there's still no precedent for this elsewhere in
    the codebase -- no `pdf_resources` delete endpoint exists -- so this
    stays the one genuine cleanup step, just moved here now that
    `DELETE /{resource_id}` itself is a soft delete)."""
    row = _get_resource_or_404(resource_id)
    if row.get("file_storage_path"):
        try:
            get_supabase_admin().storage.from_(get_settings().PDF_STORAGE_BUCKET).remove(
                [row["file_storage_path"]]
            )
        except Exception:  # noqa: BLE001 -- storage cleanup best-effort, DB row deletion is what actually matters
            pass
    lifecycle.permanent_delete_row("resources", resource_id, fetch_or_404=_get_resource_or_404)


@router.delete("/{resource_id}", response_model=ApiResponse[None])
async def delete_resource(
    resource_id: str,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Delete. Phase 15, Part 2 changed this from a real
    `delete()` to a soft delete ("Deletion should NEVER immediately remove
    data" -- same brief line, same change Part 1 already made to
    `delete_question`) -- see `_soft_delete_one` and migration 0017. Use
    `permanent_delete_resource` for the actual, irreversible row delete
    (which is also where the storage cleanup now happens)."""
    _soft_delete_one(resource_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="resource-deleted", target_type="resource", target_id=resource_id,
    )
    return ok(data=None, message="Resource deleted. It can be restored from the Deleted tab.")


@router.patch("/{resource_id}/restore", response_model=ApiResponse[ResourceResponse])
async def restore_resource(resource_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Undoes `delete_resource` -- clears `deleted_at`/`deleted_by`,
    leaving whatever `status` the resource already had untouched."""
    _restore_one(resource_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="resource-restored", target_type="resource", target_id=resource_id,
    )
    updated_row = _get_resource_or_404(resource_id)
    uploader_name = _uploader_names_for([updated_row["uploaded_by"]]).get(updated_row["uploaded_by"])
    return ok(data=_row_to_response(updated_row, uploader_name), message="Resource restored.")


@router.delete("/{resource_id}/permanent", response_model=ApiResponse[None])
async def permanent_delete_resource(resource_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Admin Resource Actions' "Permanent Delete (optional final step)" --
    a real, irreversible delete plus storage cleanup. Usually reached from
    the Deleted tab after `delete_resource`, but not technically gated on
    it, same as Part 1's `permanent_delete_question`."""
    row = _get_resource_or_404(resource_id)
    _permanent_delete_one(resource_id)
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="resource-permanently-deleted",
        target_type="resource",
        target_id=resource_id,
        metadata={"title": row["title"]},
    )
    return ok(message="Resource permanently deleted.")


@router.patch("/{resource_id}/archive", response_model=ApiResponse[ResourceResponse])
async def archive_resource(resource_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Admin Resource Actions' "Archive Resource" -- only from 'approved'
    (published); see `_archive_one`."""
    _archive_one(resource_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="resource-archived", target_type="resource", target_id=resource_id,
    )
    updated_row = _get_resource_or_404(resource_id)
    uploader_name = _uploader_names_for([updated_row["uploaded_by"]]).get(updated_row["uploaded_by"])
    return ok(data=_row_to_response(updated_row, uploader_name), message="Resource archived.")


@router.patch("/{resource_id}/unarchive", response_model=ApiResponse[ResourceResponse])
async def unarchive_resource(resource_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Undoes `archive_resource` -- back to 'approved'."""
    _unarchive_one(resource_id)
    audit.log_admin_action(
        admin_id=admin_user.id, action="resource-unarchived", target_type="resource", target_id=resource_id,
    )
    updated_row = _get_resource_or_404(resource_id)
    uploader_name = _uploader_names_for([updated_row["uploaded_by"]]).get(updated_row["uploaded_by"])
    return ok(data=_row_to_response(updated_row, uploader_name), message="Resource unarchived.")


@router.post("/bulk-action", response_model=ApiResponse[BulkActionResponse])
async def bulk_action(
    payload: BulkActionRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Bulk Actions -- extended in Phase 15, Part 2
    (Slice A) with Feature 1's Bulk Archive / Unarchive / Restore /
    Permanent Delete, on top of the original approve/reject/delete this
    endpoint already had. Reuses the shared `lifecycle.run_bulk` loop
    (Feature 8) instead of a second hand-rolled try/except loop -- one bad
    id fails just that id, and ONE summary audit entry logs the whole
    batch, same as before."""
    if payload.action not in _VALID_BULK_ACTIONS:
        raise AppException(f"action must be one of {sorted(_VALID_BULK_ACTIONS)}.", status_code=422)
    if payload.action == "reject" and not payload.rejection_reason:
        raise AppException("rejection_reason is required for bulk reject.", status_code=422)

    def _run_one(resource_id: str) -> None:
        if payload.action == "delete":
            _soft_delete_one(resource_id, admin_user.id)
        elif payload.action == "archive":
            _archive_one(resource_id, admin_user.id)
        elif payload.action == "unarchive":
            _unarchive_one(resource_id)
        elif payload.action == "restore":
            _restore_one(resource_id)
        elif payload.action == "permanent-delete":
            _permanent_delete_one(resource_id)
        else:
            new_status = "approved" if payload.action == "approve" else "rejected"
            row = _get_resource_or_404(resource_id)
            get_supabase_admin().table("resources").update(
                {
                    "status": new_status,
                    "reviewed_by": admin_user.id,
                    "reviewed_at": _now_iso(),
                    "rejection_reason": payload.rejection_reason if new_status == "rejected" else None,
                }
            ).eq("id", resource_id).execute()
            notifications.notify(
                user_id=row["uploaded_by"],
                type_="resource-approved" if new_status == "approved" else "resource-rejected",
                title=f"Resource {new_status}",
                message=f'"{row["title"]}" was {new_status} as part of a batch review.',
                link_url="/resources",
            )

    succeeded, failed = lifecycle.run_bulk(payload.resource_ids, _run_one)

    bulk_audit_action = {
        "approve": "resource-bulk-approved",
        "reject": "resource-bulk-rejected",
        "delete": "resource-bulk-deleted",
        "archive": "resource-bulk-archived",
        "unarchive": "resource-bulk-unarchived",
        "restore": "resource-bulk-restored",
        "permanent-delete": "resource-bulk-permanently-deleted",
    }[payload.action]
    audit.log_admin_action(
        admin_id=admin_user.id,
        action=bulk_audit_action,
        target_type="resource",
        target_id=succeeded[0] if succeeded else (payload.resource_ids[0] if payload.resource_ids else ""),
        metadata={"resource_ids": succeeded, "count": len(succeeded), "failed_count": len(failed)},
    )

    return ok(
        data=BulkActionResponse(
            succeeded=succeeded, failed=failed, undo_action=_UNDOABLE_BULK_ACTIONS.get(payload.action),
        ),
        message=f"{len(succeeded)} resource(s) {_BULK_ACTION_PAST_TENSE[payload.action]}, {len(failed)} failed.",
    )


@router.get("/analytics/summary", response_model=ApiResponse[ResourceAnalyticsResponse])
async def resource_analytics_summary(admin_user: CurrentUser = Depends(require_admin)):
    """Every count here is a `count="exact"` round trip (or, for growth/
    moderator-activity, a bounded 30-day fetch aggregated in Python) rather
    than a full-table scan -- same reasoning, same shape as questions.py's
    `question_analytics_summary`."""
    admin_client = get_supabase_admin()

    def _count(**filters: Any) -> int:
        q = admin_client.table("resources").select("id", count="exact")
        for col, val in filters.items():
            q = q.eq(col, val)
        q = q.is_("deleted_at", "null")
        return q.execute().count or 0

    by_status = {s: _count(status=s) for s in _VALID_STATUSES}
    by_category = {c: _count(category=c) for c in _VALID_CATEGORIES}
    total_active = sum(by_status.values())
    archived_count = by_status.get("archived", 0)
    deleted_count = (
        admin_client.table("resources").select("id", count="exact").not_.is_("deleted_at", "null").execute().count
        or 0
    )
    approved = by_status.get("approved", 0)
    rejected = by_status.get("rejected", 0)
    approval_rate = round(approved / (approved + rejected), 4) if (approved + rejected) > 0 else 0.0

    window_start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    growth_rows = (
        admin_client.table("resources")
        .select("created_at")
        .is_("deleted_at", "null")
        .gte("created_at", window_start)
        .execute()
        .data
        or []
    )
    day_counts = Counter(r["created_at"][:10] for r in growth_rows)
    growth_last_30_days = [
        ResourceGrowthPoint(date=day, count=count) for day, count in sorted(day_counts.items())
    ]

    audit_rows = (
        admin_client.table("admin_audit_logs")
        .select("admin_id")
        .eq("target_type", "resource")
        .gte("created_at", window_start)
        .execute()
        .data
        or []
    )
    activity_counts = Counter(r["admin_id"] for r in audit_rows)
    admin_names: Dict[str, str] = {}
    if activity_counts:
        profile_rows = (
            admin_client.table("profiles")
            .select("id, full_name")
            .in_("id", list(activity_counts.keys()))
            .execute()
            .data
            or []
        )
        admin_names = {p["id"]: p["full_name"] for p in profile_rows}
    moderator_activity = sorted(
        (
            ResourceModeratorActivityEntry(
                admin_id=admin_id, admin_name=admin_names.get(admin_id, "Unknown"), action_count=count,
            )
            for admin_id, count in activity_counts.items()
        ),
        key=lambda entry: entry.action_count,
        reverse=True,
    )

    return ok(
        data=ResourceAnalyticsResponse(
            by_status=by_status,
            by_category=by_category,
            total_active=total_active,
            archived_count=archived_count,
            deleted_count=deleted_count,
            approval_rate=approval_rate,
            growth_last_30_days=growth_last_30_days,
            moderator_activity=moderator_activity,
        ),
        message="Resource analytics fetched.",
    )
