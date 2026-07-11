# MERGE_NOTES.md

## Part 1 -- Frontend UI/UX merge (done first, this session)

A separate session produced a scoped, client-only UI/UX polish pass (10
files: `stat-card.tsx`, `dashboard-page.tsx`, `mobile-nav.tsx`,
`quiz-runner.tsx`, `quiz-result.tsx`, `pdf-library-page.tsx`,
`login-page.tsx`, `practice-trend-chart.tsx`, `analytics-page.tsx`,
`index.css`). Every claimed change was independently re-verified (read
against the current snapshot, not taken on faith), and the merged
workspace was rebuilt and run through the real toolchain:
`pnpm install` / `typecheck` (shared + client) / `lint` / `build` --
all passed, 0 errors, 1 pre-existing unrelated lint warning carried
forward. No backend, shared-package, or API-contract changes in this
part. See the git history / prior response for the full per-file
verification table.

## Part 2 -- Backend completion pass (this response)

Merged the frontend work above with a from-scratch reconstruction of the
full project (`server/`, `supabase/`, root config -- all previously only
existed as pasted text in conversation, not as files) plus genuinely new
backend work. See `PROJECT_STATE.md` for the full "what was built, how it
was verified, what wasn't verified" account -- this file just summarizes
the merge-specific decisions.

### What changed vs. what didn't

**Changed (server/):** `app/main.py` (rate limiter wiring),
`app/core/config.py` (+image/rate-limit settings),
`app/core/rate_limit.py` **NEW**, `app/core/exceptions.py`
(+`RateLimitedError`), `app/services/pipeline.py` (format-agnostic
extraction routing), `app/services/image_text.py` **NEW**,
`app/services/ocr.py` (+`ocr_image_bytes`), `app/services/question_merge.py`
**NEW**, `app/api/v1/endpoints/pdfs.py` (multi-format, pagination, SSE),
`app/api/v1/endpoints/questions.py` (pagination, merge endpoint),
`app/api/v1/endpoints/quizzes.py` (N+1/race fix, `/trend`),
`app/api/v1/endpoints/search.py` **NEW**,
`app/api/v1/endpoints/daily_challenge.py` **NEW**, `app/api/v1/router.py`
(new registrations), `requirements.txt` (+`slowapi`), `.env.example`
(+image/rate-limit vars), `README.md` (documented all of the above).

**Unchanged (server/):** every other endpoint/service file --
`profiles.py`, `companies.py`, `notifications.py`, `bookmarks.py`,
`processing.py`, `health.py`, `deps.py`, `security.py`,
`supabase_client.py`, `schemas.py`, `responses.py`, `logging_config.py`,
`duplicate.py`, `classification.py`, `chunking.py`, `answer_key.py`,
`pdf_text.py`, `ai/base.py`, `ai/service.py`. `ai/gemini_provider.py` got
two documentation-only prompt sentences (acknowledging photographed input,
clarifying `page_number` for a single image) -- no structural change.

**New migration:** `0006_phase6_multiformat_search_daily_challenge.sql`.
Migrations 0001-0005 are byte-for-byte unchanged from the prior pass.

**Changed (shared/):** `pdf-resource.ts` (+optional `fileKind`),
`file-upload.ts` (+`IMAGE_UPLOAD_CONSTRAINTS`/`UPLOAD_CONSTRAINTS`),
`activity-log.ts` (+2 new action values matching migration 0006's updated
check constraint), 2 new files (`daily-challenge.ts`, `search.ts`), and
`index.ts` (barrel export update). **All additive** -- every new field is
optional, every new export is new, nothing existing was removed, renamed,
or had its shape changed. Re-verified the client still typechecks/lints/
builds clean after these changes (see PROJECT_STATE.md).

**Unchanged (client/):** everything, beyond what Part 1 already merged.
This pass deliberately made zero frontend changes of its own -- see
`FUNCTIONAL_RECOMMENDATIONS.md` for the (small) list of one-line frontend
changes the new backend surface unlocks, correctly left to whoever owns
`client/` next rather than reached into here.

### Merge decision

Clean merge. The new backend endpoints are strictly additive to the API
surface (new routes, new optional response fields) -- nothing existing
`client/` code calls was renamed or had its response shape changed in a
breaking way. The one deliberately-*not*-yet-wired piece is the upload
dropzone's `accept` attribute, which still only offers `application/pdf`
in the file picker even though the backend now accepts images too --
correct to leave alone rather than silently reach into `client/` outside
this pass's stated backend scope.

### Known risk / next step before deploying

`bulk_increment_question_stats()` and the Daily Challenge tables only
exist after migration `0006` is applied. **Do not deploy this version of
`server/` against a Supabase project that hasn't run migration 0006** --
`submit_attempt` and both Daily Challenge endpoints will fail outright
(a clean 500 via the existing unhandled-exception handler, not silent
data corruption, but still a hard failure) until it has.

## Suggested commit message

