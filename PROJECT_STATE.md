# PlacePrep Project State

Last updated: 2026-07-05 (Sprint 4 Completion Pass)

## Process note on this pass (read this first)

Same methodology disclosure as the previous entry, because it's still true:
this was done by reading the project from source files shared in a chat
conversation, not a live clone of the actual deployed repo. New/changed
Python files were verified with `python -m py_compile` in a scratch
sandbox (syntax only — no live Supabase project, no installed
`supabase-py`/`fastapi` package set, so imports were not exercised). New/
changed TypeScript/React files were reviewed manually against the existing
type contracts in `shared/src/types`; they were **not** run through `tsc`
or `vite build`, because that requires the full `pnpm install` tree this
environment doesn't have. **Before merging, run the project's own
verification commands** (`pnpm --filter client typecheck`, `pnpm --filter
client build`, `pnpm --filter client lint`, `python -m py_compile` across
`server/`, and an actual `uvicorn` boot) exactly as the previous pass did,
and treat this file as superseded by whatever those commands report.

## What This Pass Was For

The previous ("Polish/Bug-Fix") pass explicitly scoped out anything that
touched Question Bank, Quiz, or Company data being on mock data — that was
correct at the time, but it also meant the platform's actual stated goal
(login → upload a PDF → see the extracted questions → practice them) did
not work end-to-end: the extraction pipeline wrote real rows to Postgres,
but nothing ever read them back out to the frontend. This pass closes that
gap and removes the fabricated numbers that were standing in for it.

## What Changed This Pass

**Critical — closes the core workflow:**
- **New `GET /api/v1/questions`** (`server/app/api/v1/endpoints/questions.py`)
  — the piece that was actually missing. Lists real extracted questions
  (options, topic/subject names, linked company id), non-admins only ever
  see `status == "approved"` (re-applying the RLS policy's intent, since
  the service-role client bypasses RLS by design).
- **New `GET /api/v1/companies` + `GET /api/v1/companies/{slug}`**
  (`server/app/api/v1/endpoints/companies.py`) — companies are already
  real rows (upserted by `classification.py`), there was just no read
  endpoint. `question_count` is computed live from `question_companies`
  rather than trusting the always-zero denormalized column.
- `client/src/hooks/use-questions.ts`, `use-companies.ts` (new) and
  **Question Bank, Quiz, Companies, Company Detail pages rewired** to
  these real endpoints instead of `mocks/questions.ts` /
  `mocks/companies.ts`. `QuestionCard` no longer looks up
  `mocks/companies.ts` by id — that lookup was silently failing anyway,
  since real question `companyId` values are DB UUIDs that never matched
  the mock file's `"company-amazon"`-style ids.
- `server/app/api/deps.py` — added a non-raising `is_admin` dependency
  alongside `require_admin`, so `/questions` can show pending-review rows
  to admins without needing a hard 403 for everyone else. Small refactor,
  no behavior change for the existing admin-only endpoints.

**Major — removing fabricated data (Part 3 of the brief):**
- `use-bookmarks.ts` no longer seeds from `mocks/bookmarks.ts` — it starts
  empty. Every user was previously shown 3 bookmarks they never made.
- Dashboard (`dashboard-page.tsx` + its widget components) no longer shows
  invented numbers:
  - `PracticeTrendChart` — was a hardcoded fake 7-day series; now an honest
    "not tracked yet" state (no attempt-history backend exists to chart).
  - `RecentActivityCard` — was a hardcoded fake feed (a scored quiz, a
    bookmark, a forum reply that never happened); now shows real recent
    notifications, reusing the already-real notifications backend.
  - `UpcomingCompaniesCard` — now reads real companies. Correctly empty
    right now, since nothing populates `upcoming_visit_date` yet — that's
    the honest state, not a bug.
  - `ContinuePracticeCard` — was a fake "resume quiz" card pointing at a
    quiz that was never started; now an honest CTA into the real question
    count.
  - Removed the "Today's challenge" block (hardcoded fake topic + fake
    question count + fake time estimate) and the "Wrong answers" /
    "Questions practiced" stat cards (both summed fake mock data with no
    real backend to replace them with yet — see Sprint 5 prerequisites).

**Minor / tech debt fixed opportunistically (Part 12 of the brief):**
- `server/app/core/config.py`, `server/.env.example`, `.env.example` (root)
  — default `GEMINI_MODEL` changed from `gemini-2.0-flash` to
  `gemini-2.5-flash`. Google deprecated the 2.0 Flash family in 2026
  (reported retirement dates range from March to June 2026 depending on
  source — it is gone either way); shipping the old default would have
  made the very first real extraction call fail with a 404/model-not-found
  once a key was added. **Verify the current recommended model name in
  Google AI Studio before your first real run** — Google has changed this
  more than once this year.

## Deliberately Not Changed (out of scope for this pass)

Per the brief's own instruction not to start Sprint 5 (Quiz Engine /
Learning Experience) until Sprint 4 is finished:

