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

### OCR fallback / direct image upload -- extra system packages

Scanned/image-only PDFs go through an OCR fallback (`app/services/ocr.py`),
and a directly-uploaded PNG/JPG/JPEG (a phone photo or screenshot of a
question paper -- Phase 6) is OCR-only by construction
(`app/services/image_text.py`). `pip install` alone is **not** enough for
either -- `pytesseract` and `pdf2image` are thin wrappers around two system
binaries pip cannot install:

```bash
# Debian/Ubuntu (e.g. Render's build image)
apt-get update && apt-get install -y tesseract-ocr poppler-utils

# macOS (Homebrew)
brew install tesseract poppler
```

If these aren't present, OCR is simply skipped (`OCR_ENABLED=true` in
`.env` but `app/services/ocr.is_available()` returns `False`) -- scanned
PDFs fail extraction with a clear "no selectable text" error, and image
uploads fail with a clear "OCR is required but unavailable" error, rather
than crashing the server. Check `GET /api/v1/health` -- `ocr_configured`
reflects the `OCR_ENABLED` setting (not the same as OCR being actually
*usable*; that's only checked lazily on first use).

**This pass verified the full image-upload OCR path end-to-end** against a
real Tesseract binary in the build sandbox: a synthetic image containing
real question text ("What is the capital of France? A) Berlin B) Paris
C) Madrid D) Rome") was fed through `image_text.extract_text_from_image()`
and correctly OCR'd back, including both the question and every option.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Then check:
- http://localhost:8000/docs -- interactive Swagger docs
- http://localhost:8000/api/v1/health -- health check

## Rate limiting (Phase 6)

Basic per-IP rate limiting via `slowapi` (`app/core/rate_limit.py`), on by
default (`RATE_LIMIT_ENABLED=true`). Stricter limits apply to `/pdfs/upload`
(10/minute -- each call can fan out into several Gemini API calls) and
`/quizzes/attempts/{id}/submit` (30/minute); everything else falls under a
general default (120/minute).

**Honest limitation:** the default storage backend is in-process memory.
That's correct for a single-instance deploy, but each additional instance
behind a load balancer enforces its own counters independently -- the
effective limit becomes `configured_limit * instance_count`, not the
configured limit. Set `RATE_LIMIT_STORAGE_URI` to a Redis URL before
scaling horizontally; no code change needed.

## Deploying (Render, or similar)

1. **`CORS_ORIGINS`** -- your real deployed frontend origin(s).
2. **`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`**.
3. **`tesseract-ocr` / `poppler-utils`** (see above) for OCR / image upload.
4. **Run all six migrations, in order** (`supabase/migrations/0001` through
   `0006`) against your Supabase project's SQL editor before deploying this
   version of the backend -- `0006` adds columns and a function this
   version's code depends on (`pdf_resources.file_kind`,
   `bulk_increment_question_stats()`, the Daily Challenge tables).
5. Optionally set `RATE_LIMIT_STORAGE_URI` to a Redis URL if deploying more
   than one instance (see above).

Also make sure your Supabase project's **Authentication -> URL
Configuration** and your Google Cloud OAuth client's **Authorized
JavaScript origins** both list your real deployed frontend URL.

## Structure

```
server/
  app/
    main.py                 # FastAPI app factory + rate-limiter wiring
    core/
      config.py              # Settings (env-driven, single source of truth)
      logging_config.py
      exceptions.py           # AppException + handlers -> ApiResponse envelope
      responses.py            # ApiResponse{success,message,data,errors}
      schemas.py              # CamelModel -- snake_case Python <-> camelCase JSON
      security.py             # Supabase JWT verification
      supabase_client.py      # Service-role Supabase client
      rate_limit.py           # NEW (Phase 6) -- slowapi wiring
    api/
      deps.py                 # get_current_user / is_admin / require_admin
      v1/
        router.py              # Aggregates all v1 routes
        endpoints/
          health.py
          profiles.py
          pdfs.py               # + multi-format upload, pagination, SSE status stream
          questions.py          # + pagination, admin Merge
          companies.py
          processing.py
          notifications.py
          quizzes.py            # + bulk-increment fix, /trend
          bookmarks.py
          search.py             # NEW (Phase 6) -- global search
          daily_challenge.py    # NEW (Phase 6) -- today/complete/streak
    services/
      pipeline.py              # Queued -> ... -> Notification, now format-agnostic
      pdf_text.py               # pypdf-based text extraction + quality signal
      image_text.py             # NEW (Phase 6) -- OCR-only extraction for a standalone image
      ocr.py                    # + ocr_image_bytes() for standalone images
      chunking.py
      answer_key.py
      duplicate.py
      classification.py
      notifications.py
      question_merge.py         # NEW (Phase 6) -- Admin Review "Merge"
      ai/
        base.py
        service.py
        gemini_provider.py
  requirements.txt
  .env.example
```

Every endpoint returns the same envelope --
`{success, message, data, errors}` -- via `ok()` / `fail()` in
`app/core/responses.py`, and every error is normalized to that same shape.
