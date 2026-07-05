"""
Centralized application configuration.

Settings are loaded from environment variables (and a local `.env` file in
development) via pydantic-settings. Nothing else in the app should read
`os.environ` directly — always go through `get_settings()` so there is a
single source of truth and a single place to add validation later.
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
    #
    # PRODUCTION NOTE (learned the hard way): this defaults to the local Vite
    # dev origin. On every deployed environment (Render, etc.) you MUST set
    # CORS_ORIGINS explicitly to your real frontend origin(s), comma-separated,
    # e.g. CORS_ORIGINS=https://your-app.vercel.app — otherwise every browser
    # request from the deployed frontend will be silently blocked by CORS
    # with no server-side error logged. `create_app()` in main.py logs a
    # startup warning if this looks unconfigured in production.
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # --- Supabase ---
    # Current Supabase key system (publishable/secret), not the deprecated
    # anon/service_role/shared-JWT-secret model. New projects default to
    # asymmetric JWT signing keys, so the backend verifies user tokens by
    # calling Supabase Auth directly (Step 4) rather than needing a shared
    # secret. All Optional so this module imports cleanly before Step 3
    # (Supabase project creation) happens.
    SUPABASE_URL: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None
    SUPABASE_SECRET_KEY: Optional[str] = None

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SECRET_KEY)

    @property
    def supabase_jwks_url(self) -> str:
        """New-style asymmetric (ES256) JWT verification endpoint — public keys only."""
        return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1"

    # --- Storage ---
    PDF_STORAGE_BUCKET: str = "pdfs"
    MAX_PDF_SIZE_BYTES: int = 25 * 1024 * 1024  # 25MB — matches shared/PDF_UPLOAD_CONSTRAINTS
    ALLOWED_PDF_MIME_TYPES: str = "application/pdf"

    @property
    def allowed_pdf_mime_types(self) -> List[str]:
        return [t.strip() for t in self.ALLOWED_PDF_MIME_TYPES.split(",") if t.strip()]

    # --- AI provider (Step 2/3) ---
    AI_PROVIDER: Literal["gemini"] = "gemini"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash"

    @property
    def is_ai_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY)

    AI_CONFIDENCE_THRESHOLD: float = 0.7
    DUPLICATE_SIMILARITY_THRESHOLD: float = 0.87
    MAX_EXTRACTION_ATTEMPTS: int = 3


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — env is parsed once per process."""
    return Settings()