- **No Quiz Attempt backend.** `QuizRunner` still scores a quiz entirely
  client-side and nothing persists the result — "Quizzes completed" and
  "Questions practiced" honestly can't be real numbers until this exists.
  This is the single biggest remaining gap between "the demo works" and
  "the product tracks a student's real progress."
- **No Bookmarks backend**, same as the previous pass's note — the table +
  RLS exist, the endpoint doesn't.
- **Interview Experiences still has no backend.** `company-detail-page.tsx`
  now shows sample interview experiences (matched by company name against
  the old demo dataset) with an explicit "Sample data" label per Part 4 of
  the brief, instead of either fabricating real-looking submissions or
  silently dropping the tab.
- **`companies.upcoming_visit_date` / `average_package_lpa` /
  `experience_count`** have no write path anywhere in the app yet — they
  exist on the schema and in the API response, but will stay `null`/`0`
  for every company until an admin company-management feature is built.
- Calendar, Community, Settings, Wrong Answers, standalone Bookmarks pages
  are all still `ComingSoonPage` stubs — unchanged, all pre-existing.

## STOPPED — Needs Your Input: Gemini API Key

The pipeline code (`server/app/services/ai/gemini_provider.py`, `service.py`,
`pipeline.py`) was already complete before this pass and needed no changes.
It cannot run a real extraction without a `GEMINI_API_KEY`, which nobody
but you can provide. Full instructions were given in chat; short version:

1. Create a free key at **https://aistudio.google.com/app/apikey** (Google
   account, no credit card required for the free tier).
2. Put it in `server/.env` as `GEMINI_API_KEY=...` (never commit this file
   — it's already gitignored).
3. Set `GEMINI_MODEL=gemini-2.5-flash` (already the new default above) —
   confirm this is still current in AI Studio before your first run, since
   Google has changed both the free model lineup and its rate limits
   multiple times in 2026.
4. Restart the backend. `GET /api/v1/health` will report
   `ai_configured: true` once the key is picked up.

See the chat message for the full walkthrough (billing question, free-tier
caveats, official links).

## Milestones (updated from the 22-milestone roadmap)

- [x] 1–8. (unchanged, already complete)
- [~] 9. AI Extraction — pipeline code complete and verified importable;
      **blocked on a real `GEMINI_API_KEY`** for an actual end-to-end run
- [x] 10. Question Management — **Question Bank now reads real data** via
      the new `/questions` endpoint (was mock)
- [x] 11. Quiz Engine (question sourcing) — Quiz page now pulls its pool
      from real data (was mock). Attempt persistence/scoring history is
      still not backed by a database — see Sprint 5 prerequisites.
- [~] 12. Quiz Attempt — client-side scoring only, nothing persisted
- [ ] 13. Wrong Answer Notebook — unchanged, no backend
- [ ] 14. Bookmarks (standalone page) — unchanged, no backend (in-memory
      hook fixed to stop pre-seeding fake data, see above)
- [~] 15. Interview Experiences — unchanged (no backend); detail page now
      clearly labels the sample data instead of mixing it in silently
- [x] 16. Company Pages — **now reads real data** via the new
      `/companies` endpoint (was mock)
- [ ] 17. Search (global/unified) — unchanged
- [x] 18. Dashboard — fabricated stats/activity/trend/companies/practice
      widgets replaced with real data or honest empty states
- [x] 19. Notifications — unchanged, already real
- [x] 20. Polish — this pass plus the previous one
- [ ] 21. Testing — still no automated test suite
- [ ] 22. Docker / Final Review — unchanged

## Sprint 5 Prerequisites (what needs to exist before Quiz Engine /
Learning Experience work can start for real)

1. **Quiz Attempt backend** — a `quiz_attempts` + `quiz_responses` table
   (or equivalent), a `POST /api/v1/quizzes/attempts` endpoint to record a
   completed run, and a `GET` to list a user's history. This unblocks real
   "Quizzes completed", "Questions practiced", the practice trend chart,
   and a real Wrong Answer Notebook (which is just attempts filtered to
   `isCorrect: false`).
2. **Bookmarks backend** — `POST/DELETE /api/v1/bookmarks`,
   `GET /api/v1/bookmarks`, wired into `use-bookmarks.ts` in place of the
   in-memory `Set`. Table + RLS already exist (migration 0002).
3. **Interview Experiences backend** — table exists conceptually in the
   roadmap but has no migration yet; needs schema + CRUD + moderation
   status handling (mirroring the `questions.status` pattern already used
   elsewhere) before the sample-data label on the company page can come
   off.
4. **Confirm the Gemini model/quota picture in AI Studio** before relying
   on the pipeline for a real demo — this has changed several times in
   2026 and the numbers documented anywhere (including this file) go
   stale fast.
5. Re-run this project's own verification suite (`pnpm` typecheck/lint/
   build, `python -m py_compile`, `uvicorn` boot + `/health`) against the
   actual repository, since this pass could only verify Python syntax and
   manual TS review from the shared snapshot — see the process note above.

## Security Note (carried forward — action still needed)

Unchanged from the previous entry: confirm the previously-flagged exposed
Supabase secret/service-role key has actually been rotated (Supabase
dashboard → Project Settings → API). This pass has no way to verify that
from here.
