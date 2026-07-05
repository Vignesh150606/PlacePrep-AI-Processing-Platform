"""
v1 API router — every versioned route is aggregated here, then mounted once
in `app.main` under `settings.API_V1_PREFIX`.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import health, notifications, pdfs, processing, profiles

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["Profiles"])
api_router.include_router(pdfs.router, prefix="/pdfs", tags=["PDFs"])
api_router.include_router(processing.router, prefix="/processing", tags=["Processing"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
