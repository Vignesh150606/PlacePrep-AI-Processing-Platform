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
from slowapi.middleware import SlowAPIMiddleware

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
    origins_look_unset = not origins or all("localhost" in o or "127.0.0.1" in o for o in origins)
    if origins_look_unset and not settings.cors_origin_regex:
        logger.warning(
            "CORS_ORIGINS is unset or still pointing at localhost, and "
            "CORS_ORIGIN_REGEX is unset, while ENVIRONMENT=production. "
            "Every request from your deployed frontend will be blocked by "
            "the browser -- the backend will still return 200, but without "
            "an Access-Control-Allow-Origin header, so the browser discards "
            "the response before your app ever sees it. Set CORS_ORIGINS to "
            "your real frontend origin(s), e.g. "
            "CORS_ORIGINS=https://your-app.vercel.app -- and, if you deploy "
            "on Vercel, also set CORS_ORIGIN_REGEX so preview-deployment "
            "URLs (which change on every deploy) are covered too, e.g. "
            r"CORS_ORIGIN_REGEX=^https://your-project(-[a-zA-Z0-9]+)*\.vercel\.app$"
        )


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    _warn_if_cors_misconfigured(settings)

    # Interactive docs (Phase 17): FastAPI exposes /docs, /redoc, and the
    # full OpenAPI schema unconditionally by default -- fine for local
    # dev, but there's no reason a deployed production instance needs to
    # publicly hand out its entire endpoint/schema map (every admin route
    # included) to anyone who finds the URL. Still on in development and
    # staging, where the value (manual API testing) outweighs it.
    is_production = settings.ENVIRONMENT == "production"
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="0.2.0",
        description="Placement Intelligence Platform API.",
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
    )

    # Rate limiting (Phase 6, corrected in Phase 17) -- see
    # app/core/rate_limit.py for the honest single-instance-storage
    # caveat. `app.state.limiter` + the exception handler alone are NOT
    # enough for `RATE_LIMIT_DEFAULT` to apply to anything: without
    # `SlowAPIMiddleware` registered, only routes with an explicit
    # `@limiter.limit(...)` (here, `@upload_limit()`/`@quiz_submit_limit()`)
    # were ever actually being checked -- every other route, including
    # auth-adjacent ones, had no rate limiting at all despite
    # rate_limit.py's own comment claiming otherwise. Registered before
    # CORS so a rejected request still gets CORS headers on its 429
    # (otherwise the browser reports an opaque CORS error instead of the
    # real 429 body).
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=fail(f"Rate limit exceeded: {exc.detail}. Please slow down.").model_dump(),
        )

    # allow_origins: exact-match list for stable origins (custom domain,
    # production Vercel alias, localhost in dev).
    # allow_origin_regex: covers Vercel preview deployments, whose URL gets
    # a new random hash on every single deploy -- see CORS_ORIGIN_REGEX's
    # docstring in config.py. Starlette applies `re.fullmatch` against the
    # Origin header for this, so it's exact/anchored, not a substring check.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Baseline security response headers (Phase 17). This is a JSON API with
    # no server-rendered HTML of its own, so this deliberately doesn't
    # include a CSP (that belongs on the frontend's own hosting config,
    # Vercel, where the actual HTML is served) -- just the headers that are
    # this API's own responsibility regardless of what serves the frontend.
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        return response

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/")
    async def root():
        return ok(data={"name": settings.PROJECT_NAME}, message="See /docs for the API reference.")

    return app


app = create_app()
