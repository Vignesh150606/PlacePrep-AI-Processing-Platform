# Deployment Guide

PlacePrep deploys as three pieces: **Supabase** (database, auth, storage),
**Render** (FastAPI backend), and **Vercel** (the static/SPA frontend build).
This is the guide that didn't exist before this pass -- previously the only
deployment knowledge was scattered across `.env.example` comments and one
mention of "Render's build image" in `server/README.md`.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run every migration in `supabase/migrations/`, **in order** (`0001_...`
   through `0018_...` as of this pass), via the SQL editor or the Supabase
   CLI (`supabase db push`). Each one is idempotent (`create table if not
   exists`, `add column if not exists`) but still must run in numeric order
   -- later ones assume earlier tables/columns already exist.
3. **Auth providers**: enable Email and Google under Authentication ->
   Providers. For Google, you'll need an OAuth client ID/secret from the
   [Google Cloud Console](https://console.cloud.google.com/) -- add
   Supabase's callback URL (shown on that provider's settings page) as an
   authorized redirect URI there.
4. **Storage buckets** are created by migration 0002 (`pdfs`, private) and
   0013 (`interview-images`, public) -- both are wired to real upload
   endpoints. Migration 0002 also creates an `avatars` bucket (public,
   with matching own-folder RLS) that **no endpoint uses yet** -- Settings
   > Account currently accepts an avatar as a pasted URL rather than a
   direct upload. The bucket and its RLS policy are real and ready; wiring
   an upload endpoint to it is future work, not something this pass added
   or removed.
5. Copy **Project URL**, **anon/publishable key**, and **service_role/secret
   key** from Project Settings -> API -- you'll need all three below.

## 2. Backend (Render)

A `render.yaml` Blueprint is included at the repo root -- in the Render
dashboard, New -> Blueprint, point it at this repo, and Render proposes the
service below. You still fill in the `sync: false` secrets by hand (Render
never reads secrets from a file you commit).

If you'd rather configure it manually instead of via the Blueprint:

- **Root directory**: `server`
- **Build command**:
  ```bash
  apt-get update && apt-get install -y tesseract-ocr poppler-utils && pip install -r requirements.txt
  ```
  The `apt-get` step is not optional -- `pytesseract`/`pdf2image` are thin
  Python wrappers around the `tesseract-ocr`/`poppler-utils` system
  binaries; without them, OCR fails open with a clear error rather than
  crashing (see `server/README.md`), but scanned-PDF and photo-upload
  question extraction silently won't work.
- **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health check path**: `/api/v1/health`
- **Environment variables** -- see `server/.env.example` for the full
  list with defaults; at minimum you must set `ENVIRONMENT=production`,
  `CORS_ORIGINS` (your stable Vercel URL, added *after* step 3 below), and
  the three Supabase values plus `GEMINI_API_KEY` from step 1/4.

Once deployed, `ENVIRONMENT=production` automatically disables `/docs`,
`/redoc`, and `/openapi.json` (Phase 17 -- see `main.py`) and the startup
log will loudly warn (not fail) if `CORS_ORIGINS`/`CORS_ORIGIN_REGEX` still
look unset or localhost-only, so a misconfigured deploy is visible in the
logs instead of silently rejecting every browser request.

**Vercel preview deployments and CORS_ORIGIN_REGEX**: Vercel mints a brand
new, unique URL (`<project>-<random-hash>.vercel.app`) for *every* deploy
of a non-production branch. `CORS_ORIGINS` is an exact-match list, so
pointing it at one preview URL breaks again the next time you deploy. The
Blueprint (`render.yaml`) also sets `CORS_ORIGIN_REGEX`, matched against
the request's `Origin` header, scoped to this project's Vercel deployments
by name so it doesn't need to change per deploy -- only add/adjust
`CORS_ORIGINS` for your stable, non-changing origins (a custom domain, or
the production `.vercel.app` alias).

If a browser tab shows a CORS error but `GET /api/v1/health` responds
`200` when hit directly (e.g. with curl), the backend is up and the
request handler ran fine -- `CORSMiddleware` just didn't recognize the
requesting `Origin` and so didn't add `Access-Control-Allow-Origin` to the
response, which is what makes the browser discard it. That's a
`CORS_ORIGINS`/`CORS_ORIGIN_REGEX` mismatch, not a backend crash.

Render's **free tier spins the instance down after ~15 minutes idle** and
takes 30-60+ seconds to cold-start the next request -- the frontend's
`BootGate` (Phase 17) exists specifically to make that wait visible
instead of every API call failing at once on the first visit after a nap.

## 3. Frontend (Vercel)

`vercel.json` at the repo root already has the right build config
(`pnpm --filter client build`, output `client/dist`, SPA rewrite for
client-side routing). Import the repo in Vercel and set these environment
variables (Project Settings -> Environment Variables):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | same Supabase Project URL as step 1 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same anon/publishable key as step 1 (safe to expose client-side by design) |
| `VITE_API_BASE_URL` | your Render URL + `/api/v1`, e.g. `https://placeprep-api.onrender.com/api/v1` |

After the first deploy, copy the resulting Vercel URL back into the
backend's `CORS_ORIGINS` (step 2) and redeploy the backend -- the two
deploys are circularly dependent on each other's URL exactly once, at
first setup.

## 4. Post-deploy checklist

- [ ] `GET https://<render-url>/api/v1/health` returns `200` with `ok: true`
- [ ] Visiting the Vercel URL after the backend has been idle shows the
      "waking up the server" screen, not a blank page or console errors
- [ ] Signing in with Google actually redirects back to the deployed
      Vercel URL (not `localhost`) -- a common first-deploy miss is
      leaving Supabase's Auth "Site URL" setting on `localhost:5173`
- [ ] `https://<render-url>/docs` returns `404` (confirms
      `ENVIRONMENT=production` took effect)
- [ ] Uploading a PDF and a scanned/image question both succeed (confirms
      the `apt-get` system packages actually installed)
