"""
Subject taxonomy endpoints -- read-only list.

The `subjects` table (migration 0001) and its `subjects_select_all` RLS
policy (migration 0002) have existed since Sprint 3, but nothing ever
exposed a list endpoint for it -- Question Bank responses only ever return
a subject *name* string (see questions.py's `_row_to_response`), never a
subject_id, so there was previously no way for any client to obtain a real
subject_id at all. The Resource Intelligence Hub needs real subject_id
values (to tag and filter resources by subject), so this completes that
missing read surface rather than introducing a parallel classification
scheme.
"""
from typing import List

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


class SubjectResponse(CamelModel):
    id: str
    name: str
    slug: str


class SubjectListResponse(CamelModel):
    items: List[SubjectResponse]


@router.get("", response_model=ApiResponse[SubjectListResponse])
async def list_subjects(current_user: CurrentUser = Depends(get_current_user)):
    rows = get_supabase_admin().table("subjects").select("id, name, slug").order("name").execute().data or []
    items = [SubjectResponse(id=r["id"], name=r["name"], slug=r["slug"]) for r in rows]
    return ok(data=SubjectListResponse(items=items), message="Subjects fetched.")
