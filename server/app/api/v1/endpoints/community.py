"""
Placement Community endpoints (Phase 12).

Audit summary (see migration 0014's docstring for the full reasoning):
before this module, "Community" was a nav entry and a route pointed at
`ComingSoonPage` -- nothing else. This module builds the real thing,
reusing every adjacent system instead of duplicating it:
  - Identity: the EXISTING `profiles` table, same anonymity redaction
    shape `interview_experiences.py` established (`author_id` always
    stored, hidden in the response for anonymous content unless the
    requester is the author or an admin).
  - Companies: the EXISTING `companies` table (optional FK + denormalized
    free-text fallback, same shape `resources.author` established).
  - Bookmarks: the EXISTING generic `bookmarks` table
    (`target_type = 'community-post'`) -- no bookmark endpoint lives here,
    `bookmarks.py` already handles it.
  - Alumni: verified alumni are looked up in batch (`_alumni_status_for`)
    the same "small table, Python merge" way `resources.py`'s
    `_uploader_names_for` / `alumni.py`'s `_profiles_for` already do, and
    their Community contributions/helpful-votes feed the SAME
    `alumni_profiles.contribution_count` / `helpful_votes_received`
    counters via triggers (migration 0014) -- not a second stats system.
  - Admin audit trail / notifications: the EXISTING tables, extended.

Deliberately NOT a submission queue: unlike `resources`/
`interview_experiences`, posts and comments are visible immediately on
creation (this is a discussion forum -- a doubt sitting in a moderation
queue overnight helps no one). Moderation is reactive: `report`
(student/alumni) -> admin sees it in the reported queue -> pin / lock /
delete / suspend. `helpful_count`/`not_helpful_count`/`reply_count` are
real, trigger-maintained columns (see migration 0014), so `my_vote`/
`report_count` are the only things this module still computes per-request
-- the vote/reply totals themselves are just read off the row.

Attachments reuse the EXISTING 'pdfs' storage bucket and the SAME
`{uploader}/{uuid}.ext` path convention `resources.py`/`pdfs.py` use --
no new bucket, no new upload endpoint shape. A post can carry up to
`_MAX_ATTACHMENTS` files; download mints a short-lived signed URL per
attachment, same reasoning as `resources.py`'s `download_resource`.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from postgrest.exceptions import APIError
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, is_admin, require_admin
from app.core.config import get_settings
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.core.query_safety import safe_filter_value
from app.core.rate_limit import upload_limit
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit, notifications

router = APIRouter()

_VALID_CATEGORIES = {
    "general-placement", "aptitude", "dsa", "core-subjects", "hr-interview",
    "technical-interview", "company-specific", "off-campus", "higher-studies",
    "resume-review", "mock-interview", "resources",
}
_VALID_VOTE_TYPES = {"helpful", "not-helpful"}
_VALID_SORTS = {"newest", "most-helpful", "most-viewed", "unanswered"}
_MAX_PAGE_SIZE = 100
_MAX_ATTACHMENTS = 4


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Schemas ------------------------------------------------------------


class AttachmentResponse(CamelModel):
    file_name: str
    file_size_bytes: int
    file_kind: str  # "pdf" | "image"


class PostResponse(CamelModel):
    id: str
    author_id: Optional[str] = None
    author_name: Optional[str] = None
    author_avatar_url: Optional[str] = None
    is_anonymous: bool
    is_author_verified_alumni: bool = False
    author_mentorship_available: bool = False
    category: str
    title: str
    description: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    attachments: List[AttachmentResponse] = Field(default_factory=list)
    view_count: int = 0
    helpful_count: int = 0
    not_helpful_count: int = 0
    reply_count: int = 0
    my_vote: Optional[str] = None
    is_pinned: bool = False
    is_locked: bool = False
    report_count: Optional[int] = None
    created_at: str
    updated_at: Optional[str] = None


class PostListResponse(CamelModel):
    items: List[PostResponse]
    total: int
    page: int
    page_size: int


class CommentResponse(CamelModel):
    id: str
    post_id: str
    parent_comment_id: Optional[str] = None
    author_id: Optional[str] = None
    author_name: Optional[str] = None
    author_avatar_url: Optional[str] = None
    is_anonymous: bool
    is_author_verified_alumni: bool = False
    content: str
    helpful_count: int = 0
    my_vote: Optional[str] = None
    report_count: Optional[int] = None
    edited_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class CommentListResponse(CamelModel):
    items: List[CommentResponse]


class PostUpdateRequest(CamelModel):
    """Author self-edit (or admin edit) -- every field optional (PATCH
    semantics), mirrors `resources.py`'s `ResourceUpdateRequest`."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, min_length=1, max_length=20000)
    category: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    tags: Optional[List[str]] = None


class PostModerateRequest(CamelModel):
    """Admin-only pin/lock toggles -- deliberately separate from
    `PostUpdateRequest` since these are moderation actions, not content
    edits, and each needs its own audit-log action name."""

    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None


class CommentCreateRequest(CamelModel):
    content: str = Field(..., min_length=1, max_length=10000)
    parent_comment_id: Optional[str] = None
    is_anonymous: bool = False


class CommentUpdateRequest(CamelModel):
    content: str = Field(..., min_length=1, max_length=10000)


