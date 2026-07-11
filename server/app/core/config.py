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

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

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
