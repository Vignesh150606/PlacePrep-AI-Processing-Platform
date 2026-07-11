"""
Server-side Supabase client, authenticated with the secret key.

This bypasses RLS entirely -- that's correct here, not a hole: by the time
any code reaches this client, `get_current_user` has already verified the
caller's identity via their JWT. RLS exists to protect direct client-side
access (the frontend's publishable-key client), not this trusted backend
path.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings
from app.core.exceptions import AppException


@lru_cache
def get_supabase_admin() -> Client:
    settings = get_settings()
    if not settings.is_supabase_configured:
        raise AppException("Supabase is not configured on this server.", status_code=500)
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