```
Phase 6: multi-format uploads, global search, Daily Challenge, Admin
Merge, real pagination, and two confirmed bug fixes

New backend surface:
- Direct image upload (PNG/JPG/JPEG -- phone photos, screenshots) via a
  new file_kind column + services/image_text.py, reusing the existing
  OCR engine. Verified end-to-end against a real Tesseract binary with
  a synthetic question-paper image.
- Global search (GET /search) across questions/companies/PDFs -- was
  milestone 17, never started.
- Daily Challenge (GET .../today, POST .../complete, GET .../streak):
  weak-topic-weighted selection (reusing Analytics' own definition),
  real streak tracking. Explicitly scoped out of Phase 5; built for
  real this pass, streak algorithm unit-tested (5 scenarios).
- Admin Review "Merge" (POST /questions/{id}/merge): combines stats,
  reassigns quiz_attempts/bookmarks/wrong_answer_marks with real
  conflict handling, deletes the duplicate. Also scoped out of Phase 5.
- Real page/pageSize pagination on /questions and /pdfs, replacing a
  flat limit -- shared PaginationParams/PaginatedResult types existed
  since Sprint 3 and were never actually used.

Confirmed bug fixes:
- quizzes.py submit_attempt: fixed a real N+1 + read-modify-write race
  condition (two near-simultaneous submissions touching the same
  question could silently lose an increment) via a new atomic
  bulk_increment_question_stats() Postgres function. Verified with real
  fixture data against a real Postgres instance.
- vercel.json: added the missing SPA fallback rewrite -- confirmed this
  caused "refresh returns 404" on any direct navigation to a client-
  routed path.

Also: basic per-IP rate limiting (slowapi, documented single-instance
caveat), an SSE live-status endpoint, and a server-aggregated quiz
trend endpoint (backend halves of two UI/UX-pass recommendations).

Verified for real, not asserted: pnpm typecheck/lint/build (shared +
client) all pass; FastAPI app imports, 40 routes register, /health
responds via TestClient; all 42 server .py files compile; ALL SIX
migrations (0001-0006) executed successfully against a real, freshly
installed PostgreSQL 16 instance; bulk_increment_question_stats()
functionally tested with real SQL calls; new schema (file_kind,
daily_challenge_* tables, trigram indexes, unique constraints)
confirmed to exist and enforce correctly; end-to-end OCR test of the
new image-upload path against a real Tesseract binary; Daily Challenge
streak algorithm unit-tested (5 scenarios, all correct).

NOT verified (said plainly): no live Supabase/PostgREST/Storage, no
live Gemini key, no real-concurrency race test, no load test of the
rate limiter, Merge not yet run against live conflicting data. See
PROJECT_STATE.md for the full list and reasoning.

New migration: 0006_phase6_multiformat_search_daily_challenge.sql --
apply after 0001-0005, before deploying this backend version.
```

## Part 3 -- Sprint 1A frontend integration (this pass)

A second, independent frontend session ("Sprint 1A", 13 files, `client/`
only) arrived as a separate branch alongside the Part 1/2 work above.
**Important scoping note, flagged rather than silently smoothed over:**
Sprint 1A's own `MERGE_NOTES.md` states it started from a snapshot where
`MobileNav` had no focus trap, `QuizRunner` had no keyboard shortcuts, and
`index.css` had no `slide-in-left` token -- but all three were already
true and already merged by Part 1 (above) in *this* repository. The two
sessions' work was based on different snapshots and never diverged
about which behavior was correct -- Sprint 1A's own file list simply
didn't include the three files where a real overlap existed. Rather than
apply Sprint 1A's diffs wholesale (which would have silently reverted
Part 1's keyboard-shortcuts and focus-trap work), each of the three
overlapping files was hand-merged: Sprint 1A's new capability was kept in
full, and Part 1's existing capability was kept in full alongside it. No
guessing was involved -- every file pair was diffed and read before any
merge decision.

### Clean, no-conflict files (Sprint 1A's version taken as-is)

