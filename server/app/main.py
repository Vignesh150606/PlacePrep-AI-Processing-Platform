"""
PlacePrep API -- application entry point.

Run locally with:
    uvicorn app.main:app --reload --port 8000

Then check:
    http://localhost:8000/docs              (interactive API docs)
    http://localhost:8000/api/v1/health      (health check)
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging_config import configure_logging
from app.core.rate_limit import limiter
from app.core.responses import fail, ok

logger = logging.getLogger(__name__)


def _warn_if_cors_misconfigured(settings) -> None:
    """
    Polish/production-safety check: the single most common deploy-day bug
    in this project has been forgetting to set CORS_ORIGINS on the deployed
    backend (Render), which silently blocks every request from the deployed
    frontend (Vercel) with no server-side error -- just a browser console
    CORS failure that's easy to misdiagnose. Surface it loudly at startup
    instead of leaving it to be discovered via a support thread.
    """
    if settings.ENVIRONMENT != "production":
        return
    origins = settings.cors_origins
    if not origins or all("localhost" in o or "127.0.0.1" in o for o in origins):
        logger.warning(
            "CORS_ORIGINS is unset or still pointing at localhost while "
            "ENVIRONMENT=production. Every request from your deployed "
            "frontend will be blocked by the browser. Set CORS_ORIGINS to "
            "your real frontend origin(s), e.g. "
            "CORS_ORIGINS=https://your-app.vercel.app"
        )


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    _warn_if_cors_misconfigured(settings)

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="0.2.0",
        description="Placement Intelligence Platform API.",
    )

    # Rate limiting (Phase 6) -- see app/core/rate_limit.py for the honest
    # single-instance-storage caveat. Registered before CORS so a rejected
    # request still gets CORS headers on its 429 (otherwise the browser
    # reports an opaque CORS error instead of the real 429 body).
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=fail(f"Rate limit exceeded: {exc.detail}. Please slow down.").model_dump(),
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/")
    async def root():
        return ok(data={"name": settings.PROJECT_NAME}, message="See /docs for the API reference.")

    return app


app = create_app()
