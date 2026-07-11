# PlacePrep Project State

Last updated: 2026-07-11 (Sprint 1A frontend integration pass)

## This pass, in one paragraph

A second, independent frontend session ("Sprint 1A" -- command palette,
Notifications page, mobile quiz-palette bottom sheet, `useDialogA11y`
shared hook) arrived as a separate 13-file `client/`-only branch and was
integrated into this repository. Three files (`mobile-nav.tsx`,
`quiz-runner.tsx`, `index.css`) had a real overlap with the earlier
Part 1 UI/UX pass below and were hand-merged rather than either version
being taken wholesale -- both sessions' work is fully preserved with
nothing silently dropped. Full detail, including exactly what was
hand-merged and why, is in `MERGE_NOTES.md`'s "Part 3" section.
`shared/` and `server/` were not touched by this pass; everything below
about Phase 6 and prior passes is unchanged and still accurate.

**Correction to a prior entry:** the "Milestones" section below has long
marked "Notifications" as done, which was true only for the `TopNav`
bell-icon dropdown (`notification-center.tsx`) -- the standalone
`/notifications` page this implies existed did not; it 404'd to
`ComingSoonPage` until this pass added the real page. Noted here rather
than quietly rewriting the historical milestone entry.

## Process note on the earlier pass (read this first)

This pass had two parts. First, a separate session's frontend UI/UX polish
pass (10 files, `client/src/` only) was merged in and independently
verified -- see this repo's `MERGE_NOTES.md` for that verification table.
Second, a large "multi-agent development contract" arrived asking for a
full Phase 5/6 backend rewrite, a security audit, and roughly ten
additional report documents in the same pass.

**What I actually did, honestly:** I did not attempt to re-verify or
rebuild the Phase 5 backend that a prior pass already completed and
documented (Question Bank, Quiz Engine, Quiz Attempts, Wrong Answer
Notebook, Bookmarks, Analytics, Admin Review approve/reject/edit/delete --
all already real per this file's own prior entries, and unchanged in this
pass except where noted below). Instead I focused on the concrete gaps
this file itself had already flagged as **not built**, plus a small number
of *confirmed* bugs -- confirmed by actually reproducing them, not assumed
off a checklist:

1. **Multi-format upload** (PNG/JPG/JPEG, phone photos, screenshots) --
   previously PDF-only.
2. **Daily Challenge backend** -- explicitly scoped out of the Phase 5
   pass ("Deliberately Not Built") for good, specific reasons that are
   now addressed.
3. **Admin Review "Merge"** -- also explicitly scoped out of Phase 5.
4. **Global search** -- milestone 17, never started.
5. **Real server-side pagination** on `/questions` and `/pdfs` -- the
   shared `PaginationParams`/`PaginatedResult` types existed since Sprint
   3 and were never actually used by these two endpoints.
6. A confirmed N+1 + read-modify-write race condition in quiz submission.
7. A confirmed SPA-routing bug (`vercel.json` had no rewrite rule).
8. Basic rate limiting -- previously entirely absent.
9. A live-status SSE endpoint (backend half of a UI/UX pass
   recommendation).
10. A server-aggregated quiz trend endpoint (same).

**What I did NOT do:** fabricate ten audit-style report documents with no
verified work behind them, rewrite anything in `client/`, touch Interview
Experiences/Community/Calendar (still explicitly out of scope per this
file's own prior passes), or claim "production-ready" without a live
Supabase/Gemini project to actually run against -- see "What could not be
verified" below for the honest boundary of what a sandboxed session can
and can't confirm.

## How this pass was verified (real, not asserted)

Unlike a purely static read-through, this pass:

- Rebuilt the full workspace (`client/` + `shared/` + `server/`) in a
  sandboxed container and ran the real toolchain: `pnpm install`,
  `pnpm --filter @placeprep/shared typecheck`, `pnpm --filter client
  typecheck` (`tsc -b --noEmit`), `pnpm --filter client lint` (oxlint),
  `pnpm --filter client build` (production Vite build) -- **all pass,
  zero errors**, one pre-existing unrelated lint warning carried forward
  unchanged (`main.tsx`'s `RouterShell` fast-refresh warning).
- Installed the full Python `requirements.txt` (including the new
  `slowapi` dependency) into a real venv, imported `app.main`, listed
  every one of the **40 registered routes**, and hit `/api/v1/health` and
  `/` through Starlette's `TestClient` -- **boots and responds correctly**.
  `.venv/bin/python -m py_compile` across all 42 server `.py` files --
  **compiles cleanly**.
- **Installed a real, throwaway PostgreSQL 16 instance** (via `apt-get`,
  not a mock) and ran **all six migrations, 0001 through 0006, in
  sequence, for real** -- not just read them for syntax. A minimal
  `auth`/`storage` schema shim stood in for the pieces of Supabase's
  platform Postgres these migrations assume exist but don't create
  themselves (documented in the shim file itself); every migration this
  repo has ever shipped ran cleanly against it.
- **Functionally tested the new `bulk_increment_question_stats()` Postgres
  function** with real fixture data and real SQL calls: confirmed correct
  increments across multiple calls on the same row (the exact scenario
  the old code could race on), and confirmed a skipped response correctly
  does *not* increment `times_attempted`.
- **Confirmed the new schema** for real: `pdf_resources.file_kind` exists
  with the right default, `daily_challenge_progress` /
  `daily_challenge_streaks` exist with RLS enabled, the new trigram search
  indexes exist, and the `unique(user_id, challenge_date)` constraint on
  `daily_challenge_progress` genuinely rejects a duplicate-day insert.
- **Ran a real, end-to-end OCR test** of the new direct-image-upload path:
  a synthetic image containing rendered question text ("What is the
  capital of France? A) Berlin B) Paris C) Madrid D) Rome") was fed
  through `image_text.extract_text_from_image()` against a real Tesseract
  binary present in the build sandbox, and correctly OCR'd back both the
  question and every option. Also confirmed the two failure paths (a
  blank image with genuinely no text; corrupted/non-image bytes) fail with
  clear, distinct error messages instead of crashing.
