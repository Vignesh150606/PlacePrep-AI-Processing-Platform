"""
Interview Experience Repository endpoints (Phase 9).

A structured placement knowledge base, not a social feed -- see
migration 0009's docstring for the schema. Submission is open to any
authenticated user; every submission starts `pending-review` and is only
visible to everyone once an admin approves it (students/alumni can always
see their own submission regardless of status, the same "you can always
see your own upload" pattern `pdfs.py` uses). "Bookmarks" deliberately
reuses the existing generic `bookmarks` table (`target_type =
'interview-experience'`, already a valid value in that table's check
constraint since Sprint 3) rather than a parallel system -- there's no
bookmark endpoint in this file, `bookmarks.py` already handles it.

Anonymity: `author_id` is always stored (accountability for moderation/
abuse handling), but the API redacts it to `null` in every response for an
`is_anonymous` submission unless the requester is the author or an admin
-- an anonymous post hides identity from other users, not from moderators.

"Merge" (listed among admin actions in the brief, alongside Edit/Reject/
Delete/Pin) is NOT implemented here. `questions.py`'s merge has a clear,
narrow structural target (re-pointing quiz_attempts/bookmarks/
wrong_answer_marks between two rows of the same shape); a real interview-
experience merge would need real editorial judgment about which rounds/
tips/author to keep and isn't a mechanical operation, so it's a
separate, later feature rather than a mechanical copy of the question
version -- doing it hastily here risked being worse than not having it.
"""
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import Field, field_validator

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin
from app.services import audit

router = APIRouter()

_VALID_ROUND_TYPES = {"online-assessment", "technical", "hr", "managerial", "group-discussion"}
_VALID_OUTCOMES = {"selected", "rejected", "in-progress", "withdrawn"}
_VALID_DIFFICULTIES = {"easy", "medium", "hard"}
_VALID_EMPLOYMENT_TYPES = {"internship", "full-time"}
_VALID_STATUSES = {"pending-review", "approved", "rejected"}
_VALID_VOTE_TYPES = {"helpful", "not-helpful"}


