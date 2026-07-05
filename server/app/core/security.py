"""
Verifies Supabase-issued access tokens.

New Supabase projects (including this one) sign session JWTs with an
asymmetric ES256 key pair rather than a shared HS256 secret. That means
verification only ever needs the *public* half of the key, fetched once
from Supabase's JWKS endpoint and cached in-process by `PyJWKClient` —
no network call to Supabase on every request, and no secret to leak.
"""
from functools import lru_cache
from typing import Any, Dict

import jwt
from jwt import PyJWKClient

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError

SUPABASE_JWT_AUDIENCE = "authenticated"


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    settings = get_settings()
    return PyJWKClient(settings.supabase_jwks_url)


def verify_access_token(token: str) -> Dict[str, Any]:
    """Verify signature, expiry, audience, and issuer. Returns the decoded claims."""
    settings = get_settings()
    if not settings.is_supabase_configured:
        raise UnauthorizedError("Supabase is not configured on this server.")

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience=SUPABASE_JWT_AUDIENCE,
            issuer=settings.supabase_issuer,
        )
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Session expired. Please sign in again.")
    except jwt.PyJWTError:
        raise UnauthorizedError("Invalid authentication token.")

    return claims
