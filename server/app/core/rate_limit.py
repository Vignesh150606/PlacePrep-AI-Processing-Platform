"""
Basic per-IP rate limiting (Phase 6 pass -- "rate limiting" on the bug/
hardening list).

Uses slowapi (a Flask-limiter-style wrapper over `limits`), keyed by
client IP. Deliberately NOT keyed by user id: an unauthenticated flood
(e.g. hammering /health or a login-adjacent endpoint before a token
exists) needs protection too, and IP is the only thing available at that
point.

HONEST LIMITATION: the default storage backend is in-process memory. That
is correct and sufficient for the current single-instance deploy target,
but is NOT a distributed rate limit -- if this API is ever run as more
than one process/instance behind a load balancer, each instance enforces
its own counters independently, so the effective limit becomes
`limit * instance_count`, not the configured limit. Set
`RATE_LIMIT_STORAGE_URI` to a Redis URL (slowapi/limits both support this
natively via `redis://` URIs) before scaling horizontally -- no code
change needed, just the env var.

Two stricter limits are applied to the endpoints that actually cost
money/CPU/storage (PDF & image upload, which triggers a Gemini call chain;
quiz submission, which does several DB writes per response) via the
`upload_limit` / `quiz_submit_limit` decorators below. Everything else
falls under the general default limit applied at the app level.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[_settings.RATE_LIMIT_DEFAULT] if _settings.RATE_LIMIT_ENABLED else [],
    storage_uri=_settings.RATE_LIMIT_STORAGE_URI,
    enabled=_settings.RATE_LIMIT_ENABLED,
)


def upload_limit():
    """Decorator for the PDF/image upload endpoint -- stricter than default
    since each call can trigger multiple Gemini API calls (one per chunk)."""
    return limiter.limit(_settings.RATE_LIMIT_UPLOAD)


def quiz_submit_limit():
    """Decorator for quiz submission -- several sequential DB writes per
    response (times_attempted/times_correct update + wrong-answer upsert)."""
    return limiter.limit(_settings.RATE_LIMIT_QUIZ_SUBMIT)