class RoundInput(CamelModel):
    type: str
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    duration_minutes: Optional[int] = Field(default=None, ge=0, le=1440)

    @field_validator("type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        if v not in _VALID_ROUND_TYPES:
            raise ValueError(f"Invalid round type: {v}")
        return v


class RoundResponse(CamelModel):
    id: str
    type: str
    title: str
    description: str
    duration_minutes: Optional[int] = None


class ExperienceResponse(CamelModel):
    id: str
    company_id: str
    author_id: Optional[str] = None
    is_anonymous: bool
    role: str
    employment_type: str
    package_lpa: Optional[float] = None
    drive_date: Optional[str] = None
    college: Optional[str] = None
    department: Optional[str] = None
    graduation_year: int
    outcome: str
    rounds: List[RoundResponse]
    overall_tips: str
    resources_used: Optional[str] = None
    additional_notes: Optional[str] = None
    key_topics: Optional[List[str]] = None
    process_duration: Optional[str] = None
    difficulty: str
    upvote_count: int = 0
    not_helpful_count: int = 0
    report_count: Optional[int] = None
    my_vote: Optional[str] = None
    is_pinned: bool = False
    status: str
    rejection_reason: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class ExperienceListResponse(CamelModel):
    items: List[ExperienceResponse]
    total: int
    page: int
    page_size: int


class ExperienceCreateRequest(CamelModel):
    company_id: str
    is_anonymous: bool = False
    role: str = Field(..., min_length=1, max_length=200)
    employment_type: str = "full-time"
    package_lpa: Optional[float] = Field(default=None, ge=0, le=999)
    drive_date: Optional[date] = None
    college: Optional[str] = Field(default=None, max_length=200)
    department: Optional[str] = Field(default=None, max_length=200)
    graduation_year: int = Field(..., ge=1990, le=2100)
    outcome: str
    rounds: List[RoundInput] = Field(default_factory=list)
    overall_tips: str = Field(default="", max_length=4000)
    resources_used: Optional[str] = Field(default=None, max_length=2000)
    additional_notes: Optional[str] = Field(default=None, max_length=2000)
    key_topics: Optional[List[str]] = None
    process_duration: Optional[str] = Field(default=None, max_length=200)
    difficulty: str

    @field_validator("employment_type")
    @classmethod
    def _valid_employment(cls, v: str) -> str:
        if v not in _VALID_EMPLOYMENT_TYPES:
            raise ValueError(f"Invalid employment type: {v}")
        return v

    @field_validator("outcome")
    @classmethod
    def _valid_outcome(cls, v: str) -> str:
        if v not in _VALID_OUTCOMES:
            raise ValueError(f"Invalid outcome: {v}")
        return v

    @field_validator("difficulty")
    @classmethod
    def _valid_difficulty(cls, v: str) -> str:
        if v not in _VALID_DIFFICULTIES:
            raise ValueError(f"Invalid difficulty: {v}")
        return v


class ExperienceUpdateRequest(CamelModel):
    """Admin edit -- every field optional (PATCH semantics). `rounds`, if
    present, wholesale-replaces the existing round breakdown rather than
    being diffed field-by-field, which keeps this simple and matches how
    infrequently a full edit is expected to touch rounds specifically."""

    role: Optional[str] = Field(default=None, min_length=1, max_length=200)
    employment_type: Optional[str] = None
    package_lpa: Optional[float] = Field(default=None, ge=0, le=999)
    drive_date: Optional[date] = None
    college: Optional[str] = Field(default=None, max_length=200)
    department: Optional[str] = Field(default=None, max_length=200)
    graduation_year: Optional[int] = Field(default=None, ge=1990, le=2100)
    outcome: Optional[str] = None
    rounds: Optional[List[RoundInput]] = None
    overall_tips: Optional[str] = Field(default=None, max_length=4000)
    resources_used: Optional[str] = Field(default=None, max_length=2000)
    additional_notes: Optional[str] = Field(default=None, max_length=2000)
    key_topics: Optional[List[str]] = None
    process_duration: Optional[str] = Field(default=None, max_length=200)
    difficulty: Optional[str] = None
    is_pinned: Optional[bool] = None


class ExperienceStatusUpdateRequest(CamelModel):
    status: str
    rejection_reason: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in ("approved", "rejected"):
            raise ValueError("status must be 'approved' or 'rejected'.")
        return v


class VoteRequest(CamelModel):
    vote_type: str

    @field_validator("vote_type")
    @classmethod
    def _valid_vote(cls, v: str) -> str:
        if v not in _VALID_VOTE_TYPES:
            raise ValueError(f"vote_type must be one of {sorted(_VALID_VOTE_TYPES)}.")
        return v


class ReportRequest(CamelModel):
    reason: str = Field(..., min_length=1, max_length=1000)


def _rounds_for(experience_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    if not experience_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("interview_experience_rounds")
        .select("*")
        .in_("experience_id", experience_ids)
        .order("round_order")
        .execute()
        .data
        or []
    )
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["experience_id"], []).append(row)
    return grouped


def _vote_counts_for(experience_ids: List[str]) -> Dict[str, Dict[str, int]]:
    if not experience_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("interview_experience_votes")
        .select("experience_id, vote_type")
        .in_("experience_id", experience_ids)
        .execute()
        .data
        or []
    )
    counts: Dict[str, Dict[str, int]] = {}
    for row in rows:
        eid = row["experience_id"]
        counts.setdefault(eid, {"helpful": 0, "not-helpful": 0})
        counts[eid][row["vote_type"]] = counts[eid].get(row["vote_type"], 0) + 1
    return counts


def _my_votes_for(experience_ids: List[str], user_id: str) -> Dict[str, str]:
    if not experience_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("interview_experience_votes")
        .select("experience_id, vote_type")
        .in_("experience_id", experience_ids)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return {row["experience_id"]: row["vote_type"] for row in rows}


def _report_counts_for(experience_ids: List[str]) -> Dict[str, int]:
    if not experience_ids:
        return {}
    rows = (
        get_supabase_admin()
        .table("interview_experience_reports")
        .select("experience_id")
        .in_("experience_id", experience_ids)
        .execute()
        .data
        or []
    )
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["experience_id"]] = counts.get(row["experience_id"], 0) + 1
    return counts


