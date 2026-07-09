# PlacePrep API (server/)

FastAPI backend for the AI-assisted placement preparation platform.

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

### OCR fallback — extra system packages (Sprint 4)

Scanned/image-only PDFs are now handled automatically via an OCR fallback
(`app/services/ocr.py`), but `pip install` alone is **not** enough for it to
work — `pytesseract` and `pdf2image` are thin wrappers around two system
binaries pip cannot install:

```bash
# Debian/Ubuntu (e.g. Render's build image)
apt-get update && apt-get install -y tesseract-ocr poppler-utils

# macOS (Homebrew)
brew install tesseract poppler
```

If these aren't present, OCR is simply skipped (`OCR_ENABLED=true` in
`.env` but `app/services/ocr.is_available()` returns `False`) — scanned PDFs
will fail extraction with the same "no selectable text" error as before this
pass, rather than crashing the server. Check `GET /api/v1/health` —
`ocr_configured` reflects the `OCR_ENABLED` setting (not the same as OCR
being actually *usable*; that's only checked lazily on first use).

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Then check:
- http://localhost:8000/docs — interactive Swagger docs
- http://localhost:8000/api/v1/health — health check

## Deploying (Render, or similar)

Two environment variables are the most common source of deploy-day bugs —
double check these on every deployed environment, not just locally:

1. **`CORS_ORIGINS`** — must be your real deployed frontend origin(s),
   comma-separated (e.g. `https://your-app.vercel.app`). Left at the
   `localhost` default, every request from your deployed frontend is
   silently blocked by the browser with no server-side error. Set
   `ENVIRONMENT=production` too — the app logs a startup warning if it
   detects this misconfiguration.
2. **`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`** —
   from your Supabase project's API settings (current publishable/secret
   key system, not the deprecated anon/service_role naming).
3. **`tesseract-ocr` / `poppler-utils`** (see above) if you want the OCR
   fallback to actually run on the deployed instance, not just locally.

Also make sure your Supabase project's **Authentication → URL Configuration**
(Site URL + Redirect URLs) and your Google Cloud OAuth client's **Authorized
JavaScript origins** both list your real deployed frontend URL — these are
configured in Supabase/Google, not in this backend, but a mismatch there
causes login to redirect to the wrong place after Google auth completes.

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
      schemas.py           # CamelModel — snake_case Python <-> camelCase JSON
      security.py          # Supabase JWT verification
      supabase_client.py   # Service-role Supabase client
    api/
      deps.py              # get_current_user / is_admin / require_admin
      v1/
        router.py           # Aggregates all v1 routes
        endpoints/
          health.py
          profiles.py
          pdfs.py
          questions.py       # + Module 8 admin review (approve/reject/edit/delete)
          companies.py
          processing.py
          notifications.py
          quizzes.py         # NEW — quiz attempts + Wrong Answer Notebook
          bookmarks.py       # NEW — Module 5
    services/
      pipeline.py           # Queued -> Processing -> Extraction -> ... -> Notification
      pdf_text.py           # pypdf-based text extraction + per-page quality signal
      ocr.py                # NEW — scanned-PDF OCR fallback (Sprint 4 fix #3)
      chunking.py           # NEW — large-PDF chunk splitting (Sprint 4 fix #4)
      answer_key.py         # NEW — separates a trailing "Answer Key" section pre-chunking
      duplicate.py          # exact hash + rapidfuzz fuzzy match
      classification.py     # subject/topic/company upsert + confidence gating
      notifications.py      # thin insert wrapper
      ai/
        base.py              # AIProvider interface
        service.py            # AIService — pipeline's single entry point
        gemini_provider.py    # Gemini implementation — redesigned prompt (Sprint 4 fix #2)
  requirements.txt
  .env.example
```

Every endpoint returns the same envelope — `{success, message, data, errors}` —
via `ok()` / `fail()` in `app/core/responses.py`, and every error (validation,
typed `AppException`, or unhandled) is normalized to that same shape by the
handlers in `app/core/exceptions.py`.
