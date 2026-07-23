"""
Centralized application configuration.

Settings are loaded from environment variables (and a local `.env` file in
development) via pydantic-settings. Nothing else in the app should read
`os.environ` directly -- always go through `get_settings()` so there is a
single source of truth and a single place to add validation later.

PHASE 6 PASS additions (see PROJECT_STATE.md):
  - MAX_IMAGE_SIZE_BYTES / ALLOWED_IMAGE_MIME_TYPES: the upload endpoint now
    accepts PNG/JPG/JPEG directly (phone photos, screenshots of a question
    paper) in addition to PDF -- see services/image_text.py and the updated
    services/pipeline.py.
  - RATE_LIMIT_*: basic abuse protection on the endpoints that do real work
    (upload, quiz submit) -- see app/core/rate_limit.py for the honest
    single-instance-only caveat.
"""
from functools import lru_cache
from typing import List, Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- App metadata ---
    PROJECT_NAME: str = "PlacePrep API"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    API_V1_PREFIX: str = "/api/v1"

    # --- CORS ---
    # Plain string, not List[str]: pydantic-settings auto-attempts a JSON
    # parse on any complex-typed env var *before* field validators run, so a
    # comma-separated string in .env would crash here even with a "before"
    # validator. Keeping this as `str` and exposing `cors_origins` below
    # (a plain property, parsed after settings load) sidesteps that.
    CORS_ORIGINS: str = "http://localhost:5173"

    # Root cause of the "backend is alive but every request is CORS-blocked"
    # class of bug: CORSMiddleware only ever adds Access-Control-Allow-Origin
    # for an origin that exactly, literally matches an entry in
    # `allow_origins` -- no wildcards, no subdomain matching. Vercel issues a
    # brand-new unique preview URL (`<project>-<random-hash>.vercel.app`) on
    # *every* deploy, so pinning CORS_ORIGINS to one specific preview URL
    # guarantees it goes stale on the very next deploy. CORS_ORIGIN_REGEX
    # covers that: it's passed straight through to CORSMiddleware's
    # `allow_origin_regex`, which Starlette matches with `re.fullmatch`
    # against the request's Origin header, so it's safe to scope tightly to
    # this project's own Vercel deployments instead of something broad like
    # `.*\.vercel\.app` (which would trust every OTHER Vercel project too).
    # Explicit stable origins (a custom domain, the production Vercel alias)
    # still belong in CORS_ORIGINS -- this is specifically for the preview
    # URLs that churn on every deploy.
    CORS_ORIGIN_REGEX: Optional[str] = None

    @property
    def cors_origins(self) -> List[str]:
        # Also strips a stray wrapping quote per entry -- pasting a quoted
        # value into Render's env var UI (e.g. CORS_ORIGINS="https://foo")
        # makes the quote characters part of the literal string, which then
        # never matches a real Origin header (which never contains quotes).
        return [
            origin.strip().strip("'\"")
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip().strip("'\"")
        ]

    @property
    def cors_origin_regex(self) -> Optional[str]:
        value = (self.CORS_ORIGIN_REGEX or "").strip().strip("'\"")
        return value or None

    # --- Supabase ---
    SUPABASE_URL: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None
    SUPABASE_SECRET_KEY: Optional[str] = None

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SECRET_KEY)

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1"

    # --- Storage ---
    PDF_STORAGE_BUCKET: str = "pdfs"
    MAX_PDF_SIZE_BYTES: int = 25 * 1024 * 1024  # 25MB -- matches shared/PDF_UPLOAD_CONSTRAINTS
    ALLOWED_PDF_MIME_TYPES: str = "application/pdf"

    @property
    def allowed_pdf_mime_types(self) -> List[str]:
        return [t.strip() for t in self.ALLOWED_PDF_MIME_TYPES.split(",") if t.strip()]

    # Phase 6: direct image upload (phone photos / screenshots of a paper)
    # so a student doesn't have to scan-to-PDF first. Images reuse the same
    # OCR path a scanned PDF already goes through -- see
    # services/image_text.py, which wraps a single image the same way
    # services/pdf_text.py wraps a multi-page PDF (one PageText entry).
    MAX_IMAGE_SIZE_BYTES: int = 15 * 1024 * 1024  # 15MB -- phone photos are usually 2-8MB
    ALLOWED_IMAGE_MIME_TYPES: str = "image/png,image/jpeg,image/jpg"

    @property
    def allowed_image_mime_types(self) -> List[str]:
        return [t.strip() for t in self.ALLOWED_IMAGE_MIME_TYPES.split(",") if t.strip()]

    @property
    def allowed_upload_mime_types(self) -> List[str]:
        return self.allowed_pdf_mime_types + self.allowed_image_mime_types

    # Phase 13: question images/attachments need a PUBLIC bucket (embedded
    # inline, viewed repeatedly across quiz attempts) -- unlike 'pdfs',
    # which is private and only ever handed out as a short-lived signed
    # URL for one-off downloads (see resources.py's download_resource).
    # Audit found `interview-images` already exists (migration 0002) with
    # exactly the right shape -- public, own-folder write/delete RLS -- but
    # was never actually wired up to any endpoint. Reused here rather than
    # provisioning a second public bucket for the same purpose.
    QUESTION_ASSET_BUCKET: str = "interview-images"
    MAX_QUESTION_ASSET_SIZE_BYTES: int = 8 * 1024 * 1024  # 8MB

    # --- AI provider (Step 2/3) ---
    AI_PROVIDER: Literal["gemini"] = "gemini"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    @property
    def is_ai_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY)

    AI_CONFIDENCE_THRESHOLD: float = 0.7
    DUPLICATE_SIMILARITY_THRESHOLD: float = 0.87
    MAX_EXTRACTION_ATTEMPTS: int = 3

    # --- Chunking (Sprint 4 fix #4 -- large PDF support) ---
    CHUNK_MAX_CHARS: int = 12_000
    CHUNK_OVERLAP_CHARS: int = 400

    # --- OCR fallback (Sprint 4 fix #3 -- scanned PDF support) ---
    OCR_ENABLED: bool = True
    OCR_MIN_CHARS_PER_PAGE: int = 40
    OCR_DPI: int = 200

    # --- Rate limiting (Phase 6 pass) ---
    # In-memory (slowapi's default MemoryStorage) -- correct per-process
    # behavior on a single dev/small deploy instance, but each additional
    # instance behind a load balancer gets its OWN counters, so real
    # throughput allowed is `limit * instance_count`. Fine for the current
    # single-Render-instance deploy target; swap `RATE_LIMIT_STORAGE_URI`
    # to a shared Redis URL before scaling horizontally (slowapi supports
    # this natively -- see app/core/rate_limit.py).
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_STORAGE_URI: Optional[str] = None  # e.g. "redis://localhost:6379"
    RATE_LIMIT_DEFAULT: str = "120/minute"
    RATE_LIMIT_UPLOAD: str = "10/minute"
    RATE_LIMIT_QUIZ_SUBMIT: str = "30/minute"

    # --- Daily Challenge (Phase 6) ---
    DAILY_CHALLENGE_QUESTION_COUNT: int = 5
    # How many of the N questions are pulled from the student's weak topics
    # (per Analytics' own definition: >=3 answered questions, sorted by
    # lowest accuracy) versus a random pool -- keeps the challenge feeling
    # fresh rather than "just your worst topic every day."
    DAILY_CHALLENGE_WEAK_TOPIC_SLOTS: int = 3


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance -- env is parsed once per process."""
    return Settings()