def _row_to_response(
    row: Dict[str, Any],
    *,
    rounds: List[Dict[str, Any]],
    votes: Dict[str, int],
    report_count: Optional[int],
    my_vote: Optional[str],
    current_user_id: str,
    is_admin: bool,
) -> ExperienceResponse:
    is_owner = row.get("author_id") == current_user_id
    author_id = row.get("author_id") if (not row.get("is_anonymous") or is_owner or is_admin) else None

    return ExperienceResponse(
        id=row["id"],
        company_id=row["company_id"],
        author_id=author_id,
        is_anonymous=row.get("is_anonymous", False),
        role=row["role"],
        employment_type=row.get("employment_type", "full-time"),
        package_lpa=row.get("package_lpa"),
        drive_date=row.get("drive_date"),
        college=row.get("college"),
        department=row.get("department"),
        graduation_year=row["graduation_year"],
        outcome=row["outcome"],
        rounds=[
            RoundResponse(
                id=r["id"],
                type=r["type"],
                title=r["title"],
                description=r.get("description", ""),
                duration_minutes=r.get("duration_minutes"),
            )
            for r in rounds
        ],
        overall_tips=row.get("overall_tips", ""),
        resources_used=row.get("resources_used"),
        additional_notes=row.get("additional_notes"),
        key_topics=row.get("key_topics"),
        process_duration=row.get("process_duration"),
        difficulty=row["difficulty"],
        upvote_count=votes.get("helpful", 0),
        not_helpful_count=votes.get("not-helpful", 0),
        report_count=report_count if is_admin else None,
        my_vote=my_vote,
        is_pinned=row.get("is_pinned", False),
        status=row.get("status", "pending-review"),
        rejection_reason=row.get("rejection_reason"),
        created_at=row["created_at"],
        updated_at=row.get("updated_at"),
    )


