"""
Company Directory endpoints -- read-only list/detail.

Companies are upserted automatically by the classification step during PDF
extraction (see app/services/classification.py) -- there's no create/update
endpoint here, since admin-managed company profiles are a later feature.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError

from app.api.deps import CurrentUser, get_current_user
from app.core.exceptions import NotFoundError
from app.core.responses import ApiResponse, ok
from app.core.schemas import CamelModel
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


class CompanyResponse(CamelModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    description: str
    website: Optional[str] = None
    industry: str
    tier: str
    roles: List[str]
    average_package_lpa: Optional[float] = None
    question_count: int
    experience_count: int
    upcoming_visit_date: Optional[str] = None
    created_at: str


class CompanyListResponse(CamelModel):
    items: List[CompanyResponse]


def _question_counts_by_company() -> Dict[str, int]:
    rows = get_supabase_admin().table("question_companies").select("company_id").execute().data or []
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["company_id"]] = counts.get(row["company_id"], 0) + 1
    return counts


def _row_to_response(row: Dict[str, Any], question_count: int) -> CompanyResponse:
    return CompanyResponse(
        id=row["id"],
        name=row["name"],
        slug=row["slug"],
        logo_url=row.get("logo_url"),
        description=row.get("description") or "",
        website=row.get("website"),
        industry=row.get("industry") or "",
        tier=row["tier"],
        roles=row.get("roles") or [],
        average_package_lpa=row.get("average_package_lpa"),
        question_count=question_count,
        experience_count=row.get("experience_count", 0),
        upcoming_visit_date=row.get("upcoming_visit_date"),
        created_at=row["created_at"],
    )


@router.get("", response_model=ApiResponse[CompanyListResponse])
async def list_companies(current_user: CurrentUser = Depends(get_current_user)):
    rows = get_supabase_admin().table("companies").select("*").order("name").execute().data or []
    counts = _question_counts_by_company()
    items = [_row_to_response(r, counts.get(r["id"], 0)) for r in rows]
    return ok(data=CompanyListResponse(items=items), message="Companies fetched.")


@router.get("/{slug}", response_model=ApiResponse[CompanyResponse])
async def get_company(slug: str, current_user: CurrentUser = Depends(get_current_user)):
    try:
        row = get_supabase_admin().table("companies").select("*").eq("slug", slug).single().execute().data
    except APIError as exc:
        if exc.code == "PGRST116":
            raise NotFoundError("Company not found.")
        raise
    counts = _question_counts_by_company()
    return ok(data=_row_to_response(row, counts.get(row["id"], 0)), message="Company fetched.")