class VoteRequest(CamelModel):
    vote_type: str

    def validate_vote(self) -> None:
        if self.vote_type not in _VALID_VOTE_TYPES:
            raise AppException(f"vote_type must be one of {sorted(_VALID_VOTE_TYPES)}.", status_code=422)


class ReportRequest(CamelModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class SuspendRequest(CamelModel):
    reason: str = Field(..., min_length=1, max_length=500)


class ReportedPostResponse(CamelModel):
    post: PostResponse
    report_count: int
    reasons: List[str]


class ReportedCommentResponse(CamelModel):
    comment: CommentResponse
    post_id: str
    report_count: int
    reasons: List[str]


class CommunityAnalyticsResponse(CamelModel):
    total_posts: int
    total_comments: int
    active_users_last_30_days: int
    most_discussed_companies: List[Dict[str, Any]]
    trending_tags: List[Dict[str, Any]]
    most_helpful_contributors: List[Dict[str, Any]]


# --- Helpers --------------------------------------------------------------


def _profiles_for(profile_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Batched name/avatar lookup -- same "small table, Python merge"
    approach `alumni.py`'s `_profiles_for` / `resources.py`'s
    `_uploader_names_for` already use."""
    ids = sorted({pid for pid in profile_ids if pid})
    if not ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    return {r["id"]: r for r in rows}


def _alumni_status_for(profile_ids: List[str]) -> Dict[str, Dict[str, bool]]:
    """Verified-alumni badge + mentorship-availability lookup, per the
    brief's "reuse the Alumni module" instruction -- reads the EXISTING
    `alumni_profiles` table, never a parallel concept."""
    ids = sorted({pid for pid in profile_ids if pid})
    if not ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("alumni_profiles")
        .select("profile_id, verification_status, mentorship_available")
        .in_("profile_id", ids)
        .eq("verification_status", "verified")
        .execute()
        .data
        or []
    )
    return {
        r["profile_id"]: {"verified": True, "mentorship_available": bool(r.get("mentorship_available"))}
        for r in rows
    }


def _my_post_votes_for(post_ids: List[str], user_id: str) -> Dict[str, str]:
    if not post_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("community_post_votes")
        .select("post_id, vote_type")
        .in_("post_id", post_ids)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return {r["post_id"]: r["vote_type"] for r in rows}


def _my_comment_votes_for(comment_ids: List[str], user_id: str) -> Dict[str, str]:
    if not comment_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("community_comment_votes")
        .select("comment_id, vote_type")
        .in_("comment_id", comment_ids)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return {r["comment_id"]: r["vote_type"] for r in rows}


def _post_report_counts_for(post_ids: List[str]) -> Dict[str, int]:
    if not post_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("community_post_reports")
        .select("post_id")
        .in_("post_id", post_ids)
        .execute()
        .data
        or []
    )
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["post_id"]] = counts.get(row["post_id"], 0) + 1
    return counts


def _comment_report_counts_for(comment_ids: List[str]) -> Dict[str, int]:
    if not comment_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("community_comment_reports")
        .select("comment_id")
        .in_("comment_id", comment_ids)
        .execute()
        .data
        or []
    )
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["comment_id"]] = counts.get(row["comment_id"], 0) + 1
    return counts


def _row_to_post_response(
    row: Dict[str, Any],
    *,
    profiles: Dict[str, Dict[str, Any]],
    alumni_status: Dict[str, Dict[str, bool]],
    my_vote: Optional[str],
    report_count: Optional[int],
    current_user_id: str,
    is_admin_user: bool,
) -> PostResponse:
    is_owner = row.get("author_id") == current_user_id
    reveal_identity = (not row.get("is_anonymous")) or is_owner or is_admin_user
    author_id = row.get("author_id") if reveal_identity else None
    profile = profiles.get(row.get("author_id"), {}) if reveal_identity else {}
    status = alumni_status.get(row.get("author_id"), {}) if reveal_identity else {}

    return PostResponse(
        id=row["id"],
        author_id=author_id,
        author_name=profile.get("full_name"),
        author_avatar_url=profile.get("avatar_url"),
        is_anonymous=row.get("is_anonymous", False),
        is_author_verified_alumni=bool(status.get("verified")),
        author_mentorship_available=bool(status.get("mentorship_available")),
        category=row["category"],
        title=row["title"],
        description=row["description"],
        company_id=row.get("company_id"),
        company_name=row.get("company_name"),
        tags=row.get("tags") or [],
        attachments=[AttachmentResponse(**a) for a in (row.get("attachments") or [])],
        view_count=row.get("view_count", 0),
        helpful_count=row.get("helpful_count", 0),
        not_helpful_count=row.get("not_helpful_count", 0),
        reply_count=row.get("reply_count", 0),
        my_vote=my_vote,
        is_pinned=row.get("is_pinned", False),
        is_locked=row.get("is_locked", False),
        report_count=report_count if is_admin_user else None,
        created_at=row["created_at"],
        updated_at=row.get("updated_at"),
    )


def _row_to_comment_response(
    row: Dict[str, Any],
    *,
    profiles: Dict[str, Dict[str, Any]],
    alumni_status: Dict[str, Dict[str, bool]],
    my_vote: Optional[str],
    report_count: Optional[int],
    current_user_id: str,
    is_admin_user: bool,
) -> CommentResponse:
    is_owner = row.get("author_id") == current_user_id
    reveal_identity = (not row.get("is_anonymous")) or is_owner or is_admin_user
    author_id = row.get("author_id") if reveal_identity else None
    profile = profiles.get(row.get("author_id"), {}) if reveal_identity else {}
    status = alumni_status.get(row.get("author_id"), {}) if reveal_identity else {}

    return CommentResponse(
        id=row["id"],
        post_id=row["post_id"],
        parent_comment_id=row.get("parent_comment_id"),
        author_id=author_id,
        author_name=profile.get("full_name"),
        author_avatar_url=profile.get("avatar_url"),
        is_anonymous=row.get("is_anonymous", False),
        is_author_verified_alumni=bool(status.get("verified")),
        content=row["content"],
        helpful_count=row.get("helpful_count", 0),
        my_vote=my_vote,
        report_count=report_count if is_admin_user else None,
        edited_at=row.get("edited_at"),
        created_at=row["created_at"],
        updated_at=row.get("updated_at"),
    )


def _get_post_or_404(post_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("community_posts").select("*").eq("id", post_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Post not found.")
        raise
    return result.data


def _get_comment_or_404(comment_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("community_comments").select("*").eq("id", comment_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Comment not found.")
        raise
    return result.data


def _require_not_suspended(user_id: str) -> None:
    row = (
        get_supabase_admin()
        .table("profiles")
        .select("community_suspended")
        .eq("id", user_id)
        .single()
        .execute()
        .data
    )
    if row and row.get("community_suspended"):
        raise ForbiddenError("Your Community posting privileges have been suspended.")


# --- Posts ------------------------------------------------------------------


@router.get("", response_model=ApiResponse[PostListResponse])
async def list_posts(
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
    search: Optional[str] = Query(None, description="Case-insensitive match on title or description"),
    category: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated -- matches ANY of the given tags"),
    author_id: Optional[str] = Query(None),
    sort_by: str = Query("newest", description="newest | most-helpful | most-viewed | unanswered"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=_MAX_PAGE_SIZE),
):
    """Every signed-in user sees every post -- see this module's docstring
    for why there's no pending-review gate here. `sort_by=unanswered`
    filters to `reply_count = 0` (a real, trigger-maintained column, see
    migration 0014) rather than a client-side filter."""
    if category is not None and category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {category}", status_code=422)
    if sort_by not in _VALID_SORTS:
        raise AppException(f"Invalid sort_by: {sort_by}", status_code=422)

    admin_client = get_supabase_admin()
    start = (page - 1) * page_size
    end = start + page_size - 1

    def _base_query(select: str, count: Optional[str] = None):
        q = (
            admin_client.table("community_posts").select(select, count=count)
            if count
            else admin_client.table("community_posts").select(select)
        )
        if category:
            q = q.eq("category", category)
        if company_id:
            q = q.eq("company_id", company_id)
        if author_id:
            q = q.eq("author_id", author_id)
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                q = q.overlaps("tags", tag_list)
        if sort_by == "unanswered":
            q = q.eq("reply_count", 0)
        if search:
            like = safe_filter_value(f"%{search}%")
            q = q.or_(f"title.ilike.{like},description.ilike.{like}")
        return q

    order_column = {
        "newest": "created_at",
        "most-helpful": "helpful_count",
        "most-viewed": "view_count",
        "unanswered": "created_at",
    }[sort_by]

    query = _base_query("*").order("is_pinned", desc=True).order(order_column, desc=True).range(start, end)
    rows = query.execute().data or []
    total = _base_query("id", count="exact").execute().count or 0

    author_ids = [r["author_id"] for r in rows]
    profiles = _profiles_for(author_ids)
    alumni_status = _alumni_status_for(author_ids)
    ids = [r["id"] for r in rows]
    my_votes = _my_post_votes_for(ids, current_user.id)
    report_counts = _post_report_counts_for(ids) if admin_user else {}

    items = [
        _row_to_post_response(
            r,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=my_votes.get(r["id"]),
            report_count=report_counts.get(r["id"]),
            current_user_id=current_user.id,
            is_admin_user=admin_user,
        )
        for r in rows
    ]
    return ok(
        data=PostListResponse(items=items, total=total, page=page, page_size=page_size),
        message="Posts fetched.",
    )


@router.get("/{post_id}", response_model=ApiResponse[PostResponse])
async def get_post(
    post_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    row = _get_post_or_404(post_id)
    new_view_count = (
        get_supabase_admin().rpc("increment_community_post_views", {"p_post_id": post_id}).execute().data
    )
    row["view_count"] = new_view_count if new_view_count is not None else row.get("view_count", 0)

    profiles = _profiles_for([row["author_id"]])
    alumni_status = _alumni_status_for([row["author_id"]])
    my_vote = _my_post_votes_for([post_id], current_user.id).get(post_id)
    report_count = _post_report_counts_for([post_id]).get(post_id) if admin_user else None

    return ok(
        data=_row_to_post_response(
            row,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=my_vote,
            report_count=report_count,
            current_user_id=current_user.id,
            is_admin_user=admin_user,
        ),
        message="Post fetched.",
    )


@router.post("", response_model=ApiResponse[PostResponse])
@upload_limit()
async def create_post(
    request: Request,  # required by slowapi's decorator to read the client IP
    title: str = Form(..., min_length=1, max_length=200),
    description: str = Form(..., min_length=1, max_length=20000),
    category: str = Form(...),
    is_anonymous: bool = Form(False),
    company_id: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    tags: Optional[str] = Form(None, description="Comma-separated"),
    files: List[UploadFile] = File(default=[]),
    current_user: CurrentUser = Depends(get_current_user),
):
    if category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {category}", status_code=422)
    _require_not_suspended(current_user.id)

    real_files = [f for f in files if f and f.filename]
    if len(real_files) > _MAX_ATTACHMENTS:
        raise AppException(f"A post can have at most {_MAX_ATTACHMENTS} attachments.", status_code=422)

    admin = get_supabase_admin()
    settings = get_settings()
    attachments: List[Dict[str, Any]] = []
    for file in real_files:
        is_pdf = file.content_type in settings.allowed_pdf_mime_types
        is_image = file.content_type in settings.allowed_image_mime_types
        if not is_pdf and not is_image:
            raise AppException("Attachments must be PDF, PNG, or JPEG files.", status_code=415)
        file_kind = "pdf" if is_pdf else "image"

        contents = await file.read()
        max_bytes = settings.MAX_PDF_SIZE_BYTES if is_pdf else settings.MAX_IMAGE_SIZE_BYTES
        if len(contents) > max_bytes:
            raise AppException(f"'{file.filename}' exceeds the {max_bytes // (1024 * 1024)}MB limit.", status_code=413)
        if len(contents) == 0:
            continue

        extension = "pdf" if is_pdf else (file.content_type.split("/")[-1] or "jpg")
        storage_path = f"{current_user.id}/{uuid.uuid4()}.{extension}"
        admin.storage.from_(settings.PDF_STORAGE_BUCKET).upload(
            storage_path, contents, {"content-type": file.content_type}
        )
        attachments.append(
            {
                "storage_path": storage_path,
                "file_name": file.filename,
                "file_size_bytes": len(contents),
                "file_kind": file_kind,
            }
        )

    insert_payload: Dict[str, Any] = {
        "author_id": current_user.id,
        "is_anonymous": is_anonymous,
        "category": category,
        "title": title,
        "description": description,
        "company_id": company_id or None,
        "company_name": company_name,
        "tags": [t.strip() for t in tags.split(",")] if tags else [],
        "attachments": attachments,
    }
    row_id = admin.table("community_posts").insert(insert_payload).execute().data[0]["id"]
    row = _get_post_or_404(row_id)

    profiles = _profiles_for([current_user.id])
    alumni_status = _alumni_status_for([current_user.id])
    return ok(
        data=_row_to_post_response(
            row,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=None,
            report_count=0,
            current_user_id=current_user.id,
            is_admin_user=False,
        ),
        message="Post published.",
    )


@router.patch("/{post_id}", response_model=ApiResponse[PostResponse])
async def update_post(
    post_id: str,
    payload: PostUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    """Author self-edit, or admin edit -- same "own row or admin" gate as
    `interview_experiences.py`'s report/vote endpoints, except this one is a
    real content edit so it's restricted to the author (or an admin), not
    open to any signed-in user."""
    row = _get_post_or_404(post_id)
    if row["author_id"] != current_user.id and not admin_user:
        raise ForbiddenError("Only the author or an admin can edit this post.")
    if payload.category is not None and payload.category not in _VALID_CATEGORIES:
        raise AppException(f"Invalid category: {payload.category}", status_code=422)

    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    if updates:
        get_supabase_admin().table("community_posts").update(updates).eq("id", post_id).execute()
        if admin_user and row["author_id"] != current_user.id:
            audit.log_admin_action(
                admin_id=current_user.id,
                action="community-post-edited",
                target_type="community-post",
                target_id=post_id,
                metadata={"fields_changed": sorted(updates.keys())},
            )

    updated = _get_post_or_404(post_id)
    profiles = _profiles_for([updated["author_id"]])
    alumni_status = _alumni_status_for([updated["author_id"]])
    my_vote = _my_post_votes_for([post_id], current_user.id).get(post_id)
    return ok(
        data=_row_to_post_response(
            updated,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=my_vote,
            report_count=_post_report_counts_for([post_id]).get(post_id) if admin_user else None,
            current_user_id=current_user.id,
            is_admin_user=admin_user,
        ),
        message="Post updated.",
    )


@router.patch("/{post_id}/moderate", response_model=ApiResponse[PostResponse])
async def moderate_post(
    post_id: str,
    payload: PostModerateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Admin-only pin/lock. Separate from `update_post` so each toggle
    gets its own audit-log action, matching how `alumni.py`'s status
    transitions each log a distinct action rather than one generic
    'updated'."""
    row = _get_post_or_404(post_id)
    updates: Dict[str, Any] = {}
    if payload.is_pinned is not None and payload.is_pinned != row.get("is_pinned", False):
        updates["is_pinned"] = payload.is_pinned
        audit.log_admin_action(
            admin_id=admin_user.id,
            action="community-post-pinned" if payload.is_pinned else "community-post-unpinned",
            target_type="community-post",
            target_id=post_id,
        )
    if payload.is_locked is not None and payload.is_locked != row.get("is_locked", False):
        updates["is_locked"] = payload.is_locked
        audit.log_admin_action(
            admin_id=admin_user.id,
            action="community-post-locked" if payload.is_locked else "community-post-unlocked",
            target_type="community-post",
            target_id=post_id,
        )
    if updates:
        get_supabase_admin().table("community_posts").update(updates).eq("id", post_id).execute()

    updated = _get_post_or_404(post_id)
    profiles = _profiles_for([updated["author_id"]])
    alumni_status = _alumni_status_for([updated["author_id"]])
    return ok(
        data=_row_to_post_response(
            updated,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=None,
            report_count=_post_report_counts_for([post_id]).get(post_id),
            current_user_id=admin_user.id,
            is_admin_user=True,
        ),
        message="Post updated.",
    )


@router.delete("/{post_id}", response_model=ApiResponse[None])
async def delete_post(
    post_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    row = _get_post_or_404(post_id)
    if row["author_id"] != current_user.id and not admin_user:
        raise ForbiddenError("Only the author or an admin can delete this post.")

    admin = get_supabase_admin()
    for attachment in row.get("attachments") or []:
        try:
            admin.storage.from_(get_settings().PDF_STORAGE_BUCKET).remove([attachment["storage_path"]])
        except Exception:  # noqa: BLE001 -- best-effort cleanup, same as resources.py's delete
            pass
    admin.table("community_posts").delete().eq("id", post_id).execute()

    if admin_user and row["author_id"] != current_user.id:
        audit.log_admin_action(
            admin_id=current_user.id,
            action="community-post-deleted",
            target_type="community-post",
            target_id=post_id,
            metadata={"title": row["title"]},
        )
    return ok(message="Post deleted.")


@router.post("/{post_id}/vote", response_model=ApiResponse[Dict[str, int]])
async def vote_post(post_id: str, payload: VoteRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Toggle semantics, identical to `interview_experiences.py`'s
    `vote_experience` -- except the counts are read straight off the row
    afterward since `community_posts.helpful_count`/`not_helpful_count`
    are real, trigger-maintained columns (migration 0014), not computed
    fresh here."""
    payload.validate_vote()
    admin = get_supabase_admin()
    _get_post_or_404(post_id)

    existing = (
        admin.table("community_post_votes")
        .select("*")
        .eq("post_id", post_id)
        .eq("user_id", current_user.id)
        .execute()
        .data
    )
    if existing and existing[0]["vote_type"] == payload.vote_type:
        admin.table("community_post_votes").delete().eq("id", existing[0]["id"]).execute()
    elif existing:
        admin.table("community_post_votes").update({"vote_type": payload.vote_type}).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        admin.table("community_post_votes").insert(
            {"post_id": post_id, "user_id": current_user.id, "vote_type": payload.vote_type}
        ).execute()

    updated = _get_post_or_404(post_id)
    return ok(
        data={"helpful": updated.get("helpful_count", 0), "notHelpful": updated.get("not_helpful_count", 0)},
        message="Vote recorded.",
    )


@router.post("/{post_id}/report", response_model=ApiResponse[None])
async def report_post(post_id: str, payload: ReportRequest, current_user: CurrentUser = Depends(get_current_user)):
    row = _get_post_or_404(post_id)
    admin = get_supabase_admin()
    existing = (
        admin.table("community_post_reports")
        .select("id")
        .eq("post_id", post_id)
        .eq("reported_by", current_user.id)
        .execute()
        .data
    )
    if existing:
        return ok(message="You've already reported this post.")

    admin.table("community_post_reports").insert(
        {"post_id": post_id, "reported_by": current_user.id, "reason": payload.reason}
    ).execute()
    notifications.notify_admins(
        type_="community-post-reported",
        title="Post reported",
        message=f'"{row["title"]}" was reported and needs review.',
        link_url="/admin/community",
    )
    return ok(message="Reported. An admin will review it.")


@router.get("/{post_id}/attachments/{index}/download", response_model=ApiResponse[Dict[str, str]])
async def download_attachment(
    post_id: str,
    index: int,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: ARG001 -- auth-gated, no per-attachment ACL needed
):
    row = _get_post_or_404(post_id)
    attachments = row.get("attachments") or []
    if index < 0 or index >= len(attachments):
        raise NotFoundError("Attachment not found.")
    attachment = attachments[index]
    signed = get_supabase_admin().storage.from_(get_settings().PDF_STORAGE_BUCKET).create_signed_url(
        attachment["storage_path"], 300
    )
    download_url = signed.get("signedURL") or signed.get("signedUrl")
    return ok(data={"downloadUrl": download_url, "fileName": attachment["file_name"]}, message="Download ready.")


# --- Comments -----------------------------------------------------------


@router.get("/{post_id}/comments", response_model=ApiResponse[CommentListResponse])
async def list_comments(
    post_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    """Returns a flat, chronologically-ordered list -- the frontend builds
    the nested-reply tree client-side from `parentCommentId`, same
    division of labor `interview_experience_rounds` already has (backend
    returns a flat ordered list, frontend renders structure)."""
    _get_post_or_404(post_id)
    rows = (
        get_supabase_admin()
        .table("community_comments")
        .select("*")
        .eq("post_id", post_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    author_ids = [r["author_id"] for r in rows]
    profiles = _profiles_for(author_ids)
    alumni_status = _alumni_status_for(author_ids)
    ids = [r["id"] for r in rows]
    my_votes = _my_comment_votes_for(ids, current_user.id)
    report_counts = _comment_report_counts_for(ids) if admin_user else {}

    items = [
        _row_to_comment_response(
            r,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=my_votes.get(r["id"]),
            report_count=report_counts.get(r["id"]),
            current_user_id=current_user.id,
            is_admin_user=admin_user,
        )
        for r in rows
    ]
    return ok(data=CommentListResponse(items=items), message="Comments fetched.")


@router.post("/{post_id}/comments", response_model=ApiResponse[CommentResponse])
async def create_comment(
    post_id: str,
    payload: CommentCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    post = _get_post_or_404(post_id)
    if post.get("is_locked"):
        raise AppException("This discussion is locked and no longer accepting replies.", status_code=403)
    _require_not_suspended(current_user.id)

    if payload.parent_comment_id:
        parent = _get_comment_or_404(payload.parent_comment_id)
        if parent["post_id"] != post_id:
            raise AppException("Parent comment does not belong to this post.", status_code=422)

    admin = get_supabase_admin()
    row_id = (
        admin.table("community_comments")
        .insert(
            {
                "post_id": post_id,
                "parent_comment_id": payload.parent_comment_id,
                "author_id": current_user.id,
                "is_anonymous": payload.is_anonymous,
                "content": payload.content,
            }
        )
        .execute()
        .data[0]["id"]
    )
    row = _get_comment_or_404(row_id)

    if post["author_id"] != current_user.id:
        notifications.notify(
            user_id=post["author_id"],
            type_="community-reply",
            title="New reply on your post",
            message=f'Someone replied to "{post["title"]}".',
            link_url=f"/community/{post_id}",
        )

    profiles = _profiles_for([current_user.id])
    alumni_status = _alumni_status_for([current_user.id])
    return ok(
        data=_row_to_comment_response(
            row,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=None,
            report_count=0,
            current_user_id=current_user.id,
            is_admin_user=False,
        ),
        message="Reply posted.",
    )


@router.patch("/comments/{comment_id}", response_model=ApiResponse[CommentResponse])
async def update_comment(
    comment_id: str,
    payload: CommentUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    row = _get_comment_or_404(comment_id)
    if row["author_id"] != current_user.id and not admin_user:
        raise ForbiddenError("Only the author or an admin can edit this comment.")

    get_supabase_admin().table("community_comments").update(
        {"content": payload.content, "edited_at": _now_iso()}
    ).eq("id", comment_id).execute()
    if admin_user and row["author_id"] != current_user.id:
        audit.log_admin_action(
            admin_id=current_user.id,
            action="community-comment-edited",
            target_type="community-comment",
            target_id=comment_id,
        )

    updated = _get_comment_or_404(comment_id)
    profiles = _profiles_for([updated["author_id"]])
    alumni_status = _alumni_status_for([updated["author_id"]])
    my_vote = _my_comment_votes_for([comment_id], current_user.id).get(comment_id)
    return ok(
        data=_row_to_comment_response(
            updated,
            profiles=profiles,
            alumni_status=alumni_status,
            my_vote=my_vote,
            report_count=_comment_report_counts_for([comment_id]).get(comment_id) if admin_user else None,
            current_user_id=current_user.id,
            is_admin_user=admin_user,
        ),
        message="Comment updated.",
    )


@router.delete("/comments/{comment_id}", response_model=ApiResponse[None])
async def delete_comment(
    comment_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    admin_user: bool = Depends(is_admin),
):
    row = _get_comment_or_404(comment_id)
    if row["author_id"] != current_user.id and not admin_user:
        raise ForbiddenError("Only the author or an admin can delete this comment.")

    get_supabase_admin().table("community_comments").delete().eq("id", comment_id).execute()
    if admin_user and row["author_id"] != current_user.id:
        audit.log_admin_action(
            admin_id=current_user.id,
            action="community-comment-deleted",
            target_type="community-comment",
            target_id=comment_id,
        )
    return ok(message="Comment deleted.")


@router.post("/comments/{comment_id}/vote", response_model=ApiResponse[Dict[str, int]])
async def vote_comment(comment_id: str, payload: VoteRequest, current_user: CurrentUser = Depends(get_current_user)):
    payload.validate_vote()
    admin = get_supabase_admin()
    _get_comment_or_404(comment_id)

    existing = (
        admin.table("community_comment_votes")
        .select("*")
        .eq("comment_id", comment_id)
        .eq("user_id", current_user.id)
        .execute()
        .data
    )
    if existing and existing[0]["vote_type"] == payload.vote_type:
        admin.table("community_comment_votes").delete().eq("id", existing[0]["id"]).execute()
    elif existing:
        admin.table("community_comment_votes").update({"vote_type": payload.vote_type}).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        admin.table("community_comment_votes").insert(
            {"comment_id": comment_id, "user_id": current_user.id, "vote_type": payload.vote_type}
        ).execute()

    updated = _get_comment_or_404(comment_id)
    return ok(data={"helpful": updated.get("helpful_count", 0)}, message="Vote recorded.")


@router.post("/comments/{comment_id}/report", response_model=ApiResponse[None])
async def report_comment(
    comment_id: str, payload: ReportRequest, current_user: CurrentUser = Depends(get_current_user)
):
    _get_comment_or_404(comment_id)
    admin = get_supabase_admin()
    existing = (
        admin.table("community_comment_reports")
        .select("id")
        .eq("comment_id", comment_id)
        .eq("reported_by", current_user.id)
        .execute()
        .data
    )
    if existing:
        return ok(message="You've already reported this comment.")

    admin.table("community_comment_reports").insert(
        {"comment_id": comment_id, "reported_by": current_user.id, "reason": payload.reason}
    ).execute()
    notifications.notify_admins(
        type_="community-comment-reported",
        title="Comment reported",
        message="A comment was reported and needs review.",
        link_url="/admin/community",
    )
    return ok(message="Reported. An admin will review it.")


# --- Admin moderation -------------------------------------------------------


@router.get("/admin/reported-posts", response_model=ApiResponse[List[ReportedPostResponse]])
async def list_reported_posts(admin_user: CurrentUser = Depends(require_admin)):
    """Same "small table, Python de-dupe" approach `admin.py`'s dashboard
    summary already uses for `interview_experience_reports` -- there's no
    `count=exact` groupby-over-a-join support here either."""
    admin = get_supabase_admin()
    report_rows = admin.table("community_post_reports").select("post_id, reason").execute().data or []
    if not report_rows:
        return ok(data=[], message="No reported posts.")

    grouped: Dict[str, List[str]] = {}
    for r in report_rows:
        grouped.setdefault(r["post_id"], []).append(r["reason"])

    posts = admin.table("community_posts").select("*").in_("id", list(grouped.keys())).execute().data or []
    author_ids = [p["author_id"] for p in posts]
    profiles = _profiles_for(author_ids)
    alumni_status = _alumni_status_for(author_ids)

    items = [
        ReportedPostResponse(
            post=_row_to_post_response(
                p,
                profiles=profiles,
                alumni_status=alumni_status,
                my_vote=None,
                report_count=len(grouped[p["id"]]),
                current_user_id=admin_user.id,
                is_admin_user=True,
            ),
            report_count=len(grouped[p["id"]]),
            reasons=grouped[p["id"]],
        )
        for p in posts
    ]
    items.sort(key=lambda i: i.report_count, reverse=True)
    return ok(data=items, message="Reported posts fetched.")


@router.get("/admin/reported-comments", response_model=ApiResponse[List[ReportedCommentResponse]])
async def list_reported_comments(admin_user: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()
    report_rows = admin.table("community_comment_reports").select("comment_id, reason").execute().data or []
    if not report_rows:
        return ok(data=[], message="No reported comments.")

    grouped: Dict[str, List[str]] = {}
    for r in report_rows:
        grouped.setdefault(r["comment_id"], []).append(r["reason"])

    comments = admin.table("community_comments").select("*").in_("id", list(grouped.keys())).execute().data or []
    author_ids = [c["author_id"] for c in comments]
    profiles = _profiles_for(author_ids)
    alumni_status = _alumni_status_for(author_ids)

    items = [
        ReportedCommentResponse(
            comment=_row_to_comment_response(
                c,
                profiles=profiles,
                alumni_status=alumni_status,
                my_vote=None,
                report_count=len(grouped[c["id"]]),
                current_user_id=admin_user.id,
                is_admin_user=True,
            ),
            post_id=c["post_id"],
            report_count=len(grouped[c["id"]]),
            reasons=grouped[c["id"]],
        )
        for c in comments
    ]
    items.sort(key=lambda i: i.report_count, reverse=True)
    return ok(data=items, message="Reported comments fetched.")


@router.delete("/admin/reported-posts/{post_id}/dismiss", response_model=ApiResponse[None])
async def dismiss_post_reports(post_id: str, admin_user: CurrentUser = Depends(require_admin)):
    """Clears every report against a post without deleting the post
    itself -- for when the report(s) turn out not to warrant action."""
    get_supabase_admin().table("community_post_reports").delete().eq("post_id", post_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id, action="community-report-dismissed", target_type="community-post", target_id=post_id
    )
    return ok(message="Reports dismissed.")


@router.delete("/admin/reported-comments/{comment_id}/dismiss", response_model=ApiResponse[None])
async def dismiss_comment_reports(comment_id: str, admin_user: CurrentUser = Depends(require_admin)):
    get_supabase_admin().table("community_comment_reports").delete().eq("comment_id", comment_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="community-report-dismissed",
        target_type="community-comment",
        target_id=comment_id,
    )
    return ok(message="Reports dismissed.")


@router.post("/admin/users/{user_id}/suspend", response_model=ApiResponse[None])
async def suspend_user(user_id: str, payload: SuspendRequest, admin_user: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()
    existing = admin.table("profiles").select("id").eq("id", user_id).execute().data
    if not existing:
        raise NotFoundError("User not found.")

    admin.table("profiles").update(
        {
            "community_suspended": True,
            "community_suspended_reason": payload.reason,
            "community_suspended_at": _now_iso(),
            "community_suspended_by": admin_user.id,
        }
    ).eq("id", user_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="community-user-suspended",
        target_type="user",
        target_id=user_id,
        metadata={"reason": payload.reason},
    )
    notifications.notify(
        user_id=user_id,
        type_="community-account-suspended",
        title="Community posting suspended",
        message=f"Your Community posting privileges were suspended: {payload.reason}",
        link_url="/community",
    )
    return ok(message="User suspended from Community.")


@router.post("/admin/users/{user_id}/unsuspend", response_model=ApiResponse[None])
async def unsuspend_user(user_id: str, admin_user: CurrentUser = Depends(require_admin)):
    admin = get_supabase_admin()
    existing = admin.table("profiles").select("id").eq("id", user_id).execute().data
    if not existing:
        raise NotFoundError("User not found.")

    admin.table("profiles").update(
        {
            "community_suspended": False,
            "community_suspended_reason": None,
            "community_suspended_at": None,
            "community_suspended_by": None,
        }
    ).eq("id", user_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id, action="community-user-unsuspended", target_type="user", target_id=user_id
    )
    return ok(message="User's Community access restored.")


# --- Analytics ---------------------------------------------------------


@router.get("/meta/analytics", response_model=ApiResponse[CommunityAnalyticsResponse])
async def get_analytics(_current_user: CurrentUser = Depends(get_current_user)):
    """Open to any signed-in user, same "not duplicated in two endpoints"
    reasoning `alumni.py`'s `/alumni/analytics` uses -- powers both a
    Community header and the Admin Community page's stats. Mounted under
    `/meta/analytics` (not `/analytics`) so it can't collide with the
    `/{post_id}` catch-all route below it in registration order -- same
    ordering concern `alumni.py`'s docstring calls out for `/analytics`
    and `/me` needing to come before `/{alumni_id}`.

    Everything here comes from real data -- no synthetic numbers, per the
    brief's \"Everything must come from real data\" instruction.
    """
    admin = get_supabase_admin()
    posts = admin.table("community_posts").select("id, author_id, company_id, company_name, tags").execute().data or []
    total_comments = admin.table("community_comments").select("id", count="exact").execute().count or 0

    thirty_days_ago = datetime.now(timezone.utc).timestamp() - 30 * 24 * 60 * 60
    recent_posts = (
        admin.table("community_posts")
        .select("author_id, created_at")
        .gte("created_at", datetime.fromtimestamp(thirty_days_ago, tz=timezone.utc).isoformat())
        .execute()
        .data
        or []
    )
    recent_comments = (
        admin.table("community_comments")
        .select("author_id, created_at")
        .gte("created_at", datetime.fromtimestamp(thirty_days_ago, tz=timezone.utc).isoformat())
        .execute()
        .data
        or []
    )
    active_users = {r["author_id"] for r in recent_posts} | {r["author_id"] for r in recent_comments}

    company_counts: Dict[str, Dict[str, Any]] = {}
    for p in posts:
        if p.get("company_id") and p.get("company_name"):
            key = p["company_id"]
            company_counts.setdefault(key, {"companyId": key, "companyName": p["company_name"], "postCount": 0})
            company_counts[key]["postCount"] += 1
    most_discussed = sorted(company_counts.values(), key=lambda c: c["postCount"], reverse=True)[:10]

    tag_counts: Dict[str, int] = {}
    for p in posts:
        for tag in p.get("tags") or []:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    trending_tags = [
        {"tag": tag, "count": count}
        for tag, count in sorted(tag_counts.items(), key=lambda kv: kv[1], reverse=True)[:15]
    ]

    contributor_helpful: Dict[str, int] = {}
    post_helpful_rows = admin.table("community_posts").select("author_id, helpful_count").execute().data or []
    comment_helpful_rows = admin.table("community_comments").select("author_id, helpful_count").execute().data or []
    for row in post_helpful_rows + comment_helpful_rows:
        contributor_helpful[row["author_id"]] = contributor_helpful.get(row["author_id"], 0) + (
            row.get("helpful_count") or 0
        )
    top_contributor_ids = sorted(contributor_helpful.keys(), key=lambda k: contributor_helpful[k], reverse=True)[:10]
    profiles = _profiles_for(top_contributor_ids)
    alumni_status = _alumni_status_for(top_contributor_ids)
    most_helpful_contributors = [
        {
            "profileId": pid,
            "fullName": profiles.get(pid, {}).get("full_name"),
            "avatarUrl": profiles.get(pid, {}).get("avatar_url"),
            "helpfulVotes": contributor_helpful[pid],
            "isVerifiedAlumni": bool(alumni_status.get(pid, {}).get("verified")),
        }
        for pid in top_contributor_ids
        if contributor_helpful[pid] > 0
    ]

    return ok(
        data=CommunityAnalyticsResponse(
            total_posts=len(posts),
            total_comments=total_comments,
            active_users_last_30_days=len(active_users),
            most_discussed_companies=most_discussed,
            trending_tags=trending_tags,
            most_helpful_contributors=most_helpful_contributors,
        ),
        message="Community analytics fetched.",
    )
