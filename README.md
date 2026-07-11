# PlacePrep

Placement Intelligence Platform for AI-assisted placement preparation.

## Workspace

```txt
PlacePrep/
  client/     React application
  server/     FastAPI application
  shared/     Shared TypeScript contracts and constants
  supabase/   SQL migrations, policies, and seed data
  docs/       Architecture and implementation notes
```

## Development

Install dependencies:

```bash
pnpm install
```

Run all JavaScript workspaces:

```bash
pnpm dev
```

The backend uses Python dependencies listed in `server/requirements.txt` --
see `server/README.md` for the full setup and deploy checklist (including
the CORS/Supabase redirect-URL gotchas that most commonly bite on first
deploy, and the `tesseract-ocr`/`poppler-utils` system packages OCR and
direct image upload need).

## Database

Apply every migration in `supabase/migrations/`, **in order**, via your
Supabase project's SQL editor: `0001` through `0006`. Each is idempotent
(safe to re-run), but they are not independent of each other -- `0006`
in particular adds a Postgres function and columns the current backend
code depends on.

## What's here (see `PROJECT_STATE.md` for the full, current status)

- Authentication (Google OAuth via Supabase) + protected routing
- PDF **and image** upload (phone photos, screenshots) -> AI extraction ->
  validation -> duplicate detection -> classification -> storage -> cleanup
  -> notification pipeline
- Question Bank, Quiz Engine (with resume/timer/palette), Quiz Attempts,
  Wrong Answer Notebook, Bookmarks, Analytics, Admin Review
  (approve/reject/edit/delete/**merge**)
- Global search (⌘K command palette) and Daily Challenge backend (with
  streak tracking)
- Notifications (dropdown + standalone page), Dashboard, Company pages,
  PDF Library
- Basic rate limiting on upload/quiz-submission endpoints

## Not yet built

- Interview Experiences, Community, Placement Calendar backends (sample
  data / UI-only for now)
- A checked-in automated test suite (`pytest`/`vitest`) -- verification to
  date has been real but ad hoc: typecheck/lint/build, live migration runs
  against a throwaway Postgres instance, and targeted unit tests of pure
  logic. See `PROJECT_STATE.md` for the exact list of what was and wasn't
  verified, and how.
