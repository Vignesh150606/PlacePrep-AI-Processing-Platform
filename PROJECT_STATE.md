# PlacePrep Project State

Last updated: 2026-07-04 (Polish/Bug-Fix Sprint)

## Current Status

Sprint 4 (AI Processing Platform) is code-complete, per the previous update.
This entry covers a **polish and bug-fix pass** performed on top of it —
scoped deliberately narrow: fix real, verifiable bugs and inconsistencies;
do not add new features (bookmarks API, quiz backend, search, etc. are all
explicitly out of scope here even though they're on the roadmap).

⚠️ **Process note on this pass**: it was done by reconstructing the project
from source files shared in a chat conversation (not a live clone of the
actual deployed repo), then verifying with real tooling — `pnpm install`,
`tsc`, `oxlint`, `vite build`, `python -m py_compile`, and actually booting
the FastAPI app and hitting `/api/v1/health`. Everything below was
confirmed working in that reconstructed environment, not assumed. Changes
described here still need to be merged into the actual repository by hand
(see the file list in the accompanying chat message) — this file does not
know about any commits made directly to the real repo after the source was
shared.

## What Changed This Pass

**Critical:**
- `client/src/lib/auth-user.ts` — removed a hardcoded `"Vignesh M"` dev
  placeholder that would display as another user's name whenever Google
  auth metadata lacked `full_name`. Falls back to the email's local-part
  instead.
- `.env.example` (root) — fixed stale/inconsistent Supabase key names that
  didn't match what the actual code reads (old anon/service_role naming vs.
  the current publishable/secret key system already used everywhere else).
- `server/app/main.py` — added a startup log warning when
  `ENVIRONMENT=production` but `CORS_ORIGINS` still looks like the
  localhost default. This exact misconfiguration was the root cause of a
  live deploy incident this sprint (Vercel frontend → Render backend, every
  request silently CORS-blocked). Also documented prominently in
  `server/README.md` and both `.env.example` files.

**Major:**
- `client/src/components/dashboard/recent-pdfs-card.tsx` — swapped from
  `mocks/pdfs.ts` to the real `usePdfs()` API hook. This was explicitly
  flagged as a "five-minute follow-up" in the previous update and never
  done — a user's actual recent uploads never appeared on their own
  dashboard.
- `client/src/components/layout/notification-center.tsx` — fixed a
  loading-state bug: the dropdown briefly rendered "No notifications"
  before the real list loaded, because the component only ever checked
  `data`, never `isLoading`.

**Minor:**
- `client/src/components/quiz/quiz-config-form.tsx` — the question-count
  picker only offered 3/5/10 while its own zod schema allowed up to 20;
  added a 20 option.
- `client/src/lib/format.ts` — `formatBytes()` had no GB tier.
- Removed `client/src/mocks/notifications.ts` — dead code; nothing has
  imported it since `NotificationCenter` moved to the real API hook.

**Docs/cosmetic:**
- `client/README.md` was still the unedited Vite template; replaced with
  real project setup + deploy notes.
- `server/README.md` gained a deploy checklist covering the CORS and
  Supabase/Google-OAuth redirect-URL misconfigurations that actually bit
  this project during deployment.
- `docs/ROADMAP.md` expanded from two lines to reflect what's actually
  shipped.

## Deliberately Not Changed (out of scope for this pass)

- `use-bookmarks.ts` is still in-memory only. A real `bookmarks` table +
  RLS policies already exist (migration `0002`), but there's no
  `/api/v1/bookmarks` endpoint yet. Building one is a small new feature,
  not a bug fix — left for its own sprint rather than added silently.
- Question Bank and Quiz pages are still on mock data. Wiring them to real
  APIs is feature work (Milestones 10–12 in the original roadmap), not
  polish.
- The extraction pipeline still runs on FastAPI `BackgroundTasks`, not a
  real queue. Moving to Celery/RQ/arq + Redis is an infra project, not a
  bug fix — same reasoning as previous sprints.
- No OCR, no global search, no standalone Bookmarks/Wrong-Answers pages —
  all unchanged, all already tracked below.

## Milestones (original 22-milestone roadmap — unchanged from last update
except where noted)

- [x] 1. Project Foundation
- [x] 2. Frontend App Shell
- [x] 3. Backend Foundation
- [x] 4. Shared Contracts
- [x] 5. Authentication
- [x] 6. Database
- [x] 7. Storage
- [x] 8. PDF Upload
- [~] 9. AI Extraction — pipeline built, verified importable/bootable;
      still pending a real `GEMINI_API_KEY` for a live end-to-end run
- [~] 10. Question Management — UI still on mock data
- [~] 11. Quiz Engine — mock data
- [~] 12. Quiz Attempt — mock data
- [ ] 13. Wrong Answer Notebook
- [ ] 14. Bookmarks (standalone page) — DB + RLS ready, no API/UI yet
- [~] 15. Interview Experiences — mock data
- [~] 16. Company Pages — mock data, but `companies` can be auto-created
      by the classification step
- [ ] 17. Search (global/unified)
- [x] 18. Dashboard — **RecentPdfsCard now reads real data** (was mock)
- [x] 19. Notifications — real backend + UI, loading-state bug fixed
- [~] 20. Polish — this pass; several rounds still possible (see "Not
      Changed" above)
- [ ] 21. Testing — no automated test suite exists yet; this pass relied
      on manual verification (typecheck/lint/build/import/boot), not unit
      or integration tests
- [ ] 22. Docker / Final Review

## Security Note (carried forward — action still needed)

A previous update flagged that a live Supabase secret/service-role key was
exposed in an uploaded project. **Confirm this key has actually been
rotated** (Supabase dashboard → Project Settings → API) if that hasn't
already happened — this polish pass has no way to verify that from here.

## External / Account-Side Items Not Fixable From Code

These require access to your actual Google Cloud Console, Supabase
dashboard, Vercel project, and Render service — flagged here rather than
silently skipped:

- Confirm Supabase **Authentication → URL Configuration** (Site URL +
  Redirect URLs) lists your real deployed frontend URL, not just
  `localhost`.
- Confirm Google Cloud OAuth client's **Authorized JavaScript origins**
  includes that same URL.
- Confirm Render's `CORS_ORIGINS` env var is set to that URL (the new
  startup warning in `main.py` will now tell you loudly if it isn't, but
  can't fix it for you).
- Confirm the exposed Supabase secret key mentioned above was rotated.

## Verification Log (this pass)

- `pnpm install` (workspace root) — clean, 243 packages resolved
- `pnpm --filter @placeprep/shared typecheck` — 0 errors
- `pnpm --filter client typecheck` (`tsc -b --noEmit`) — 0 errors
- `pnpm --filter client lint` (oxlint) — 0 errors, 1 pre-existing warning
  (`main.tsx`, unrelated to this pass, matches prior sprint's log)
- `pnpm --filter client build` (`tsc -b && vite build`) — succeeds;
  477KB JS / 79KB CSS (gzip: ~140KB / ~37KB)
- `python -m py_compile` on every server `.py` file — clean
- `python -c "from app.main import app"` — imports cleanly, all 12 API
  routes + docs routes registered correctly
- `uvicorn app.main:app` + `curl /api/v1/health` — returns the expected
  `{success, message, data, errors}` envelope
- Production CORS misconfiguration warning — manually confirmed it fires
  when `ENVIRONMENT=production` and `CORS_ORIGINS` is left at default
- **Not run**: any test involving live Supabase/Gemini credentials, a real
  Google OAuth round-trip, or an actual Vercel/Render deployment — none of
  these are reachable from this environment. See "External / Account-Side
  Items" above.