def _get_experience_or_404(experience_id: str) -> Dict[str, Any]:
    try:
        result = (
            get_supabase_admin()
            .table("interview_experiences")
            .select("*")
            .eq("id", experience_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Interview experience not found.")
        raise
    return result.data


def _is_admin_user(user_id: str) -> bool:
    row = get_supabase_admin().table("profiles").select("role_id").eq("id", user_id).single().execute().data
    return bool(row and row.get("role_id") == 3)


@router.get("", response_model=ApiResponse[ExperienceListResponse])
async def list_experiences(
    current_user: CurrentUser = Depends(get_current_user),
    company_id: Optional[str] = None,
    role: Optional[str] = None,
    difficulty: Optional[str] = None,
    graduation_year: Optional[int] = None,
    department: Optional[str] = None,
    round_type: Optional[str] = None,
    min_package: Optional[float] = None,
    max_package: Optional[float] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """Non-admins see approved experiences plus their own regardless of
    status (matches the `pdfs.py` "you can always see your own upload"
    pattern). Admins can additionally filter by `status` to work the
    moderation queue."""
    admin = get_supabase_admin()
    is_admin = _is_admin_user(current_user.id)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    matching_ids: Optional[List[str]] = None
    if round_type:
        if round_type not in _VALID_ROUND_TYPES:
            raise AppException(f"Invalid round_type: {round_type}", status_code=422)
        round_rows = (
            admin.table("interview_experience_rounds").select("experience_id").eq("type", round_type).execute().data
            or []
        )
        matching_ids = list({r["experience_id"] for r in round_rows})
        if not matching_ids:
            return ok(
                data=ExperienceListResponse(items=[], total=0, page=page, page_size=page_size),
                message="Experiences fetched.",
            )

    query = admin.table("interview_experiences").select("*", count="exact")
    if not is_admin:
        query = query.or_(f"status.eq.approved,author_id.eq.{current_user.id}")
    elif status:
        if status not in _VALID_STATUSES:
            raise AppException(f"Invalid status: {status}", status_code=422)
        query = query.eq("status", status)

    if company_id:
        query = query.eq("company_id", company_id)
    if role:
        query = query.ilike("role", f"%{role}%")
    if difficulty:
        query = query.eq("difficulty", difficulty)
    if graduation_year:
        query = query.eq("graduation_year", graduation_year)
    if department:
        query = query.ilike("department", f"%{department}%")
    if min_package is not None:
        query = query.gte("package_lpa", min_package)
    if max_package is not None:
        query = query.lte("package_lpa", max_package)
    if matching_ids is not None:
        query = query.in_("id", matching_ids)

    start = (page - 1) * page_size
    end = start + page_size - 1
    result = query.order("is_pinned", desc=True).order("created_at", desc=True).range(start, end).execute()
    rows = result.data or []

    ids = [r["id"] for r in rows]
    rounds_by_exp = _rounds_for(ids)
    votes_by_exp = _vote_counts_for(ids)
    reports_by_exp = _report_counts_for(ids) if is_admin else {}
    my_votes = _my_votes_for(ids, current_user.id)

    items = [
        _row_to_response(
            r,
            rounds=rounds_by_exp.get(r["id"], []),
            votes=votes_by_exp.get(r["id"], {}),
            report_count=reports_by_exp.get(r["id"]),
            my_vote=my_votes.get(r["id"]),
            current_user_id=current_user.id,
            is_admin=is_admin,
        )
        for r in rows
    ]
    return ok(
        data=ExperienceListResponse(items=items, total=result.count or 0, page=page, page_size=page_size),
        message="Experiences fetched.",
    )


@router.get("/{experience_id}", response_model=ApiResponse[ExperienceResponse])
async def get_experience(experience_id: str, current_user: CurrentUser = Depends(get_current_user)):
    row = _get_experience_or_404(experience_id)
    is_admin = _is_admin_user(current_user.id)
    if row["status"] != "approved" and row.get("author_id") != current_user.id and not is_admin:
        raise NotFoundError("Interview experience not found.")

    rounds = _rounds_for([experience_id]).get(experience_id, [])
    votes = _vote_counts_for([experience_id]).get(experience_id, {})
    report_count = _report_counts_for([experience_id]).get(experience_id) if is_admin else None
    my_vote = _my_votes_for([experience_id], current_user.id).get(experience_id)

    return ok(
        data=_row_to_response(
            row,
            rounds=rounds,
            votes=votes,
            report_count=report_count,
            my_vote=my_vote,
            current_user_id=current_user.id,
            is_admin=is_admin,
        ),
        message="Experience fetched.",
    )


@router.post("", response_model=ApiResponse[ExperienceResponse])
async def create_experience(payload: ExperienceCreateRequest, current_user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    row_data = payload.model_dump(exclude={"rounds"}, by_alias=False)
    row_data["author_id"] = current_user.id
    row_data["status"] = "pending-review"
    if isinstance(row_data.get("drive_date"), date):
        row_data["drive_date"] = row_data["drive_date"].isoformat()

    row = admin.table("interview_experiences").insert(row_data).execute().data[0]

    if payload.rounds:
        admin.table("interview_experience_rounds").insert(
            [
                {
                    "experience_id": row["id"],
                    "type": r.type,
                    "title": r.title,
                    "description": r.description,
                    "duration_minutes": r.duration_minutes,
                    "round_order": idx,
                }
                for idx, r in enumerate(payload.rounds)
            ]
        ).execute()

    rounds = _rounds_for([row["id"]]).get(row["id"], [])
    return ok(
        data=_row_to_response(
            row,
            rounds=rounds,
            votes={},
            report_count=0,
            my_vote=None,
            current_user_id=current_user.id,
            is_admin=False,
        ),
        message="Submitted for review. It'll be visible to everyone once an admin approves it.",
    )


@router.patch("/{experience_id}/status", response_model=ApiResponse[ExperienceResponse])
async def update_status(
    experience_id: str,
    payload: ExperienceStatusUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    _get_experience_or_404(experience_id)
    admin = get_supabase_admin()
    updates: Dict[str, Any] = {
        "status": payload.status,
        "moderated_by": admin_user.id,
        "moderated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.status == "rejected":
        updates["rejection_reason"] = payload.rejection_reason
    admin.table("interview_experiences").update(updates).eq("id", experience_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="interview-experience-approved" if payload.status == "approved" else "interview-experience-rejected",
        target_type="interview-experience",
        target_id=experience_id,
    )

    updated = _get_experience_or_404(experience_id)
    rounds = _rounds_for([experience_id]).get(experience_id, [])
    votes = _vote_counts_for([experience_id]).get(experience_id, {})
    return ok(
        data=_row_to_response(
            updated,
            rounds=rounds,
            votes=votes,
            report_count=_report_counts_for([experience_id]).get(experience_id),
            my_vote=None,
            current_user_id=admin_user.id,
            is_admin=True,
        ),
        message=f"Experience {payload.status}.",
    )


@router.patch("/{experience_id}", response_model=ApiResponse[ExperienceResponse])
async def update_experience(
    experience_id: str,
    payload: ExperienceUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    _get_experience_or_404(experience_id)
    admin = get_supabase_admin()
    updates = payload.model_dump(exclude={"rounds"}, exclude_unset=True, by_alias=False)
    if isinstance(updates.get("drive_date"), date):
        updates["drive_date"] = updates["drive_date"].isoformat()

    if updates:
        admin.table("interview_experiences").update(updates).eq("id", experience_id).execute()

    if payload.rounds is not None:
        admin.table("interview_experience_rounds").delete().eq("experience_id", experience_id).execute()
        if payload.rounds:
            admin.table("interview_experience_rounds").insert(
                [
                    {
                        "experience_id": experience_id,
                        "type": r.type,
                        "title": r.title,
                        "description": r.description,
                        "duration_minutes": r.duration_minutes,
                        "round_order": idx,
                    }
                    for idx, r in enumerate(payload.rounds)
                ]
            ).execute()

    audit.log_admin_action(
        admin_id=admin_user.id,
        action="interview-experience-edited",
        target_type="interview-experience",
        target_id=experience_id,
        metadata={"fields_changed": sorted(updates.keys()) + (["rounds"] if payload.rounds is not None else [])},
    )

    updated = _get_experience_or_404(experience_id)
    rounds = _rounds_for([experience_id]).get(experience_id, [])
    votes = _vote_counts_for([experience_id]).get(experience_id, {})
    return ok(
        data=_row_to_response(
            updated,
            rounds=rounds,
            votes=votes,
            report_count=_report_counts_for([experience_id]).get(experience_id),
            my_vote=None,
            current_user_id=admin_user.id,
            is_admin=True,
        ),
        message="Experience updated.",
    )


@router.delete("/{experience_id}", response_model=ApiResponse[None])
async def delete_experience(experience_id: str, admin_user: CurrentUser = Depends(require_admin)):
    _get_experience_or_404(experience_id)
    get_supabase_admin().table("interview_experiences").delete().eq("id", experience_id).execute()
    audit.log_admin_action(
        admin_id=admin_user.id,
        action="interview-experience-deleted",
        target_type="interview-experience",
        target_id=experience_id,
    )
    return ok(message="Experience deleted.")


@router.post("/{experience_id}/vote", response_model=ApiResponse[Dict[str, int]])
async def vote_experience(
    experience_id: str,
    payload: VoteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Toggle semantics: voting the same way again removes the vote;
    voting the other way replaces it. Counts are always computed fresh
    from the votes table (see `_vote_counts_for`), never denormalized, so
    there's no counter-drift to worry about."""
    admin = get_supabase_admin()
    _get_experience_or_404(experience_id)

    existing = (
        admin.table("interview_experience_votes")
        .select("*")
        .eq("experience_id", experience_id)
        .eq("user_id", current_user.id)
        .execute()
        .data
    )

    if existing and existing[0]["vote_type"] == payload.vote_type:
        admin.table("interview_experience_votes").delete().eq("id", existing[0]["id"]).execute()
    elif existing:
        admin.table("interview_experience_votes").update({"vote_type": payload.vote_type}).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        admin.table("interview_experience_votes").insert(
            {"experience_id": experience_id, "user_id": current_user.id, "vote_type": payload.vote_type}
        ).execute()

    counts = _vote_counts_for([experience_id]).get(experience_id, {"helpful": 0, "not-helpful": 0})
    return ok(data=counts, message="Vote recorded.")


@router.post("/{experience_id}/report", response_model=ApiResponse[None])
async def report_experience(
    experience_id: str,
    payload: ReportRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    _get_experience_or_404(experience_id)
    admin = get_supabase_admin()
    existing = (
        admin.table("interview_experience_reports")
        .select("id")
        .eq("experience_id", experience_id)
        .eq("reported_by", current_user.id)
        .execute()
        .data
    )
    if existing:
        return ok(message="You've already reported this experience.")

    admin.table("interview_experience_reports").insert(
        {"experience_id": experience_id, "reported_by": current_user.id, "reason": payload.reason}
    ).execute()
    return ok(message="Reported. An admin will review it.")
