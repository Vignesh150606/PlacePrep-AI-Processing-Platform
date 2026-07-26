# FUNCTIONAL_RECOMMENDATIONS.md

Frontend-side follow-ups identified across the UI/UX pass and this
backend pass. Nothing below was implemented in `client/` this pass --
correctly left to whichever session owns it next, per this project's
established file-ownership boundary.

---

## 1. Real upload progress (currently indeterminate) -- still open

**Unchanged from the UI/UX pass.** `apiUpload()` (`lib/api-client.ts`)
still awaits a whole `fetch` response with no progress callback. Still
*nearly* frontend-only: swap `fetch` for `XMLHttpRequest` in `apiUpload`
and expose an `onProgress(percent)` callback through `useUploadPdf`'s
mutation options. No backend change needed for this one.

**Files likely involved:** `client/src/lib/api-client.ts`,
`client/src/hooks/use-pdfs.ts`.

---

## 2. Live processing status without polling -- backend now built

**The backend half is done this pass:** `GET /api/v1/pdfs/{id}/status-stream`
(Server-Sent Events) emits a JSON event every time that upload's
`processing_status` changes, then closes on a terminal state or a 3-minute
safety timeout.

**Frontend switch-over still needed:** `usePdfs()`'s 3-second poll
(`use-pdfs.ts`) could be replaced with an `EventSource`-based hook for the
specific PDF currently in flight, falling back to the existing poll if the
stream fails to connect or the browser's `EventSource` can't attach the
required `Authorization` header (native `EventSource` can't set custom
headers -- this needs either a fetch-based SSE reader, e.g. via a small
library, or a short-lived signed URL param instead of a bearer header).

**Files likely involved:** `client/src/hooks/use-pdfs.ts`, a new
`use-pdf-status-stream.ts`.

---

## 3. Chunk/OCR-aware processing-stage UI -- partially addressed

**Still not built at the granularity originally asked for.** The new SSE
endpoint (#2 above) streams `processingStatus`/`extractedQuestionCount`/
`errorMessage` -- coarser than "Extracting text (2/5 chunks)" or "Running
OCR fallback," which would need `pipeline.py` to write incremental
stage/progress fields mid-run (currently `chunk_count`/`ocr_used` are only
written once, at job completion). Genuinely deferred, not silently
dropped: doing this properly means threading a progress-reporting
callback through `pipeline.py`'s chunk loop, which touches the pipeline's
core control flow and deserved its own pass rather than a rushed addition
here.

**Files likely involved:** `server/app/services/pipeline.py`,
`processing_jobs` (would need new incremental-progress columns), the SSE
endpoint's event payload.

---

## 4. Server-computed dashboard trend data -- backend now built

**Done this pass:** `GET /api/v1/quizzes/trend?limit=30` returns
pre-aggregated `{date, score, attemptId}` points, oldest-to-newest.

**Frontend switch-over still needed:** `PracticeTrendChart` currently
derives its series client-side from `useQuizAttempts()`'s full attempt
list (fine at current volumes, won't scale to hundreds of attempts per
user). Swap to the new endpoint via a `useQuizTrend()` hook.

**Files likely involved:** `client/src/components/dashboard/
practice-trend-chart.tsx`, a new `hooks/use-quiz-trend.ts`.

---

## 5. DONE (Phase 18) -- Upload dropzone doesn't offer images yet

**Update:** fixed. `pdf-library-page.tsx`'s dropzone now accepts
`UPLOAD_CONSTRAINTS.allowedMimeTypes` (PDF + PNG/JPEG), and validates each
file against its own real backend cap (`PDF_UPLOAD_CONSTRAINTS` vs
`IMAGE_UPLOAD_CONSTRAINTS` -- the combined constant's `maxSizeBytes` is
the larger PDF figure, so using it for every file would have let an
oversized image pass client-side only to be rejected by the server).

**Problem (original, for context):** the backend accepted
`image/png`/`image/jpeg` uploads (phone photos, screenshots of a question
paper) alongside PDF, but the dropzone's file input still had
`accept="application/pdf"` and validation still checked against
`PDF_UPLOAD_CONSTRAINTS` specifically -- a user couldn't pick an image in
their file browser, and drag-and-drop (which doesn't respect `accept`)
would have incorrectly rejected a valid image before it ever reached the
server.

**Files involved:** `client/src/pages/pdf-library-page.tsx`.

---

## 6. DONE (Phase 18) -- Daily Challenge has no frontend yet; Search has a partial one

**Update:** both fixed. `hooks/use-daily-challenge.ts` +
`components/dashboard/daily-challenge-card.tsx` wire up the real
`GET /daily-challenge/today`/`/streak` endpoints, and `quiz-page.tsx` now
has a real `?mode=daily-challenge` auto-start flow that runs the
challenge's `questionIds` through the existing `QuizRunner` and reports
completion back via `POST /daily-challenge/{id}/complete`. Search:
`hooks/use-search.ts` + a rewired `command-palette.tsx` now call the real
`GET /search?q=` (debounced 250ms client-side) instead of filtering
whatever was already sitting in each list hook's React Query cache.

**Problem (original, for context):** both were real, working backend
endpoints as of the Phase 6 pass. Daily Challenge had nothing in
`client/` consuming it. The Sprint 1A command palette searched local
React Query cache instead of the real endpoint -- incomplete for anyone
who hadn't already loaded the full question bank into that cache that
session.

**Files involved:** `client/src/hooks/use-daily-challenge.ts`,
`client/src/hooks/use-search.ts`, `client/src/components/dashboard/
daily-challenge-card.tsx`, `client/src/components/search/
command-palette.tsx`, `client/src/pages/quiz-page.tsx`,
`client/src/pages/dashboard-page.tsx`, `client/src/router.tsx`.

---

None of the above blocked any pass -- everything in `MERGE_NOTES.md`
was implementable with the data/endpoints already available at the time
each pass ran. As of Phase 18, both items in this file are closed --
see `PROJECT_STATE.md`'s Phase 18 entry for what's still open more
broadly (this file only ever tracked these two specific gaps).
