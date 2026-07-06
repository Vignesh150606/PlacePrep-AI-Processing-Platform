"""
Question Bank endpoints — read-only surface for the questions the AI
Processing Pipeline (see app/services/pipeline.py) has extracted, validated,
de-duplicated, classified, and stored.

This is the piece that was missing to close the loop: the pipeline already
wrote real rows into `questions` / `question_options` / `question_topics` /
`question_companies`, but nothing served them back out, so the frontend's
Question Bank and Quiz pages were still reading `mocks/questions.ts`. This
router is that missing read path.

Non-admins only ever see `status == "approved"` questions — that mirrors the
`questions_select_approved_or_admin` RLS policy from migration 0002. We have
to re-apply that filter here in application code because
`get_supabase_admin()` is a service-role client that intentionally bypasses
RLS (see core/supabase_client.py's own docstring on why).
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, get_current_user, is_admin
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

# Pull everything a question needs to render in one round trip: its own
# columns, its options, one hop through question_topics -> topics -> subjects
# for display names, and the linked company ids.
_EMBED = (
    "*, "
    "question_options(id, label, option_text, is_correct, order_index), "
    "question_topics(topics(id, name, subject_id, subjects(id, name))), "
    "question_companies(company_id)"
)


class QuestionOptionResponse(CamelModel):
    id: str
    question_id: str
    label: str
    text: str
    is_correct: bool


class QuestionResponse(CamelModel):
    id: str
    type: str
    text: str
    options: List[QuestionOptionResponse]
    correct_explanation: Optional[str] = None
    topic: str
    subject: str
    company_id: Optional[str] = None
    difficulty: str
    source_pdf_id: Optional[str] = None
    status: str
    confidence_score: Optional[float] = None
    tags: List[str]
    times_attempted: int
    times_correct: int
    created_at: str


class QuestionListResponse(CamelModel):
    items: List[QuestionResponse]
    total: int


def _row_to_response(row: Dict[str, Any]) -> QuestionResponse:
    options = [
        QuestionOptionResponse(
            id=opt["id"],
            question_id=row["id"],
            label=opt["label"],
            text=opt["option_text"],
            is_correct=opt["is_correct"],
        )
        for opt in sorted(row.get("question_options") or [], key=lambda o: o.get("order_index") or 0)
    ]

    topic_name = ""
    subject_name = ""
    topic_links = row.get("question_topics") or []
    if topic_links:
        topic_row = topic_links[0].get("topics") or {}
        topic_name = topic_row.get("name") or ""
        subject_row = topic_row.get("subjects") or {}
        subject_name = subject_row.get("name") or ""

    company_links = row.get("question_companies") or []
    company_id = company_links[0]["company_id"] if company_links else None

    return QuestionResponse(
        id=row["id"],
        type=row["type"],
        text=row["question_text"],
        options=options,
        correct_explanation=row.get("correct_explanation"),
        topic=topic_name,
        subject=subject_name,
        company_id=company_id,
        difficulty=row["difficulty"],
        source_pdf_id=row.get("source_pdf_id"),
        status=row["status"],
        confidence_score=row.get("confidence_score"),
        tags=row.get("tags") or [],
        times_attempted=row.get("times_attempted", 0),
        times_correct=row.get("times_correct", 0),
        created_at=row["created_at"],
    )


@router.get("", response_model=ApiResponse[QuestionListResponse])
async def list_questions(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    search: Optional[str] = Query(None, description="Case-insensitive substring match on question text"),
    difficulty: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    source_pdf_id: Optional[str] = Query(None),
    limit: int = Query(300, le=500),
):
    admin_client = get_supabase_admin()

    query = admin_client.table("questions").select(_EMBED).order("created_at", desc=True).limit(limit)

    if not admin:
        query = query.eq("status", "approved")
    if difficulty:
        query = query.eq("difficulty", difficulty)
    if source_pdf_id:
        query = query.eq("source_pdf_id", source_pdf_id)
    if search:
        query = query.ilike("question_text", f"%{search}%")

    rows = query.execute().data or []
    items = [_row_to_response(r) for r in rows]

    # company_id / subject live behind a join in this embed shape, which
    # postgrest can't filter on directly here without a second round trip —
    # filtering the already-small result set in Python is simpler and, given
    # the `limit` above, cheap.
    if company_id:
        items = [q for q in items if q.company_id == company_id]
    if subject:
        items = [q for q in items if q.subject.lower() == subject.lower()]

    return ok(data=QuestionListResponse(items=items, total=len(items)), message="Questions fetched.")
