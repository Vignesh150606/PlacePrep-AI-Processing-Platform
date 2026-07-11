"""
Global search (Phase 6 -- PROJECT_STATE.md's milestone 17, previously not
started at all; `TopNav`'s `SearchBar` has existed since early on with
nothing behind it).

Searches across the three entity types a student would plausibly be
looking for from the top nav: questions, companies, and uploaded PDFs.
Interview Experiences are deliberately excluded -- there's still no real
backend for them (sample data only, per every prior PROJECT_STATE.md
pass), and surfacing search results for data that isn't real would be
worse than not searching it at all.

Visibility rules mirror the endpoints these results come from, not a new
policy invented here: non-admins only see `approved` questions (same rule
as `GET /questions`), companies and PDFs are visible to any authenticated
user (same as `GET /companies` and `GET /pdfs`, which apply no per-user
filter either).

Performance note: `ilike` on `question_text`/`name`/`file_name` without a
trigram index would be a sequential scan on a large table. `questions`
already has one (`questions_question_text_trgm_idx`, migration 0003); this
pass adds equivalents for `companies.name` and `pdf_resources.file_name`
(migration 0006) so all three search paths stay index-assisted as data
grows, not just the one that happened to need it first for a different
reason.
"""
from typing import List

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, get_current_user, is_admin
from app.core.exceptions import AppException
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()

_MIN_QUERY_LENGTH = 2
_RESULTS_PER_TYPE = 8


class QuestionResult(CamelModel):
    id: str
    text: str
    difficulty: str
    status: str


class CompanyResult(CamelModel):
    id: str
    name: str
    slug: str
    tier: str


class PdfResult(CamelModel):
    id: str
    title: str
    file_name: str
    processing_status: str


class SearchResponse(CamelModel):
    query: str
    questions: List[QuestionResult]
    companies: List[CompanyResult]
    pdfs: List[PdfResult]
    total_results: int


@router.get("", response_model=ApiResponse[SearchResponse])
async def search(
    current_user: CurrentUser = Depends(get_current_user),
    admin: bool = Depends(is_admin),
    q: str = Query(..., description="Search text, minimum 2 characters"),
):
    query_text = q.strip()
    if len(query_text) < _MIN_QUERY_LENGTH:
        raise AppException(f"Search query must be at least {_MIN_QUERY_LENGTH} characters.")

    admin_client = get_supabase_admin()
    like_pattern = f"%{query_text}%"

    question_query = (
        admin_client.table("questions")
        .select("id, question_text, difficulty, status")
        .ilike("question_text", like_pattern)
        .limit(_RESULTS_PER_TYPE)
    )
    if not admin:
        question_query = question_query.eq("status", "approved")
    question_rows = question_query.execute().data or []

    company_rows = (
        admin_client.table("companies")
        .select("id, name, slug, tier")
        .ilike("name", like_pattern)
        .limit(_RESULTS_PER_TYPE)
        .execute()
        .data
        or []
    )

    pdf_rows = (
        admin_client.table("pdf_resources")
        .select("id, title, file_name, processing_status")
        .or_(f"file_name.ilike.{like_pattern},title.ilike.{like_pattern}")
        .limit(_RESULTS_PER_TYPE)
        .execute()
        .data
        or []
    )

    questions = [
        QuestionResult(id=r["id"], text=r["question_text"], difficulty=r["difficulty"], status=r["status"])
        for r in question_rows
    ]
    companies = [CompanyResult(id=r["id"], name=r["name"], slug=r["slug"], tier=r["tier"]) for r in company_rows]
    pdfs = [
        PdfResult(
            id=r["id"],
            title=r.get("title") or r["file_name"],
            file_name=r["file_name"],
            processing_status=r["processing_status"],
        )
        for r in pdf_rows
    ]

    return ok(
        data=SearchResponse(
            query=query_text,
            questions=questions,
            companies=companies,
            pdfs=pdfs,
            total_results=len(questions) + len(companies) + len(pdfs),
        ),
        message="Search results fetched.",
    )
