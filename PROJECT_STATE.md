# PlacePrep Project State

Last updated: 2026-07-12 (Admin Portal Expansion -- Module 1: Dashboard + Users & Roles)

## This pass, in one paragraph

Sprint 1A cleanup (dead mock files, orphaned `tooltip`/`section-header`
primitives, one unused dependency -- see `MERGE_NOTES.md`) was followed by
a full admin-functionality audit before writing anything: read every
endpoint module, every admin-gated frontend surface, and the schema, to
find out what genuinely existed versus what the original module list
assumed existed. Result: Question moderation, upload approval, the AI/OCR/
processing queue with retry, Calendar management, and Interview Experience
moderation were all already complete (just scattered across admin-only
tabs on otherwise-shared pages, with zero central landing page). User
management and role changes did not exist at all -- promoting/demoting a
user meant editing `role_id` directly in the Supabase table editor. This
pass built the first Admin Portal module: a real `/admin` dashboard
(queue-status stat cards linking out to each existing tool) plus full
User & Role management (search, filter, paginate, promote/demote), and
nothing else -- audit trails, storage/AI usage, and persisted error logs
are separate future passes, not squeezed into this one.

## Admin Portal Expansion -- Module 1 detail

**New backend module**, `server/app/api/v1/endpoints/admin.py`, mounted at
`/admin` (3 routes, `require_admin`-gated, no schema migration needed --
reuses `profiles`/`role_id` as-is):
- `GET /admin/dashboard-summary` -- counts mirrored from each existing
  table (`pdf_resources`, `questions`, `interview_experiences`,
  `processing_jobs`, `interview_experience_reports`, `profiles`), same
  count-per-status query style as `processing.py`'s existing dashboard.
- `GET /admin/users` -- paginated, `search` (ilike on name/email),
  `role` filter. Same `page`/`page_size`/`count="exact"` pattern as
  `pdfs.py`/`questions.py`.
- `PATCH /admin/users/{id}/role` -- validates the target role, blocks an
  admin from changing their own role (self-lockout guard), updates
  `role_id`.

**New frontend:** `admin-dashboard-page.tsx` (stat cards + searchable/
filterable/paginated user table with a role-change dropdown) and
`use-admin.ts` (mirrors `use-processing.ts`/`use-pdfs.ts` hook shape).
Reuses the existing `Profile`/`UserRole` shared types directly for the
user list rather than introducing a parallel type. Wired into
`router.tsx` as `/admin` and into `nav-items.ts` as "Dashboard" above the
existing "Review Queue" entry, following the same "not gated at the route
level, backend + nav enforce it" pattern already used for `/admin/review`.

**Deliberately not built this pass** (see the audit's missing-functionality
list for the reasoning): audit trail for role changes, storage usage,
AI/token usage tracking, persisted queryable error logs (today's
unhandled-exception logging is stdout-only), and Community moderation
(blocked on the Community module itself not existing yet -- it's still a
`ComingSoonPage` stub).

**Verified:** `pnpm typecheck` (shared + client), `pnpm lint` (oxlint,
0 errors, same 1 pre-existing `main.tsx` fast-refresh warning as before),
`pnpm build`, `ruff check`, and a live Python import of `app.main` confirming
all 3 new routes register (57 total routes, up from 54).

## Phase 9 detail (previous pass)


**Schema** (migration `0009`, four new tables): `interview_experiences`
(the submission), `interview_experience_rounds` (structured round-by-round
breakdown, one row per round), `interview_experience_votes` (Helpful/Not
Helpful, one row per user per experience, toggle semantics), and
`interview_experience_reports` (Report Experience, one per user per
experience). RLS on all four, matching the API layer's own visibility
rules rather than looser (approved-or-own-or-admin for select; admin-only
for status/edit/delete; own-row-only for votes/reports).

**Deliberate reuse instead of a parallel system:** "Bookmarks" uses the
*existing* generic `bookmarks` table (`target_type: 'interview-experience'`)
-- there's no bookmark endpoint in the new `interview_experiences.py` file
at all; `bookmarks.py` (built in Module 5) already handles it, and the
frontend's existing `useBookmarks()` hook needed zero changes to support
this content type.

**Field consolidation, done deliberately and stated here rather than
silently:** the brief listed several near-duplicate free-text fields
("Preparation Tips" / "Overall Advice" -> just `overallTips`, already
in the pre-existing type; "Aptitude Topics" / "Important Concepts" ->
one `keyTopics: string[]` tag list; "Questions Asked" / "Coding
Questions" / "Technical Questions" -> folded into each round's own
`description`, which is what a per-round description is for). Adding
three more overlapping text fields on top of `overallTips`/`keyTopics`/
rounds would have made the submission form worse, not more complete.

