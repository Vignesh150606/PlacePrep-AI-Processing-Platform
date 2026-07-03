"""Health check — used for uptime checks and to confirm the frontend can reach the backend."""
from fastapi import APIRouter

from app.core.config import get_settings
from app.core.responses import ApiResponse, ok

router = APIRouter()


@router.get("/health", response_model=ApiResponse[dict])
async def health_check() -> ApiResponse[dict]:
    settings = get_settings()
    return ok(
        data={
            "environment": settings.ENVIRONMENT,
            "supabase_configured": settings.is_supabase_configured,
        },
        message="PlacePrep API is running.",
    )
