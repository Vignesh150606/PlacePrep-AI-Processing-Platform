# PlacePrep API (server/)

FastAPI backend. Sprint 2 Step 2 status: application skeleton only —
config, logging, exception handling, CORS, API versioning, and a health
endpoint. No database, auth, or business routes yet (those land in later
Sprint 2 steps once Supabase + Google OAuth are configured).

## Setup

```bash
cd server
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Then check:
- http://localhost:8000/docs — interactive Swagger docs
- http://localhost:8000/api/v1/health — health check, should return:

```json
{
  "success": true,
  "message": "PlacePrep API is running.",
  "data": { "environment": "development", "supabase_configured": false },
  "errors": null
}
```

`supabase_configured: false` is expected until Sprint 2 Step 3.

## Structure

```
server/
  app/
    main.py              # FastAPI app factory + entry point
    core/
      config.py           # Settings (env-driven, single source of truth)
      logging_config.py   # Centralized logging setup
      exceptions.py        # AppException + handlers -> ApiResponse envelope
      responses.py         # ApiResponse{success,message,data,errors}
    api/
      deps.py              # Shared dependencies (get_current_user stub)
      v1/
        router.py           # Aggregates all v1 routes
        endpoints/
          health.py          # GET /api/v1/health
  requirements.txt
  .env.example
```

Every endpoint returns the same envelope — `{success, message, data, errors}` —
via `ok()` / `fail()` in `app/core/responses.py`, and every error (validation,
typed `AppException`, or unhandled) is normalized to that same shape by the
handlers in `app/core/exceptions.py`. New routes should follow this pattern
rather than returning raw dicts.