**Anonymity, implemented as real accountability rather than a fake
toggle:** `author_id` is always stored on the row. The API redacts it to
`null` in every response for an `is_anonymous` submission *unless* the
requester is the author or an admin -- verified directly (`_row_to_response`
tested against a stranger, the owner, and an admin viewing the same
anonymous row: stranger and non-owner get `null`, owner and admin see the
real id). This is deliberately different from "nobody can ever know who
posted this," which would make abuse/moderation impossible.

**Backend** (`server/app/api/v1/endpoints/interview_experiences.py`, new,
8 routes): list (with company/role/difficulty/year/department/round-type/
package-range filters, plus a `status` filter for admins working the
moderation queue), get one, create (any authenticated user, always starts
`pending-review`), admin status update (approve/reject with reason),
admin edit (including wholesale round-list replacement and `is_pinned`),
admin delete, vote (toggle, counts always computed fresh from the votes
table rather than a denormalized counter -- no drift to worry about), and
report. Verified: full backend import, `app.main` boots with all 8 routes
correctly wired, `ruff check` clean across the whole `app/` tree, and a
direct functional test of the anonymity redaction logic against three
different viewers of the same row (above) plus the create-request
validation.

**Explicitly NOT implemented, with the actual reasoning (not just a
checklist gap):** admin "Merge" for interview experiences. `questions.py`'s
merge has one clear, mechanical, structural target: re-pointing
`quiz_attempts`/`bookmarks`/`wrong_answer_marks` between two rows of
identical shape. A real interview-experience merge would need editorial
judgment about which rounds, tips, and author to keep across two
free-form personal accounts -- that's a distinct, later feature, not a
find-and-replace of the question version, and attempting a rushed copy
here risked shipping something worse than not having it at all.

**Frontend:**
  - `hooks/use-interview-experiences.ts` (new) -- list (with filters),
    detail, create, admin status/edit/delete, vote, report.
  - `pages/interview-experiences-page.tsx` (new) -- filterable list,
    expandable cards (round breakdown, tips, key topics, resources,
    notes), a submission form (react-hook-form + zod, dynamic round
    list via `useFieldArray`, prefilled from the user's own profile
    college/department/year), inline admin moderation (approve/reject
    with reason/edit/pin/delete), and a real empty state.
  - `company-detail-page.tsx`'s "Interview Experiences" tab -- previously
    showed explicitly-labeled sample data matched by name against a demo
    dataset (an honest placeholder, not fabricated data, but a
    placeholder nonetheless) -- now calls the real API filtered to that
    company and reuses the same `ExperienceCard`/`SubmissionDialog`
    components from the main page (exported for reuse rather than
    duplicated).
  - `router.tsx`'s `/experiences` route now renders the real page instead
    of `<ComingSoonPage title="Interview Experiences">`.
  - Deleted `mocks/interview-experiences.ts` and `mocks/companies.ts` --
    confirmed (grepped) every remaining reference to either was a code
    comment, not an import, before removing them.
  - Verified: `pnpm --filter client typecheck`, `lint` (oxlint, 0 errors),
    and `build` all clean.


## Phase 8 detail

**Schema** (migration `0008`): extended `calendar_events` with `role`,
`package_lpa`, `eligibility`, `registration_deadline`, `venue`,
`is_online`, `application_link`, `attachment_url`, and `status`
(`upcoming`/`ongoing`/`completed`/`cancelled`, default `upcoming`), plus
`updated_at` with a trigger reusing the existing `set_updated_at()`
function. No RLS changes needed -- the Sprint 3 policies already matched
the brief's access model exactly.

**Scoping note, stated honestly:** the brief asks for "Admins and
Placement Coordinators" to have write access. There is no "Placement
Coordinator" role in this system (`roles` only has student/alumni/admin)
-- adding a fourth role is a bigger identity-platform change than this
pass, so admin-only write access is what's actually implemented (which is
also all the existing RLS policy enforces). Noted here rather than
silently treating "admin" as a stand-in without saying so.

