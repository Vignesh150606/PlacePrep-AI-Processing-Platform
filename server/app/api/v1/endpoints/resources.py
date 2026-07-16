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
"""
import uuid
from datetime import datetime, timezone
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
from app.services import audit, notifications

router = APIRouter()

_VALID_CATEGORIES = {
    "company", "subject", "topic", "aptitude", "technical", "interview",
    "cheat-sheet", "formula-sheet", "roadmap", "previous-paper",
    "external-link", "video", "pdf-notes",
}
_VALID_DIFFICULTIES = {"easy", "medium", "hard"}
_VALID_STATUSES = {"pending-review", "approved", "rejected"}
_VALID_SORTS = {"newest", "most-downloaded", "most-bookmarked"}
_VALID_BULK_ACTIONS = {"approve", "reject", "delete"}
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


class DownloadResponse(CamelModel):
    download_url: str
    kind: str  # "file" | "external"
    download_count: int


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
    status: Optional[str] = Query(None, description="pending-review | approved | rejected -- admin only"),
    sort_by: str = Query("newest", description="newest | most-downloaded | most-bookmarked"),
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

    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    def _base_query(select: str, count: Optional[str] = None):
        q = admin_client.table("resources").select(select, count=count) if count else admin_client.table(
            "resources"
        ).select(select)
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


def _delete_resource(resource_id: str, admin_id: str) -> Dict[str, Any]:
    row = _get_resource_or_404(resource_id)
    admin_client = get_supabase_admin()
    if row.get("file_storage_path"):
        try:
            admin_client.storage.from_(get_settings().PDF_STORAGE_BUCKET).remove([row["file_storage_path"]])
        except Exception:  # noqa: BLE001 -- storage cleanup best-effort, DB row deletion is what actually matters
            pass
    admin_client.table("resources").delete().eq("id", resource_id).execute()
    return row


@router.delete("/{resource_id}", response_model=ApiResponse[None])
async def delete_resource(
    resource_id: str,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Delete. Also removes the underlying storage
    object when the resource was a file upload -- there's no precedent for
    this elsewhere in the codebase (no pdf_resources delete endpoint
    exists), so this is a fresh, genuine cleanup step rather than a copy
    of an existing pattern."""
    row = _delete_resource(resource_id, admin_user.id)
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="resource-deleted",
        target_type="resource",
        target_id=resource_id,
        metadata={"title": row["title"]},
    )
    return ok(data=None, message="Resource deleted.")


@router.post("/bulk-action", response_model=ApiResponse[BulkActionResponse])
async def bulk_action(
    payload: BulkActionRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin Moderation: Bulk Actions. Reuses the exact same per-item logic
    as the single-item endpoints above (not a separate implementation) --
    loops and collects failures instead of letting one bad id 500 the
    whole batch, then logs ONE audit entry summarizing the batch rather
    than one per item, so a 200-item bulk reject doesn't flood the audit
    log with 200 near-identical rows."""
    if payload.action not in _VALID_BULK_ACTIONS:
        raise AppException(f"action must be one of {sorted(_VALID_BULK_ACTIONS)}.", status_code=422)
    if payload.action == "reject" and not payload.rejection_reason:
        raise AppException("rejection_reason is required for bulk reject.", status_code=422)

    succeeded: List[str] = []
    failed: List[Dict[str, str]] = []

    for resource_id in payload.resource_ids:
        try:
            if payload.action == "delete":
                _delete_resource(resource_id, admin_user.id)
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
            succeeded.append(resource_id)
        except NotFoundError:
            failed.append({"id": resource_id, "error": "Resource not found."})
        except AppException as exc:
            failed.append({"id": resource_id, "error": exc.message})

    bulk_audit_action = {
        "approve": "resource-bulk-approved",
        "reject": "resource-bulk-rejected",
        "delete": "resource-bulk-deleted",
    }[payload.action]
    audit.log_admin_action(
        admin_id=admin_user.id,
        action=bulk_audit_action,
        target_type="resource",
        target_id=succeeded[0] if succeeded else (payload.resource_ids[0] if payload.resource_ids else ""),
        metadata={"resource_ids": succeeded, "count": len(succeeded), "failed_count": len(failed)},
    )

    return ok(
        data=BulkActionResponse(succeeded=succeeded, failed=failed),
        message=f"{len(succeeded)} resource(s) {payload.action}d, {len(failed)} failed.",
    )