- **Unit-tested the new Daily Challenge streak algorithm** against a
  lightweight fake Supabase client: consecutive-day increment, same-day
  idempotency (a retried request can't inflate a streak), gap-triggered
  reset, and `longest_streak` correctly preserved across a reset and then
  correctly overtaken on a later climb -- five scenarios, all correct.
- Re-ran the *unchanged* Sprint 4 pure-logic modules (`chunking`,
  `answer_key`, `duplicate.compute_content_hash`) as a regression check --
  still correct.
- Confirmed the schema-level constraints (`bookmarks`'
  `unique(user_id, target_type, target_id)`, `wrong_answer_marks`' primary
  key `(user_id, question_id)`) that the new Merge tooling's
  conflict-avoidance logic depends on actually exist in the real,
  migrated database.

## What could NOT be verified (said plainly, not buried)

- **No live Supabase project.** Every query in every endpoint is written
  against the real schema and, where reasonably testable, against a real
  Postgres instance running that exact schema -- but Supabase's actual
  PostgREST layer, its real RLS enforcement under a real JWT's `auth.uid()`,
  and its real Storage API were not available in this sandbox. The `auth`/
  `storage` shim used for migration testing is explicitly a stand-in, not
  a claim of full-stack verification.
- **No live Gemini API key.** The prompt change to `gemini_provider.py`
  (a couple of sentences acknowledging photographed/scanned input, and
  "use page 1 for a single image") was not run against the real API.
- **`bulk_increment_question_stats()`'s atomicity under real concurrency**
  was verified for *correctness of the increment math*, not for actual
  concurrent-transaction race resistance (that would need two real
  simultaneous connections deliberately racing each other, which is
  possible but wasn't run this pass) -- the atomicity claim rests on the
  well-established Postgres guarantee that a single `UPDATE` statement is
  atomic per row, not on an isolation-level stress test performed here.
- **Merge's `quiz_attempts`/`bookmarks`/`wrong_answer_marks` reassignment
  logic** (`app/services/question_merge.py`) was reviewed carefully and
  its conflict-avoidance depends on constraints confirmed to exist (see
  above), but wasn't run end-to-end against live data with real conflicting
  rows -- flagged as the next thing to smoke-test against a Supabase
  staging project before this ships, same honesty standard the Phase 5
  pass held itself to for OCR/chunking.
- **The rate limiter's actual behavior under load** -- confirmed it's
  wired correctly (imports, decorators, exception handler all present and
  the app boots with it enabled) but a real 429-after-N-requests load test
  wasn't run.

## Backend changes this pass (Phase 6)

### 1. Multi-format upload (PDF + PNG/JPG/JPEG)

- `pdf_resources.file_kind` (`'pdf' | 'image'`, migration 0006) tells
  `services/pipeline.py` which extraction path to use.
- New `services/image_text.py`: OCR-only extraction for a standalone
  image (no native-text-layer attempt first, unlike a PDF -- an image
  never has one). Reuses `services/ocr.py`'s Tesseract engine via a new
  `ocr_image_bytes()` function.
- `POST /pdfs/upload` accepts `image/png`, `image/jpeg`, `image/jpg` in
  addition to `application/pdf`, with a separate (smaller, 15MB default)
  size cap via `MAX_IMAGE_SIZE_BYTES`.
- `shared/file-upload.ts` gained `IMAGE_UPLOAD_CONSTRAINTS` and a combined
  `UPLOAD_CONSTRAINTS` -- **the frontend dropzone's `accept` attribute
  still needs loosening to actually let a user pick an image in their file
  browser; that one-line frontend change is intentionally left to
  whichever session owns `client/`**, flagged in
  `FUNCTIONAL_RECOMMENDATIONS.md`.

### 2. Global search (`GET /search?q=`)

Searches questions (respecting the same approved-only visibility rule as
`GET /questions`), companies, and PDFs. New trigram indexes on
`companies.name` and `pdf_resources.file_name`/`title` (migration 0006)
keep it index-assisted as data grows. Interview Experiences deliberately
excluded -- there's still no real backend for them.

### 3. Daily Challenge (`GET /daily-challenge/today`, `POST .../complete`,
`GET /daily-challenge/streak`)

Weak-topic-weighted question selection (reuses Analytics' own "weak
topic" definition: >=3 answered questions, lowest accuracy first) with a
random fallback for new users with no history yet. Real streak tracking
with UTC-day granularity -- see the endpoint module's own docstring for
the honest timezone caveat (a student's local "today" can differ from the
UTC day this uses by several hours near midnight). Verified per "How this
pass was verified" above.

### 4. Admin Review "Merge" (`POST /questions/{canonical_id}/merge`)

Combines `times_attempted`/`times_correct` onto the canonical question,
reassigns every `quiz_attempts.question_ids`/`.responses` reference,
reassigns bookmarks and wrong-answer marks (with real conflict handling
where a user has both the canonical and duplicate already bookmarked/
marked -- see `services/question_merge.py`'s module docstring), then
deletes the duplicate (cascading its own options/topic/company links).

### 5. Real pagination

`GET /questions` and `GET /pdfs` now take `page`/`pageSize` and return a
DB-backed `total` (via a `count="exact"` query mirroring the same
server-side filters) instead of a flat `limit`. Honest caveat documented
in `questions.py`'s module docstring: `company_id`/`subject` filters still
can't be pushed into the DB query in this embed shape, so `total` only
reflects the current page when either is set -- not silently pretended
away.

### 6. Fixed: N+1 + race condition in quiz submission

`submit_attempt` previously did a SELECT-then-UPDATE per response for
`times_attempted`/`times_correct` (up to N round trips, and a genuine
read-modify-write race between two near-simultaneous submissions touching
the same question) plus a similar pattern for `wrong_answer_marks`. Fixed
via a new atomic `bulk_increment_question_stats()` Postgres function
(one round trip for the whole quiz) and a batched multi-row `.upsert()`
for wrong-answer marks. Verified for real -- see above.

### 7. Fixed: SPA refresh 404 (`vercel.json`)

Confirmed by inspection: the original `vercel.json` had no
`rewrites`/fallback rule, so Vercel's static hosting 404s on any direct
navigation or browser refresh to a client-side route (`/questions`,
`/pdfs`, etc.) because it looks for a literal file at that path. Standard
SPA catch-all rewrite added.

### 8. Rate limiting

`slowapi`-based, per-IP, in-memory (single-instance-correct; see
`server/README.md` for the horizontal-scaling caveat and the Redis
swap-over path). Stricter limits on `/pdfs/upload` and quiz submission.

### 9. Live processing status (`GET /pdfs/{id}/status-stream`, SSE) and
server-aggregated quiz trend (`GET /quizzes/trend`)

Backend halves of two items from the UI/UX pass's own
`FUNCTIONAL_RECOMMENDATIONS.md`. Frontend switch-over (from the existing
3-second poll and from `PracticeTrendChart`'s client-side aggregation)
intentionally left to whichever session owns `client/` -- same
boundary this project has used throughout.

## Bugs investigated from the "verify before fixing" list

Per this project's own long-standing practice (see prior passes'
"verified, not assumed" notes), everything on the incoming bug list was
checked, not blindly patched:

| Item | Finding |
|---|---|
| Refresh returns 404 | **Confirmed, fixed.** Missing `vercel.json` rewrite -- see above. |
| N+1 queries | **Confirmed, fixed.** `quizzes.py` submit_attempt -- see above. |
| SQL injection | **Checked, not present.** Every query in the codebase goes through the Supabase/postgrest query builder (parameterized); grepped for raw string-interpolated SQL, found none. The one place raw SQL exists is inside migration files (DDL/functions), which aren't attacker-reachable. |
| XSS | **Checked, not present.** No `dangerouslySetInnerHTML` usage found anywhere in `client/src`; React escapes all rendered text by default. |
| Rate limiting | **Confirmed absent, added.** See above. |
| Session persistence, RBAC, JWT validation | **Unchanged, already real** (Supabase-session-based, `require_admin`/`is_admin` fetch the role fresh per request rather than trusting a JWT claim) -- reviewed, no issues found, no changes made. |
| Upload processing animation | Addressed in the separate frontend UI/UX pass merged earlier this same session (indeterminate progress bar, fixed drag-counter flicker) -- see `MERGE_NOTES.md`. |
| Duplicate uploads / AI confidence scoring / database consistency | **Unchanged, already real** from the Phase 5 pass (exact-hash + fuzzy-similarity duplicate detection, confidence-gated classification) -- reviewed, no new issues found. |
| Memory leaks | Not investigated this pass -- would need a running instance under load to meaningfully profile, which wasn't available. Flagged as unverified, not claimed clean. |

## Phase 6 Modules -- status

- **[x] Multi-format upload** -- built, end-to-end OCR-verified (see above).
- **[x] Global search** -- built (questions/companies/PDFs).
- **[x] Daily Challenge** -- built, streak logic unit-tested.
- **[x] Admin Merge** -- built, schema dependencies confirmed; not yet
  run against live conflicting data (see "What could NOT be verified").
- **[x] Real pagination** (`/questions`, `/pdfs`) -- built.
- **[x] Quiz submission N+1/race fix** -- built, functionally verified
  against a real Postgres function call.
- **[x] SPA refresh-404 fix** -- built.
- **[x] Basic rate limiting** -- built, wiring confirmed; load behavior
  not tested.
- **[x] Live status SSE endpoint** (backend half) -- built.
- **[x] Server-aggregated quiz trend endpoint** (backend half) -- built.
- **[ ] Interview Experiences / Community / Placement Calendar backends**
  -- still not started, still explicitly out of scope for this pass
  (unchanged from every prior pass's own scoping decision).
- **[ ] Checked-in automated test suite** -- still not present. This
  pass's verification (real migration runs, real RPC calls, real OCR,
  unit-tested pure logic) is real but ad hoc, same honest caveat every
  prior pass in this file has carried.

## Milestones (updated)

- [x] 1-16. (unchanged, already complete per prior passes)
- [x] 17. **Global search -- backend built Phase 6; frontend command
      palette wired this pass** (searches client-cached data, not yet the
      `GET /search` endpoint directly -- see `MERGE_NOTES.md` Part 3)
- [x] 18-20. Dashboard / Notifications / Analytics -- Notifications
      dropdown unchanged, already real; **standalone `/notifications`
      page built this pass** (previously `ComingSoonPage`, see correction
      above)
- [x] 21. Admin Review -- **Merge now built this pass**, closing the one
      gap the Phase 5 pass left open
- [x] 22. **Daily Challenge -- built this pass** (previously not built)
- [ ] 23. Testing -- still no checked-in automated suite (see above)
- [ ] 24. Docker / Final Review -- unchanged

## Remaining work for Phase 7

1. **Run migration 0006 against the real Supabase project**, alongside
   confirming 0001-0005 are already applied, before deploying this
   version of the backend.
2. **Smoke-test Admin Merge against real conflicting data** on a staging
   project (a user who's bookmarked/wrong-answered both the canonical and
   duplicate question) -- the logic is real and its constraint
   dependencies are confirmed, but it hasn't seen live conflict data yet.
3. **Frontend switch-over** for the two SSE/trend endpoints, and loosening
   the upload dropzone's `accept` attribute to actually let users pick an
   image -- all three are one small, well-scoped frontend change each,
   listed in `FUNCTIONAL_RECOMMENDATIONS.md`.
4. **Interview Experiences backend**, **Community**, **Placement
   Calendar** -- unchanged scope from every prior pass.
5. **A real automated test suite** -- still the most consequential
   remaining gap; the scoring-recomputation logic in `quizzes.py` and the
   new merge logic in `question_merge.py` are exactly the kind of code a
   regression could silently break without one.
6. **Rate limiter load testing** and, if deploying more than one backend
   instance, switching `RATE_LIMIT_STORAGE_URI` to Redis.
7. **Wire the command palette to `GET /search`** instead of client-cached
   React Query data (see `MERGE_NOTES.md` Part 3) -- fine at current data
   volume, but the palette can't find anything outside whatever page of
   questions/PDFs is already loaded.

## Security note (carried forward -- action still needed)

Unchanged from previous entries: confirm the previously-flagged exposed
Supabase secret/service-role key has actually been rotated (Supabase
dashboard -> Project Settings -> API). This pass has no way to verify
that from here.
