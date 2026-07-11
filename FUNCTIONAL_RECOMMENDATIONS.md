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

## 5. NEW -- Upload dropzone doesn't offer images yet

**Problem:** the backend now accepts `image/png`/`image/jpeg` uploads
(phone photos, screenshots of a question paper) alongside PDF, but
`pdf-library-page.tsx`'s file input still has
`accept="application/pdf"` and `UploadDropzone`'s validation still checks
against `PDF_UPLOAD_CONSTRAINTS` specifically -- a user can't actually
pick an image in their file browser, and if they somehow did (e.g.
drag-and-drop, which doesn't respect `accept`), the client-side size/type
check would incorrectly reject a valid image upload before it ever
reaches the server.

**Suggested implementation:** swap the `accept` attribute and the
validation constant to the new `UPLOAD_CONSTRAINTS` (combined PDF+image)
exported from `shared/src/types/file-upload.ts` -- this was added
specifically so this swap is a constant change, not a hand-written MIME
list.

**Files likely involved:** `client/src/pages/pdf-library-page.tsx`.

---

## 6. NEW -- Daily Challenge has no frontend yet; Search has a partial one

**Problem:** both are real, working backend endpoints as of the Phase 6
pass (`GET /daily-challenge/today`, `POST /daily-challenge/{id}/complete`,
`GET /daily-challenge/streak`, `GET /search?q=`). Daily Challenge still
has nothing in `client/` consuming it, and the nav still has a "Daily
Challenge"-shaped gap (per `nav-items.ts`'s existing structure).

**Update (Sprint 1A frontend integration pass):** `TopNav`'s `SearchBar`
now opens a real ⌘K command palette (`components/search/command-palette.tsx`)
instead of sitting decorative with nothing behind it. It is **not yet**
wired to `GET /search?q=` -- it searches whatever's already sitting in
each of `useQuestions()`/`useCompanies()`/`usePdfs()`'s React Query
cache. Fine at this app's current data volume; see `MERGE_NOTES.md`
Part 3 and `PROJECT_STATE.md`'s Phase 7 list for the follow-up to switch
it over to the real endpoint (debounced, server-side, no page-size
ceiling).

**Suggested implementation (Daily Challenge, still open):** a
`DailyChallengeCard` (dashboard, plus maybe its own page) that calls
`GET .../today`, runs it through the existing `QuizRunner` using its
`questionIds`, then calls `POST .../complete` with the resulting
`quizAttemptId`.

**Files likely involved:** new `hooks/use-daily-challenge.ts` and
`hooks/use-search.ts` (the latter to replace the command palette's
client-cache filtering with a real debounced `GET /search?q=` call), a
new dashboard card or page for Daily Challenge.

---

None of the above blocked any pass -- everything in `MERGE_NOTES.md`
was implementable with the data/endpoints already available at the time
each pass ran.
