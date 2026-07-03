"""
PlacePrep API — application entry point.

Run locally with:
    uvicorn app.main:app --reload --port 8000

Then check:
    http://localhost:8000/docs              (interactive API docs)
    http://localhost:8000/api/v1/health      (health check)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging_config import configure_logging
from app.core.responses import ok


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="0.1.0",
        description="Placement Intelligence Platform API.",
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
