"""Health check -- used for uptime checks and to confirm the frontend can reach the backend.

Extended (free-tier keep-alive pass): a plain "the process is up" response
was never enough to stop Supabase's own free-tier inactivity pause --
Supabase's pause timer only resets on real database activity (a request
that never reaches the DB, like a static homepage ping, doesn't count).
So this now does one cheap, real query too. Two independent free-tier
timers this single endpoint now addresses when polled regularly (see
`.github/workflows/keep-alive.yml`):
  - Render's own web service, which spins down after ~15 min idle --
    any HTTP request here resets that, no DB query needed.
  - Supabase's free-tier project, which pauses after ~7 days with no
    real database activity -- needs an actual query, which is why this
    endpoint now makes one.

IMPORTANT LIMITATION, stated plainly rather than implied: this only
*prevents* the Supabase pause by running before the 7-day window closes.
It cannot *undo* one -- once a free-tier project is actually paused,
Supabase requires a manual "Restore" click in its dashboard; no amount of
pinging this endpoint (or any endpoint) brings it back automatically. If
the scheduled workflow itself ever stops running for 7+ days (disabled,
repo transferred, GitHub outage), the project will still pause, and
Supabase's own warning email (sent ~1 week before pausing) is the
fallback safety net, not this endpoint.

The DB check is wrapped so a Supabase hiccup can never turn this
endpoint itself into a 500 -- `boot_gate.tsx`'s cold-start detection
keys off a plain HTTP 200, and a temporarily-unreachable database
shouldn't block the whole app from ever finishing its "waking up"
screen. `databaseReachable: false` in the body is the honest signal
for that case instead.
"""
from fastapi import APIRouter

from app.core.config import get_settings
from app.core.responses import ApiResponse, ok
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


def _check_database_reachable() -> bool:
    try:
        # `profiles` is never empty in any real deployment (every signed-up
        # user has one) and `limit(1)` makes this negligible cost -- this
        # is purely "can we reach and query the database", not a real
        # health metric about profiles specifically.
        get_supabase_admin().table("profiles").select("id").limit(1).execute()
        return True
    except Exception:
        # Deliberately broad: a config error, a paused project (Supabase
        # answers HTTP 540 for every request while paused), a network
        # blip, or a genuine outage should all land here the same way --
        # this endpoint's job is to report "reachable or not", not to
        # classify every possible failure mode.
        return False


@router.get("/health", response_model=ApiResponse[dict])
async def health_check() -> ApiResponse[dict]:
    settings = get_settings()
    database_reachable = _check_database_reachable() if settings.is_supabase_configured else False
    return ok(
        data={
            "environment": settings.ENVIRONMENT,
            "supabaseConfigured": settings.is_supabase_configured,
            "databaseReachable": database_reachable,
            "aiConfigured": settings.is_ai_configured,
            "ocrConfigured": settings.OCR_ENABLED,
            "rateLimitEnabled": settings.RATE_LIMIT_ENABLED,
        },
        message="PlacePrep API is running.",
    )
