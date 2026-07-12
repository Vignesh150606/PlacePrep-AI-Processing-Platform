"""
v1 API router -- every versioned route is aggregated here, then mounted once
in `app.main` under `settings.API_V1_PREFIX`.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    bookmarks,
    calendar,
    companies,
    daily_challenge,
    health,
    interview_experiences,
    notifications,
    pdfs,
    processing,
    profiles,
    questions,
    quizzes,
    search,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["Profiles"])
api_router.include_router(pdfs.router, prefix="/pdfs", tags=["PDFs"])
api_router.include_router(questions.router, prefix="/questions", tags=["Questions"])
api_router.include_router(companies.router, prefix="/companies", tags=["Companies"])
api_router.include_router(processing.router, prefix="/processing", tags=["Processing"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["Quizzes"])
api_router.include_router(bookmarks.router, prefix="/bookmarks", tags=["Bookmarks"])
api_router.include_router(search.router, prefix="/search", tags=["Search"])
api_router.include_router(daily_challenge.router, prefix="/daily-challenge", tags=["Daily Challenge"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["Placement Calendar"])
api_router.include_router(
    interview_experiences.router, prefix="/interview-experiences", tags=["Interview Experiences"]
)
