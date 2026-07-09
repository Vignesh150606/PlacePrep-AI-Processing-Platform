# PlacePrep Project State

Last updated: 2026-07-09 (Phase 5 — Learning Platform pass)

## Process note on this pass (read this first)

Same methodology as prior passes, with one upgrade: this time the full
project was actually reconstructed in a sandboxed Linux container from the
source snapshot shared in chat, and real verification was run against it —
not just static review. Specifically, this pass actually executed:

- `pnpm install` (real dependency resolution against the npm registry)
- `pnpm --filter @placeprep/shared typecheck` — **passes**
- `pnpm --filter client typecheck` (`tsc -b --noEmit`) — **passes**
- `pnpm --filter client lint` (oxlint) — **0 errors**, 1 pre-existing warning
  unrelated to this pass (`main.tsx`'s `RouterShell` fast-refresh warning,
  present in the original snapshot)
- `pnpm --filter client build` (full Vite production build) — **succeeds**,
  produces a working `dist/`
- A Python venv with `pip install -r requirements.txt`, then actually
  importing `app.main` and listing every registered FastAPI route, and
  hitting `/api/v1/health` through Starlette's `TestClient` — **boots and
  responds correctly**
- Standalone unit-style smoke tests for the new pure-logic modules
  (`chunking.split_into_chunks`, `answer_key.split_answer_key`,
  `duplicate.compute_content_hash`) — **all passed**
- An actual **end-to-end OCR fallback test**: a synthetic image-only PDF
  (rendered text with no embedded text layer, via PIL + img2pdf) was fed
  through `pdf_text.extract_text_with_quality()` (correctly flagged
  low-quality, 0 chars/page) and then `ocr.ocr_pdf_bytes()`, which correctly
  recovered the real question text via Tesseract. This is the strongest
  evidence available that Sprint 4 fix #3 (scanned-PDF support) actually
  works, short of running it against a live-uploaded real placement PDF.

**What was NOT and could not be verified**, honestly: no live Supabase
project was available, so the five SQL migrations (0001-0005) were reviewed
carefully but never actually executed against a real Postgres instance, and
no RLS policy was tested end-to-end. No `GEMINI_API_KEY` was available, so
the redesigned prompt (services/ai/gemini_provider.py) was never sent to the
real Gemini API — its quality is a matter of careful prompt engineering
reasoning, not a measured before/after extraction-count comparison on a
real placement PDF. **Both of these should be the first thing done against
the real deployed environment before trusting this pass fully.**

## What This Pass Was For

The brief asked for Phase 5: turn the working infrastructure (auth, DB, AI
pipeline) into an actual learning platform, after first fixing the
remaining Sprint 4 extraction-quality issues. Given the true size of the
full brief (8 feature modules plus four pipeline fixes plus a UI audit —
realistically several sprints of work), this pass explicitly prioritized
**everything on the critical path to the brief's own STOP CONDITION**
(upload → extract → Question Bank → quiz → submit → score → wrong answers
saved → dashboard updates), plus the four numbered Sprint 4 fixes, over
building every module to equal depth. See "Deliberately Not Built" below
for exactly what that traded off, and why.

## Sprint 4 Fixes (the four numbered items)

