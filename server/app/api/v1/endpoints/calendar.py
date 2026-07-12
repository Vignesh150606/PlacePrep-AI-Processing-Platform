"""
Placement Calendar endpoints (Phase 8).

Backed by `public.calendar_events`, which has existed since Sprint 3 with
RLS already correctly scoped for this exact feature but was never wired up
to any endpoint before this pass (see migration 0008's note). Read access
(`list_events`) is open to any authenticated user -- students and alumni
get read-only visibility simply because there's no write endpoint they can
reach, and the existing `calendar_events_write_admin` RLS policy backs
that up independently of this API layer. Every write is admin-only.

"Reschedule" and "cancel" are both just `PATCH` -- reschedule changes
`startAt`/`endAt`, cancel sets `status: "cancelled"`. There's no separate
endpoint for either since a partial update already covers both cleanly.
"""
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import Field, field_validator

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.core.exceptions import AppException, NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_VALID_TYPES = {"oa", "interview", "company-visit", "reminder", "workshop"}
_VALID_STATUSES = {"upcoming", "ongoing", "completed", "cancelled"}
_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class CalendarEventResponse(CamelModel):
    id: str
    title: str
    type: str
    company_id: Optional[str] = None
    start_at: str
    end_at: Optional[str] = None
    is_all_day: bool = False
    created_by_id: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    package_lpa: Optional[float] = None
    eligibility: Optional[str] = None
    registration_deadline: Optional[str] = None
    venue: Optional[str] = None
    is_online: bool = False
    application_link: Optional[str] = None
    attachment_url: Optional[str] = None
    status: str = "upcoming"
    updated_at: Optional[str] = None


class CalendarEventListResponse(CamelModel):
    items: List[CalendarEventResponse]


class CalendarEventWriteRequest(CamelModel):
    title: str = Field(..., min_length=1, max_length=200)
    type: str
    company_id: Optional[str] = None
    start_at: str
    end_at: Optional[str] = None
    is_all_day: bool = False
    description: Optional[str] = Field(default=None, max_length=4000)
    role: Optional[str] = Field(default=None, max_length=200)
    package_lpa: Optional[float] = Field(default=None, ge=0, le=999)
    eligibility: Optional[str] = Field(default=None, max_length=1000)
    registration_deadline: Optional[str] = None
    venue: Optional[str] = Field(default=None, max_length=300)
    is_online: bool = False
    application_link: Optional[str] = Field(default=None, max_length=500)
    attachment_url: Optional[str] = Field(default=None, max_length=500)
    status: str = "upcoming"

    @field_validator("type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        if v not in _VALID_TYPES:
            raise ValueError(f"Invalid type: {v}. Must be one of {sorted(_VALID_TYPES)}.")
        return v

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(f"Invalid status: {v}. Must be one of {sorted(_VALID_STATUSES)}.")
        return v


class CalendarEventUpdateRequest(CamelModel):
    """Every field optional -- PATCH semantics. Edit, reschedule, and
    cancel are all the same partial update under the hood (see module
    docstring)."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    type: Optional[str] = None
    company_id: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    is_all_day: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=4000)
    role: Optional[str] = Field(default=None, max_length=200)
    package_lpa: Optional[float] = Field(default=None, ge=0, le=999)
    eligibility: Optional[str] = Field(default=None, max_length=1000)
    registration_deadline: Optional[str] = None
    venue: Optional[str] = Field(default=None, max_length=300)
    is_online: Optional[bool] = None
    application_link: Optional[str] = Field(default=None, max_length=500)
    attachment_url: Optional[str] = Field(default=None, max_length=500)
    status: Optional[str] = None

    @field_validator("type")
    @classmethod
    def _valid_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_TYPES:
            raise ValueError(f"Invalid type: {v}. Must be one of {sorted(_VALID_TYPES)}.")
        return v

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"Invalid status: {v}. Must be one of {sorted(_VALID_STATUSES)}.")
        return v


def _row_to_response(row: Dict[str, Any]) -> CalendarEventResponse:
    return CalendarEventResponse(
        id=row["id"],
        title=row["title"],
        type=row["type"],
        company_id=row.get("company_id"),
        start_at=row["start_at"],
        end_at=row.get("end_at"),
        is_all_day=row.get("is_all_day", False),
        created_by_id=row.get("created_by"),
        description=row.get("description"),
        role=row.get("role"),
        package_lpa=row.get("package_lpa"),
        eligibility=row.get("eligibility"),
        registration_deadline=row.get("registration_deadline"),
        venue=row.get("venue"),
        is_online=row.get("is_online", False),
        application_link=row.get("application_link"),
        attachment_url=row.get("attachment_url"),
        status=row.get("status") or "upcoming",
        updated_at=row.get("updated_at"),
    )


def _get_event_or_404(event_id: str) -> Dict[str, Any]:
    try:
        result = get_supabase_admin().table("calendar_events").select("*").eq("id", event_id).single().execute()
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Placement event not found.")
        raise
    return result.data


@router.get("", response_model=ApiResponse[CalendarEventListResponse])
async def list_events(
    current_user: CurrentUser = Depends(get_current_user),
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None,
):
    if status is not None and status not in _VALID_STATUSES:
        raise AppException(f"Invalid status filter: {status}", status_code=422)
    if month is not None and not _MONTH_PATTERN.match(month):
        raise AppException("month filter must be in YYYY-MM format.", status_code=422)

    query = get_supabase_admin().table("calendar_events").select("*").order("start_at")
    if company_id:
        query = query.eq("company_id", company_id)
    if status:
        query = query.eq("status", status)
    if month:
        year, mon = (int(p) for p in month.split("-"))
        range_start = datetime(year, mon, 1)
        range_end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)
        query = query.gte("start_at", range_start.isoformat()).lt("start_at", range_end.isoformat())

    rows = query.execute().data or []
    return ok(data=CalendarEventListResponse(items=[_row_to_response(r) for r in rows]), message="Events fetched.")


@router.post("", response_model=ApiResponse[CalendarEventResponse])
async def create_event(payload: CalendarEventWriteRequest, admin_user: CurrentUser = Depends(require_admin)):
    row = (
        get_supabase_admin()
        .table("calendar_events")
        .insert(
            {
                **payload.model_dump(exclude_unset=False, by_alias=False),
                "created_by": admin_user.id,
            }
        )
        .execute()
        .data[0]
    )
    return ok(data=_row_to_response(row), message="Placement event created.")


@router.patch("/{event_id}", response_model=ApiResponse[CalendarEventResponse])
async def update_event(
    event_id: str,
    payload: CalendarEventUpdateRequest,
    admin_user: CurrentUser = Depends(require_admin),
):
    """Also used for reschedule (`{"startAt": ..., "endAt": ...}`) and
    cancel (`{"status": "cancelled"}`) -- see module docstring."""
    _get_event_or_404(event_id)
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    if not updates:
        raise AppException("No fields to update.", status_code=422)

    updated = get_supabase_admin().table("calendar_events").update(updates).eq("id", event_id).execute().data[0]
    return ok(data=_row_to_response(updated), message="Placement event updated.")


@router.delete("/{event_id}", response_model=ApiResponse[None])
async def delete_event(event_id: str, admin_user: CurrentUser = Depends(require_admin)):
    _get_event_or_404(event_id)
    get_supabase_admin().table("calendar_events").delete().eq("id", event_id).execute()
    return ok(message="Placement event deleted.")