`router.tsx` (quiz `mode` search param + Notifications route swap),
`components/layout/top-nav.tsx` (command palette wiring, ⌘K listener),
`components/layout/notification-center.tsx` (keyboard activation, "View
all" link), `components/quiz/quiz-config-form.tsx` (`defaultMode` prop),
`pages/quiz-page.tsx` (reads `mode` search param), `pages/bookmarks-page.tsx`
/ `pages/wrong-answers-page.tsx` (CTA links now pass `mode`). None of
these files were touched by Part 1, so Sprint 1A's diff applied cleanly
against the current snapshot with no adaptation needed.

### New files (added as-is)

`hooks/use-dialog-a11y.ts` -- shared focus-trap/Escape/scroll-lock hook.
`components/search/command-palette.tsx` -- the ⌘K palette, built on
`@radix-ui/react-dialog` (already a dependency; no new package needed).
`pages/notifications-page.tsx` -- the standalone Notifications page (the
dropdown already existed and was already real; only this page was
missing). Verified against `shared/src/types` (`Company`, `PDFResource`,
`Question` field names) and the existing `use-questions`/`use-companies`/
`use-pdfs`/`use-notifications` hooks -- all fields the new files read
(`slug`, `industry`, `text`, `topic`, `subject`, `title`, `fileName`,
`processingStatus`, `.items`) actually exist on the current shapes.

### Hand-merged files (real overlap, both capabilities preserved)

**`client/src/index.css`:** Part 1's `--animate-slide-in-left` /
`@keyframes slide-in-left` (used by `MobileNav`) kept; Sprint 1A's
`--animate-slide-in-bottom` / `--animate-scale-in` (mobile quiz palette
sheet, command palette) added alongside it. Purely additive union, no
token renamed or removed. Covered by the existing generic
`prefers-reduced-motion` block, same as every other token.

**`components/layout/mobile-nav.tsx`:** Sprint 1A's `useDialogA11y` hook
is a strict improvement over Part 1's inline focus-trap effect (it
restores focus to whatever element was actually focused before opening,
not a hardcoded trigger ref) -- adopted as the implementation. Part 1's
`aria-current="page"` on the active nav link and the established
`animate-slide-in-left`/`animate-fade-in` design tokens (over Sprint 1A's
`animate-fade-up`, which was written against a snapshot that didn't have
the more specific slide-in token yet) were both kept. Stale `triggerRef`/
`closeRef` removed now that the hook owns focus management.

**`components/quiz/quiz-runner.tsx`:** the highest-risk file in this
integration. Sprint 1A's structural change (palette grid/stats/submit
extracted into `QuestionPaletteContent`, reused by both the existing
desktop Card -- now `hidden lg:block` -- and a new mobile floating
trigger + bottom sheet) was kept in full. Part 1's keyboard-shortcuts
`useEffect` (1-9/A-D select, arrows navigate, M marks, Enter submits) and
its "keyboard shortcuts" hint box were re-added on top rather than lost --
they're absent from Sprint 1A's version only because keyboard shortcuts
didn't exist yet in the snapshot that pass started from, not because
anyone decided to remove them. One small integration decision made here,
not present verbatim in either branch: the keyboard-shortcut handler now
also checks `!paletteSheetOpen` before acting, so the global 1-9/arrow/M
shortcuts can't fire underneath the new mobile bottom sheet while its own
focus trap has the page. The hint box was kept inside the now-`lg:block`
desktop Card only (not duplicated into the mobile sheet) since it
documents a physical-keyboard feature and the card housing it is already
desktop-only.

### Verification performed on the merged workspace (real, not asserted)

- `pnpm install`, `pnpm typecheck` (shared + client), `pnpm lint`
  (oxlint), `pnpm build` (client) -- **all pass, zero errors.** The one
  pre-existing `main.tsx` fast-refresh lint warning is unchanged, same
  warning both prior passes independently carried forward.
- Production bundle size compared against a clean build of the
  pre-Sprint-1A snapshot: JS 388.85 kB -> 445.16 kB gzip 110.41 kB ->
  122.86 kB; CSS 83.34 kB -> 85.49 kB gzip 37.71 kB -> 38.06 kB. The
  increase (~56 kB raw / ~12 kB gzip) is attributable to the new command
  palette + Notifications page + Radix Dialog usage pulled in for the
  first time in this bundle's shared chunk; not flagged as a concern at
  this app's current scale, but noted rather than left silently
  unmeasured.
- `diff -rq` between the pre-merge and merged `client/src` trees confirms
  exactly the 13 Sprint 1A files changed/added and nothing else moved --
  no incidental changes elsewhere in `client/`.
- `shared/` and `server/` confirmed byte-for-byte unchanged by this pass
  (Sprint 1A never touched them) -- Part 2's backend verification above
  still stands as-is; re-ran the lighter checks anyway as a regression
  guard: all 42 `server/*.py` files re-compiled, `app.main` re-imported,
  all 40 routes re-registered, `/api/v1/health` and `/` both responded
  200 via `TestClient`.

### Known follow-ups from this pass

- The command palette searches whatever's already in each hook's React
  Query cache, not the new backend `GET /search` endpoint -- this is
  called out in the component's own header comment, not a regression
  introduced here. `useQuestions()`/`usePdfs()` call their endpoints with
  no `page`/`pageSize` params, so they get page 1 at the backend's
  default page size (300 for questions, 50 for PDFs) -- fine at this
  app's current data volume, worth revisiting if either list grows past
  that in a single account.
- Sprint 1A's own two checklist items -- a manual keyboard-only pass and
  a manual narrow-viewport pass -- were not and could not be done here
  either, same sandboxed-environment limitation Sprint 1A's own notes
  disclosed (no browser available). Recommended before merging to `main`.
- `docs/UI_UX_AUDIT.md`'s "Responsive design notes" section (written
  during Part 1) explicitly flagged the quiz palette's mobile
  reachability as a follow-up and even suggested the exact fix Sprint 1A
  implemented -- left that document unedited as a historical snapshot
  rather than rewritten, since `PROJECT_STATE.md` and this file are now
  the authoritative record of what's resolved.
