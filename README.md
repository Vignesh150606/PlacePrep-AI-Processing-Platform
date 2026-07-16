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
Supabase project's SQL editor: `0001` through `0014`. Each is idempotent
(safe to re-run), but they are not independent of each other.

## What's here (see `PROJECT_STATE.md` for the full, current status)

- Authentication (Google OAuth via Supabase) + protected routing, RBAC
  (student/alumni/admin) and a full Admin Portal (dashboard, user/role
  management, audit trail, moderation queues)
- PDF **and image** upload (phone photos, screenshots) -> AI extraction ->
  validation -> duplicate detection -> classification -> storage -> cleanup
  -> notification pipeline
- Question Bank, Quiz Engine (with resume/timer/palette), Quiz Attempts,
  Wrong Answer Notebook, Bookmarks, Analytics, Admin Review
  (approve/reject/edit/delete/**merge**)
- Resource Intelligence Hub (cheat sheets, formula sheets, roadmaps,
  previous papers, links, videos -- submission + admin moderation)
- Interview Experience Repository (anonymity, round-by-round breakdown,
  votes, reports, admin moderation) and Placement Calendar
  (List/Calendar/Timeline views)
- Company Intelligence Hub -- every company page aggregates Questions,
  Interview Experiences, Resources, Alumni, Community discussions, and
  analytics/FAQ derived from real data
- Alumni Intelligence Network (Phase 11) -- a verified-alumni directory,
  self-submission + admin verification workflow (approve/reject/suspend/
  remove-verification/manual-verification), automatic contribution
  stats, and a mentorship-availability flag (foundation only -- no chat/
  scheduling/booking yet)
- Placement Community (Phase 12) -- a professional discussion forum
  (doubts, OA/company discussions, preparation strategies), 12 structured
  categories, nested replies, votes, tags, attachments, search/sort
  (newest/most-helpful/most-viewed/unanswered), reactive admin moderation
  (reported queue, pin/lock/delete, per-user suspension), integrated into
  Company Hub (a "Community" tab) and the Alumni module (verified badge,
  contribution stats, mentorship indicator carry over from Community
  activity too) -- no real-time chat, DMs, or mentorship scheduling (out
  of scope by design; see `PROJECT_STATE.md`'s Phase 12 section)
- Global search (⌘K command palette) and Daily Challenge backend (with
  streak tracking)
- Notifications (dropdown + standalone page), Dashboard, Company pages,
  PDF Library
- Basic rate limiting on upload/quiz-submission endpoints

## Not yet built

- Real-time chat, direct messaging, and mentorship scheduling/booking --
  deliberately out of scope for both the Alumni Intelligence Network and
  the Placement Community; see `PROJECT_STATE.md`'s Phase 11/12 sections
  for exactly what's deferred and why
- A checked-in automated test suite (`pytest`/`vitest`) -- verification to
  date has been real but ad hoc: typecheck/lint/build, live migration runs
  against a throwaway Postgres instance, and targeted unit tests of pure
  logic. See `PROJECT_STATE.md` for the exact list of what was and wasn't
  verified, and how.