**Backend** (`server/app/api/v1/endpoints/calendar.py`, new):
  - `GET /calendar` -- open to any authenticated user; filters by
    `company_id`, `status`, and `month` (`YYYY-MM`).
  - `POST /calendar`, `PATCH /calendar/{id}`, `DELETE /calendar/{id}` --
    all admin-only (`require_admin`). Reschedule and cancel are both just
    the same `PATCH` (reschedule = new `startAt`/`endAt`, cancel =
    `{"status": "cancelled"}`) rather than separate endpoints, since a
    partial update already covers both.
  - Verified: full backend import, `app.main` boots with all 4 new routes
    correctly wired, `ruff check` clean, and a direct functional test of
    the Pydantic request/response models -- confirmed camelCase JSON in
    (`packageLpa`, `registrationDeadline`, etc.) validates and converts to
    snake_case for the DB insert, invalid `type`/`status` enum values are
    correctly rejected, `exclude_unset` partial-update semantics work for
    the cancel-via-status-only case, and DB rows convert back to camelCase
    for the frontend correctly.

**Frontend:**
  - `hooks/use-calendar.ts` (new) -- `usePlacementEvents` (with
    company/status/month filters), `useCreatePlacementEvent`,
    `useUpdatePlacementEvent`, `useDeletePlacementEvent`.
  - `pages/placement-calendar-page.tsx` (new) -- all three requested view
    modes (List grouped by upcoming/past, Calendar as a real month grid
    with day-click-through, Timeline grouped by month), an admin
    create/edit dialog (react-hook-form + zod, matching the existing
    `quiz-config-form.tsx` convention) covering every field the brief
    asked for, and a real empty state when no events exist yet
    (distinct copy for admins vs. students).
  - `router.tsx`'s `/calendar` route now renders the real page instead of
    `<ComingSoonPage title="Placement Calendar">`.
  - Deleted `mocks/calendar-events.ts` -- confirmed (grepped) nothing
    else referenced it once the real page shipped, so this is an actual
    verified removal, not an assumed-safe one.
  - Verified: `pnpm --filter client typecheck`, `lint` (oxlint, 0
    errors), and `build` all clean.

**Explicitly not done in this pass:** a fourth "Placement Coordinator"
role (see scoping note above), a background job to auto-transition
`status` from `upcoming` -> `ongoing` -> `completed` as dates pass (it's a
plain column an admin sets manually via the status field in the edit
dialog for now), multi-file attachments (one `attachment_url` field, not
a subsystem), and any notification fan-out on event create/update -- the
brief listed "future notification support" as explicitly future, so it
wasn't built now; `notifications.notify_admins()` from Phase 7 shows the
plumbing is there if/when this is prioritized.


## Phase 7 detail

**Critical Issue 1, root-caused (not guessed) to four separate confirmed
bugs, all fixed:**

1. `services/answer_key.py` rejected the *entire* answer-key section
   outright once it exceeded a fixed 6,000-character budget -- a real
   solutions section for 40+ questions routinely exceeds that, so every
   chunk sent to Gemini had zero answer-key context. Replaced the
   length-based cutoff with a shape-based check (does the candidate text
   actually contain a plausible density of "12. B"-style entries?) with a
   much larger sanity ceiling (40,000 chars) instead of a real gate.
   Verified against a large synthetic key, a false-header-in-prose case,
   a grid-style key, and a no-key case -- all four behave correctly.
2. `services/pdf_text.py`'s OCR trigger averaged `chars_per_page` across
   the WHOLE document -- a document with dense native-text question pages
   and a few scanned/photographed solution pages averages out fine, so
   OCR never ran on those specific pages and their content silently
   vanished (empty-text pages are dropped from `full_text` with no
   trace). Added a per-page low-quality signal
   (`ExtractionResult.low_quality_page_numbers`) and a new
   `services/ocr.py:ocr_pdf_pages()` that OCRs *just* those pages and
   splices the result back into the correct position
   (`services/pipeline.py:_extract_document_text`), instead of an
   all-or-nothing whole-document decision.
3. `services/pipeline.py`'s main extraction loop caught `AIProviderError`
   per chunk and silently `continue`d -- if every chunk's Gemini call
   failed (bad key, quota, safety-filtered content, deprecated model,
   non-JSON output surviving the retry), the job still finished as
   `completed` with 0 questions and a misleading "no questions were
   found" message, with the real cause visible only in server logs. Now
   tracks `failed_chunk_count` separately, raises a real failure when
   *all* chunks fail (surfacing the actual underlying error into the
   Failed/Retry queue), and reports partial chunk failures in the
   completion notification instead of staying silent about them.
