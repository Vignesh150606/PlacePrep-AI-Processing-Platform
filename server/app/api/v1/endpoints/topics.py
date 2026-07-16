"""
Topic taxonomy endpoints -- read-only list.

Same situation and same reasoning as subjects.py: the `topics` table and
its `topics_select_all` RLS policy have existed since migrations 0001/0002,
but no endpoint ever exposed a list of real topic_id values. Supports an
optional `subject_id` filter so the Resource submission form can narrow
the topic picker down once a subject has been chosen.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, get_current_user
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


class TopicResponse(CamelModel):
    id: str
    subject_id: str
    name: str
    slug: str


class TopicListResponse(CamelModel):
    items: List[TopicResponse]


@router.get("", response_model=ApiResponse[TopicListResponse])
async def list_topics(
    subject_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = get_supabase_admin().table("topics").select("id, subject_id, name, slug")
    if subject_id:
        query = query.eq("subject_id", subject_id)
    rows = query.order("name").execute().data or []
    items = [TopicResponse(id=r["id"], subject_id=r["subject_id"], name=r["name"], slug=r["slug"]) for r in rows]
    return ok(data=TopicListResponse(items=items), message="Topics fetched.")
