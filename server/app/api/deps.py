"""
Shared FastAPI dependencies.
"""
from typing import Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.security import verify_access_token

_bearer_scheme = HTTPBearer(
    scheme_name="Supabase JWT",
    description="Paste the Supabase access token as: Bearer <token>",
)


class CurrentUser(BaseModel):
    id: str
    email: Optional[str] = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> CurrentUser:
    claims = verify_access_token(credentials.credentials)
    return CurrentUser(id=claims["sub"], email=claims.get("email"))


async def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Gate for admin-only endpoints (processing dashboard, KEEP_PERMANENT
    toggle). Fetches the profile role fresh rather than trusting a JWT claim,
    since role changes should take effect immediately, not on next login."""
    from app.core.exceptions import ForbiddenError
    from app.core.supabase_client import get_supabase_admin

    row = (
        get_supabase_admin()
        .table("profiles")
        .select("role_id")
        .eq("id", current_user.id)
        .single()
        .execute()
    )
    if not row.data or row.data.get("role_id") != 3:
        raise ForbiddenError("Admin access required.")
    return current_user