4. Found *while verifying fix #2*, not assumed upfront:
   `services/ocr.py`'s `image_to_string()` calls all used Tesseract's
   default page-segmentation mode (PSM 3, "fully automatic"), which is
   tuned for multi-region newspaper-style layouts. On a page that's
   mostly a short numbered list -- an answer key almost exactly --
   PSM 3 badly garbles the text (verified: a real test page came out as
   `"CON AnRWNe\nDBrunmwraoednwa..."`). `--psm 6` ("assume a single
   uniform block of text") fixed this completely in the same test while
   performing identically well on ordinary dense paragraph-style scanned
   question text (verified against both shapes before applying it
   everywhere OCR runs). This was the fix that made the end-to-end test
   below actually pass.

**End-to-end verification, not just unit-level:** built two synthetic
mixed PDFs (reportlab-generated native-text question pages + a
Pillow-rendered scanned answer-key page baked into an image, one with a
deliberately low-quality bitmap font, one with a realistic
truetype-rendered scan) and ran them through the real
`_extract_document_text` -> `split_answer_key` chain with actual
Tesseract/poppler (both installed and available in this environment). The
realistic-quality synthetic scan round-trips correctly end to end: mixed
page detected despite a healthy whole-document average, targeted OCR
recovers clean answer-key text, and it's correctly detected and split out
for the AI prompt -- while question content from the native-text pages is
preserved. The deliberately-low-quality bitmap-font scan still doesn't
fully recover, which is an honest limit of OCR on genuinely poor source
images, not something a segmentation-mode or prompt change can fix.

**Upload approval workflow** (the other confirmed gap -- `upload_pdf`
previously queued the Gemini pipeline immediately on any authenticated
upload with no human review):
  - New `pdf_resources` states: `pending-approval` (default on upload,
    replacing the immediate `queued`) and `rejected`, plus
    `reviewed_by`/`reviewed_at`/`rejection_reason` columns
    (migration `0007`).
  - `POST /pdfs/{id}/approve` (admin-only) is now the *only* path that
    creates a processing job and starts extraction. `POST
    /pdfs/{id}/reject` (admin-only, requires a reason) marks it rejected
    and notifies the uploader. Both are new; `upload_pdf` itself no
    longer touches `pipeline.create_job`/`run_pipeline` at all.
  - `notify_admins()` added to `services/notifications.py` (broadcasts to
    every `role_id = 3` profile) so admins get notified when something
    needs review, rather than having to poll the library.
  - `GET /pdfs` gained an optional `status` filter so the admin UI can
    query the pending-approval queue directly.
  - Frontend: a new "Pending Approval" tab (now the default tab for
    admins in the PDF Library) with Approve / Reject-with-reason actions,
    new `useApprovePdf`/`useRejectPdf` hooks, updated upload
    copy/messaging, and status-pill config for the two new statuses in
    both `pdf-library-page.tsx` and `recent-pdfs-card.tsx` (the latter
    was only caught by actually running `tsc -b` -- it has its own
    parallel status-config record that the type-checker correctly flagged
    as no longer exhaustive once `PdfProcessingStatus` gained members).

**Also fixed while in this code, using a previously-vestigial setting for
real:** `MAX_EXTRACTION_ATTEMPTS` existed in `config.py` but was never
actually checked anywhere -- every manual retry created a fresh
`processing_jobs` row with no ceiling. `retry_pdf` now counts prior
attempts for the PDF and refuses further retries past the configured max,
directing the uploader/admin to a direct admin review instead.

**Verification performed (all real, all reproduced in this pass, not
assumed):**
  - `answer_key.py` unit-level behavior against 4 constructed cases (see
    above).
  - Full backend import of every touched module plus `app.main` booting
    the FastAPI app with dummy env vars, confirming all new/changed
    routes (`/pdfs/{id}/approve`, `/pdfs/{id}/reject`, updated
    `/pdfs/{id}/retry`, updated `GET /pdfs`) are wired correctly.
  - `ruff check` clean on every touched Python file.
  - `pnpm --filter @placeprep/shared typecheck`,
    `pnpm --filter client typecheck`, `pnpm --filter client build`, and
    `pnpm --filter client lint` (oxlint) all clean -- the client build
    genuinely compiles and bundles with the new tab/dialog/hooks.
  - The two-PDF synthetic mixed-document end-to-end test described above,
    using the real Tesseract/poppler binaries actually installed in this
    environment (not mocked).

**Explicitly not done in this pass** (out of Phase 7's stated scope, not
overlooked): the full Admin Portal expansion (user management, a
dedicated retry/duplicate-queue UI beyond what already existed), an
automated test suite covering this (or any) pipeline logic, and
cross-document linking for the case where a question paper and its
solutions are genuinely two *separate* uploads rather than one PDF with
mixed pages -- that would need a real "link to companion document"
concept in the schema and admin UI, which is a bigger, separate feature
than a bug fix and wasn't attempted here.

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