**1. AI extraction quality — traced, not guessed.** Four independent,
separately-testable causes were identified by reading the pipeline
end-to-end, each addressed in its own module:
  - *Scanned PDFs*: `pdf_text.py` previously either raised on truly empty
    text or silently returned near-empty "text" (stray headers/page
    numbers) for a scanned page, which Gemini then correctly extracted zero
    questions from — a real zero-extraction bug, but not where the previous
    debugging would have looked. `pdf_text.extract_text_with_quality()` now
    reports chars-per-page; below a threshold, `services/ocr.py` (new)
    kicks in. **Verified end-to-end** with a synthetic scanned PDF (see
    above).
  - *Weak prompting*: `gemini_provider.py`'s prompt had no "never
    skip/summarize" instruction and no guidance for the extremely common
    "questions in one section, answers in a separate Answer Key section"
    layout. Redesigned (see fix #2 below).
  - *Answer key parsing*: `services/answer_key.py` (new) detects and lifts
    out a trailing "Answer Key" section before chunking, so it can be
    attached to every chunk's prompt instead of only whichever chunk it
    physically landed in.
  - *Large document chunking*: `services/chunking.py` (new) bounds each
    Gemini call to `CHUNK_MAX_CHARS` (default 12k chars), splitting on
    paragraph boundaries with a small overlap; `pipeline.py` merges results
    across chunks and de-duplicates within the run before the existing
    cross-run DB duplicate check.

**2. Gemini prompt redesign.** `services/ai/gemini_provider.py`'s prompt
now explicitly requires every field the brief listed (Question, Options,
Correct Answer, Explanation, Topic, Subject, Difficulty, Company, Page
Number, Confidence — Source PDF is attached server-side, not requested from
the model), instructs the model to never summarize/skip an MCQ, and
explains how to use an attached answer-key section to resolve correct
options. `ExtractedQuestion` (services/ai/base.py) gained a `page_number`
field; `questions.page_number` is a new DB column (migration 0004).

**3. Scanned PDF (OCR) support.** New `services/ocr.py`, using
`pytesseract` + `pdf2image` (added to requirements.txt) wrapping the
`tesseract-ocr` / `poppler-utils` system binaries. Gracefully degrades to
"OCR unavailable" (not a crash) if those system packages aren't installed —
**they must be installed separately on the actual deploy target** (see the
new section in `server/README.md`); this assistant's sandbox happened to
already have them, which is what made the end-to-end test above possible,
but that won't be true of a fresh Render/Railway/etc. instance without the
`apt-get install tesseract-ocr poppler-utils` step.

**4. Large PDF support.** `services/chunking.py` + `pipeline.py` changes
described above. `processing_jobs.chunk_count` and `.ocr_used` (migration
0004) are now surfaced in the Processing Dashboard so admins can see which
jobs needed the fallback paths.

## UI Bug Audit

The brief described a bug where "the processing text currently rotates
together with the spinner; only the spinner should animate." This was
audited carefully in every status-rendering component in the provided
snapshot (`pdf-library-page.tsx`'s `StatusPill`, and the equivalent pattern
in `recent-pdfs-card.tsx`) — in both, `animate-spin` is applied only to the
`<Icon>` element; the label text is already a separate, non-animated
sibling. **This bug could not be reproduced or located anywhere in the
provided source.** Rather than fabricate a change to code that already
looks correct, `StatusPill`'s label was wrapped in an explicit `<span>`
(cosmetic — makes the "text does not carry animation classes" property
visually obvious in the DOM) and the reasoning was left in a code comment.
If the bug is still visible in the actual running app, it likely lives in a
component that wasn't part of the shared snapshot — worth a screenshot/repro
steps for a follow-up pass.

## Phase 5 Modules — status

- **[x] Module 1 — Question Bank.** Added Topic filter, Sort control
  (Recently Added / Difficulty / Most Attempted / Highest Accuracy),
  Source-PDF filter + provenance badge (file name + page number, using the
  new `page_number` field), and client-side pagination (12/page). Bookmarks,
  Subjects, Companies, Difficulty, and Question Status (admin-only) filters
  already existed and were kept.
- **[x] Module 2 — Quiz Engine.** `QuizRunner` rewritten with a question
  palette (jump to any question, color-coded by answered/marked/unvisited),
  Previous/Next/Skip, Mark for Review, Clear Response, an optional countdown
  timer with auto-submit, and full-screen mode was **not** added (see
  "Deliberately not built").
- **[x] Module 3 — Quiz Submission.** Every attempt is now persisted via the
  new `quiz_attempts` table (migration 0005) and `/api/v1/quizzes/*`
  endpoints. Submission recomputes correctness **server-side** from
  `question_options` (never trusts the client's `isCorrect`), updates
  `questions.times_attempted`/`times_correct` (previously nothing wrote to
  these — every "X% of students answer this correctly" stat was reading
  zeros), and the result screen shows score/accuracy/time
  taken/correct/wrong/skipped plus the existing per-question review.
- **[x] Module 4 — Wrong Answer Notebook.** New `wrong_answer_marks` table +
  `/api/v1/quizzes/wrong-answers` endpoints, populated automatically on
  every quiz submission. New page at `/wrong-answers` with Retry (via Quiz
  page's "Wrong Answers" mode), Filter (by subject), Mastered, and Delete
  (the last two share one `resolved` field — see the hook's code comment for
  why that's a reasonable simplification, not a shortcut).
- **[x] Module 5 — Bookmarks.** New `/api/v1/bookmarks` endpoints (the table
  + RLS already existed from migration 0002 — same "endpoint was the actual
  gap" pattern as Question Bank/Companies in the previous pass). New page at
  `/bookmarks` with subject filtering and a "Practice bookmarks" CTA into
  the Quiz page's new "Bookmarks" mode. `use-bookmarks.ts` rewritten from
  its previous honestly-labeled in-memory implementation to the real thing.
- **[~] Module 6 — Daily Challenge.** **Not built this pass** — see
  "Deliberately not built."
- **[x] Module 7 — Analytics.** New `/analytics` page: Accuracy, Average
  Score, Questions Solved, Company Coverage, Topic Coverage, Weak/Strong
  Topics (min. 3 answered questions per topic before it's shown, to avoid
  noise from a single lucky/unlucky guess), and an accuracy-by-topic bar
  chart — all computed client-side from real `quiz_attempts` +
  `questions` data (no separate analytics backend/materialized view; see
  "Deliberately not built" for why that's reasonable right now). The
  dashboard's practice trend chart was also rewired from an honest
  "not tracked yet" placeholder to a real score-over-time line chart, now
  that there's real attempt history to chart.
- **[~] Module 8 — Admin Review.** Approve, Reject, Edit (text/explanation/
  difficulty), and Delete are implemented (`/api/v1/questions/{id}/status`,
  `/api/v1/questions/{id}`, new `/admin/review` page, admin-only nav entry).
  **Merge is not implemented** — see "Deliberately not built."

## Deliberately Not Built This Pass (and why)

- **Daily Challenge (Module 6) — not built.** A real streak feature needs
  its own persisted state (a `daily_challenge_streaks` table, timezone-aware
  "did they complete today's challenge" logic, and a defined algorithm for
  what goes into the daily mixed set) — building a shallow version just to
  have a nav entry would be exactly the kind of "looks done but isn't"
  feature the brief's own QUALITY section warns against ("never display
  fake production statistics"). Scoped whole to the next pass.
- **Merge tooling (part of Module 8) — not built.** Merging two
  near-duplicate questions correctly means picking a canonical row,
  reassigning any historical `quiz_attempts` responses that reference the
  merged-away id, and deciding how to combine `times_attempted`/
  `times_correct`. That's a real, separate feature, not a fourth button next
  to Approve/Reject/Delete.
- **A dedicated analytics backend/materialized view — not built.** Module 7
  is computed client-side from `quiz_attempts` + `questions`, which is
  correct and real, but won't scale gracefully to a student with thousands
  of attempts. Worth revisiting once real usage volume exists to justify it.
- **Full-screen quiz mode (part of Module 2) — not built.** Marked
  "(optional)" in the brief; skipped in favor of the palette/timer/
  mark-for-review work that's actually required for the stop condition.

## Files changed this pass

Every file from the original snapshot was reconstructed unchanged unless
noted below (this pass's actual diff). New files are marked **NEW**.

**Server:**
`app/core/config.py` (OCR/chunking settings), `app/services/pdf_text.py`
(quality signal), `app/services/ocr.py` **NEW**, `app/services/chunking.py`
**NEW**, `app/services/answer_key.py` **NEW**, `app/services/ai/base.py`
(page_number + chunk-aware interface), `app/services/ai/gemini_provider.py`
(redesigned prompt), `app/services/ai/service.py` (pass-through params),
`app/services/pipeline.py` (OCR/chunking/answer-key integration),
`app/api/v1/endpoints/questions.py` (page_number, status filter, admin
review endpoints), `app/api/v1/endpoints/processing.py` (ocr/chunk
visibility), `app/api/v1/endpoints/quizzes.py` **NEW**,
`app/api/v1/endpoints/bookmarks.py` **NEW**, `app/api/v1/router.py`
(registration), `requirements.txt` / `.env.example` / `README.md` (OCR
system-dependency documentation), `supabase/migrations/0004_*.sql` **NEW**,
`supabase/migrations/0005_*.sql` **NEW**.

**Shared types:** `question.ts` (+pageNumber), `processing-job.ts`
(+ocrUsed/chunkCount/ocrJobsTotal), `quiz.ts` (extended QuizAttempt +
QuizAttemptStartInput/SubmitInput/QuestionState types).

**Client:** `hooks/use-bookmarks.ts` (real backend), `hooks/use-quiz-
attempts.ts` **NEW**, `hooks/use-wrong-answers.ts` **NEW**,
`hooks/use-admin-questions.ts` **NEW**, `hooks/use-question-filters.ts`
(topic/sort/pagination/source-PDF), `components/quiz/quiz-runner.tsx`
(full rewrite — palette/timer/mark-for-review), `components/quiz/
quiz-result.tsx` (rewrite for persisted response shape + real stats),
`components/quiz/quiz-config-form.tsx` (time limit + wrong-answers/
bookmarks modes), `components/questions/question-filters.tsx` +
`question-card.tsx` (topic/sort/source-PDF), `components/dashboard/
continue-practice-card.tsx` + `practice-trend-chart.tsx` (real resume/trend
data), `components/layout/nav-items.ts` + `sidebar.tsx` + `mobile-nav.tsx`
(admin-only nav filtering), `pages/quiz-page.tsx` (full rewrite — real
persistence + resume), `pages/dashboard-page.tsx` (real stat wiring),
`pages/question-bank-page.tsx` (pagination), `pages/pdf-library-page.tsx`
(OCR/chunk visibility), `pages/wrong-answers-page.tsx` **NEW**,
`pages/bookmarks-page.tsx` **NEW**, `pages/analytics-page.tsx` **NEW**,
`pages/admin-review-page.tsx` **NEW**, `router.tsx` (new routes),
`mocks/questions.ts` + `mocks/quizzes.ts` (updated to satisfy extended
shared types — neither mock is actually read by any real page).

## Stop Condition Assessment

The brief's stop condition: *upload a PDF → questions extracted → appear in
Question Bank → student starts a quiz → selects MCQ options → submits quiz
→ views score → wrong answers are saved → dashboard updates automatically.*

Every step in that chain now has real, persisted, end-to-end code behind
it, and the client half is verified (typecheck/lint/build all pass) and the
server half boots and its logic is unit-tested in isolation. **What
couldn't be verified in this environment** is the two pieces that need
live external services: an actual PDF uploaded through a real Supabase
project processed by a real Gemini API call, start to finish. That's the
literal next step before calling this done — see below.

## Milestones (updated)

- [x] 1–8. (unchanged, already complete)
- [x] 9. AI Extraction — pipeline rewritten (OCR/chunking/answer-key/prompt);
      **still blocked on a real `GEMINI_API_KEY` + a real test PDF** for an
      actual end-to-end quality comparison (see Process Note)
- [x] 10. Question Management — pagination/sort/topic/source-PDF filters
- [x] 11. Quiz Engine — palette/timer/mark-for-review/skip/clear, real
      question sourcing (topic/company/mixed/random/wrong-answers/bookmarks)
- [x] 12. Quiz Attempt — **now persisted end-to-end**, server-side scoring
- [x] 13. Wrong Answer Notebook — built (Mastered/Delete share one field —
      see module note)
- [x] 14. Bookmarks (standalone page) — built, real backend
- [~] 15. Interview Experiences — unchanged (still no backend, still
      clearly-labeled sample data) — **explicitly out of scope for this
      pass per the brief's own instruction**
- [x] 16. Company Pages — unchanged from prior pass (already real)
- [ ] 17. Search (global/unified) — unchanged, not in this pass's brief
- [x] 18. Dashboard — real quiz/wrong-answer stats, real trend chart
- [x] 19. Notifications — unchanged, already real
- [x] 20. Analytics — new, real, computed client-side (see module note)
- [~] 21. Admin Review — Approve/Reject/Edit/Delete built; Merge not built
- [ ] 22. Daily Challenge — not built this pass
- [ ] 23. Testing — still no automated test suite (the verification this
      pass ran was ad hoc: typecheck/lint/build + import/route/smoke tests,
      not a checked-in `pytest`/`vitest` suite)
- [ ] 24. Docker / Final Review — unchanged

## Implementation Summary (short version)

Fixed the four traced causes of low/zero MCQ extraction (scanned PDFs via a
new OCR fallback, a redesigned strict-JSON Gemini prompt, answer-key section
detection so answers separated from questions still get matched correctly,
and chunking so long PDFs don't overload a single model call), then built
the persistence layer the rest of Phase 5 depends on: a `quiz_attempts`
table with server-side-recomputed scoring, a `wrong_answer_marks` table, and
finally wired up the `/bookmarks` endpoint the table had been waiting on
since migration 0002. On top of that: a real Quiz Engine (palette, timer,
mark for review), Wrong Answer Notebook, Bookmarks, Analytics, and a basic
Admin Review page — all reading real data, all verified to typecheck/lint/
build (client) and boot/route-correctly (server). Daily Challenge and Merge
tooling were explicitly scoped out rather than half-built.

## Git Commit Message

```
Phase 5: learning platform (quiz engine, submission, wrong answers,
bookmarks, analytics, admin review) + Sprint 4 extraction fixes

Sprint 4 fixes (traced, not guessed):
- OCR fallback for scanned PDFs (services/ocr.py), gated on a real
  chars-per-page quality signal (services/pdf_text.py)
- Redesigned Gemini prompt: never skip/summarize, page_number field,
  explicit answer-key cross-referencing instructions
- Answer-key section detection (services/answer_key.py) so a trailing
  "Answer Key" section survives chunking and reaches every chunk's prompt
- Large-PDF chunking (services/chunking.py) with intra-run dedupe on merge

Phase 5 modules:
- Quiz Engine: palette, timer + auto-submit, mark for review, skip,
  clear response, resume-in-progress
- Quiz Submission: quiz_attempts table, server-side score recomputation
  (never trusts client isCorrect), times_attempted/times_correct now
  actually written
- Wrong Answer Notebook: wrong_answer_marks table, auto-populated on
  every wrong answer, mastered/delete/filter/retry
- Bookmarks: /bookmarks endpoint (table + RLS already existed)
- Analytics: accuracy/avg score/questions solved/topic+company
  coverage/weak+strong topics, computed from real attempt data
- Admin Review: approve/reject/edit/delete for pending-review questions
  (merge intentionally deferred)

Not built this pass: Daily Challenge, Admin Review "merge", a dedicated
analytics backend, full-screen quiz mode — see PROJECT_STATE.md for why.

Verified: pnpm typecheck/lint/build all pass; FastAPI app imports, all
routes register, /health responds via TestClient; chunking/answer-key/
duplicate-hash unit-tested; OCR fallback verified end-to-end against a
synthetic scanned PDF. NOT verified: no live Supabase project or Gemini
key was available in this environment — run migrations 0004/0005 against
a real project and do one real end-to-end PDF upload before trusting the
extraction-quality fixes in production.

New DB migrations: 0004_sprint4_pipeline_fixes.sql,
0005_sprint5_learning_platform.sql — apply both, in order, after 0001-0003.
```

## Remaining Work for Phase 6

Per the brief's own instruction, Phase 6 (Alumni, Interview Experiences
backend, Community, Placement Calendar, social features) was **not**
started this pass. In priority order for whoever picks this up next:

1. **Run migrations 0004 and 0005 against the real Supabase project**, set
   a real `GEMINI_API_KEY`, install `tesseract-ocr`/`poppler-utils` on the
   deploy target, and do one real end-to-end PDF upload (ideally one known
   to have previously extracted zero questions) to confirm the Sprint 4
   fixes actually move the needle outside this assistant's sandbox.
2. **Daily Challenge (Module 6)** — needs a `daily_challenge_streaks` table,
   timezone-aware "completed today" logic, and a defined daily-mix
   algorithm (likely: N random questions weighted toward weak topics from
   Analytics).
3. **Admin Review "Merge"** — canonical-row selection + historical
   `quiz_attempts` response reassignment.
4. **A real automated test suite** — nothing in this codebase has ever had
   `pytest`/`vitest` coverage; the verification this pass ran (typecheck/
   lint/build + ad hoc import/smoke tests) is not a substitute for a
   checked-in, repeatable suite, especially for the scoring-recomputation
   logic in `quizzes.py`, which is exactly the kind of code a regression
   could silently break.
5. **Interview Experiences backend** (still sample-data-only), **global
   search**, **Docker packaging** — all unchanged from prior passes' notes.
6. Then, per the brief: Phase 6 (Alumni / Community / Placement Calendar /
   social features).

## Security Note (carried forward — action still needed)

Unchanged from previous entries: confirm the previously-flagged exposed
Supabase secret/service-role key has actually been rotated (Supabase
dashboard → Project Settings → API). This pass has no way to verify that
from here.
