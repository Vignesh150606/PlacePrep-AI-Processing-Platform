# PlacePrep Project State

Last updated: 2026-07-03

## Current Status

Sprint 4 — AI Processing Platform: **code-complete, blocked on a Gemini API
key for live end-to-end verification.**

⚠️ **Note on this file**: it was last updated after Sprint 1A (frontend
shell, mock data only) and was never updated for the backend/auth/DB/storage
work that clearly happened afterward (`supabase/migrations/0001` and `0002`,
a working FastAPI app with JWT verification, Google OAuth via Supabase Auth,
a real `/profiles/me` endpoint, RLS policies, and storage buckets — none of
which this file mentioned). Treat gaps between this file and the actual code
as this file being wrong, not the code. This update also backfills the
milestones that undocumented sprint actually completed, to the extent
inferable from the code itself.

## Milestones (original 22-milestone roadmap)

- [x] 1. Project Foundation — root workspace, pnpm, `client`/`shared`/`server` packages
- [x] 2. Frontend App Shell — Sidebar, TopNav, MobileNav, Breadcrumbs, theme system
- [x] 3. Backend Foundation — FastAPI app, config, JWT verification, Supabase admin client, exception/response envelope conventions
- [x] 4. Shared Contracts — `shared/src/types/`, consumed by both client and (conceptually, via matching Pydantic schemas) the backend
- [x] 5. Authentication — Google OAuth via Supabase Auth, protected routes, JWT-verified backend dependency
- [x] 6. Database — full schema (`0001_sprint3_schema.sql`), extended this sprint (`0003_sprint4_ai_pipeline.sql`)
- [x] 7. Storage — `pdfs`/`avatars`/`interview-images` buckets + RLS (`0002_sprint3_rls_storage.sql`)
- [x] 8. PDF Upload — `POST /api/v1/pdfs/upload`, built this sprint (no prior upload endpoint existed despite earlier claims — see Known Gaps)
- [~] 9. AI Extraction — **full pipeline built this sprint** (Steps 1-11 of the sprint brief); untested end-to-end pending a real `GEMINI_API_KEY`
- [~] 10. Question Management — UI still on mock data; the pipeline now writes real rows to `questions`/`question_options`/`question_topics`/`question_companies`, but the Question Bank page hasn't been switched over yet (next sprint)
- [~] 11. Quiz Engine — unchanged this sprint (mock data)
- [~] 12. Quiz Attempt — unchanged this sprint (mock data)
- [ ] 13. Wrong Answer Notebook
- [ ] 14. Bookmarks (standalone page)
- [~] 15. Interview Experiences — unchanged this sprint
- [~] 16. Company Pages — unchanged this sprint; `companies` rows can now also be auto-created by the classification step
- [ ] 17. Search (global/unified)
- [x] 18. Dashboard — unchanged this sprint (still mock `RecentPdfsCard`; see Known Gaps)
- [x] 19. Notifications — **built this sprint**: real `notifications` rows + `NotificationCenter` wired to `/api/v1/notifications` (was mock-only)
- [~] 20. Polish — unchanged
- [ ] 21. Testing
- [ ] 22. Docker / Final Review

Legend: [x] done for this sprint's scope · [~] partially built · [ ] not started

## What Was Built This Sprint (AI Processing Platform)

**Architecture** — `AIService -> AIProvider -> GeminiProvider`
(`server/app/services/ai/`). The pipeline only depends on the `AIProvider`
interface (`base.py`); adding OpenAI/Claude/Llama later is one new provider
class + one line in `service.py`, no pipeline changes.

**Pipeline** (`server/app/services/pipeline.py`) — implements the full chain
from the brief: Queued → Processing → AI Extraction → Validation → Duplicate
Detection → Classification → Storage → Cleanup → Notification. Runs as a
FastAPI `BackgroundTask` per upload/retry (see Technical Debt — this is a
deliberate scope cut, not an oversight).

**Supporting services**:
- `pdf_text.py` — `pypdf`-based text extraction, feeds the provider-agnostic pipeline
- `duplicate.py` — exact `content_hash` match + `rapidfuzz` fuzzy match against a bounded candidate set
- `classification.py` — upserts `companies`/`subjects`/`topics`, applies the confidence threshold to gate `approved` vs `pending-review`
- `notifications.py` — thin insert wrapper for the four notification types

**API** (`server/app/api/v1/endpoints/`):
- `pdfs.py` — `GET /pdfs`, `POST /pdfs/upload`, `POST /pdfs/{id}/retry`, `PATCH /pdfs/{id}/keep-permanent` (admin)
- `processing.py` — `GET /processing/dashboard`, `GET /processing/jobs` (admin-gated)
- `notifications.py` — `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`

**Database** (`supabase/migrations/0003_sprint4_ai_pipeline.sql`) —
5-state `processing_status` (aligned to `shared/PdfProcessingStatus`, which
already modeled 5 states even though `0001`'s SQL had 6 — SQL was the one
that was wrong); `confidence_score`/`ai_provider`/`extraction_notes` on
`questions`; `pg_trgm` + trigram index for fuzzy dedup; new `processing_jobs`
table (one row per extraction attempt) with RLS; widened `notifications`
type enum.

**Frontend** — `client/src/pages/pdf-library-page.tsx` replaces the
`ComingSoonPage` placeholder at `/pdfs`: upload dropzone, status-tracked
list (polls while anything is queued/processing), retry action, and — for
admins — a `keep_permanent` toggle and a Processing Dashboard tab
(job counts, extracted/duplicate/review stats, recent jobs with retry).
First real API integration in the frontend beyond auth:
`client/src/lib/api-client.ts` (Supabase-JWT-bearing fetch wrapper) +
`use-pdfs.ts`/`use-processing.ts`/`use-notifications.ts`/`use-profile.ts`
query hooks.

## Technical Debt (intentionally postponed)

- **BackgroundTasks, not a real queue.** Extraction runs in-process via
  FastAPI's `BackgroundTask`. It does not survive a server restart mid-job,
  does not scale across multiple worker processes, and has no scheduled
  auto-retry (retries are manual, via the dashboard/PDF list "Retry"
  button, which is why Step 9's "Retry Failed Jobs" is a button rather than
  automatic). Move to Celery/RQ/arq + Redis (or a Supabase Edge Function
  cron) before this needs to handle concurrent load.
- **Dashboard aggregates computed in Python**, not SQL (`processing.py`
  fetches bounded row sets and sums/averages in-process). Fine at current
  scale; replace with a Postgres view/RPC before it needs to scale past a
  few thousand questions/jobs.
- **Fuzzy duplicate detection is in-process rapidfuzz**, not SQL-side
  `pg_trgm` similarity, even though the trigram index now exists. Simpler to
  ship this sprint; revisit if the candidate-set bound (300 rows) becomes a
  real limiter.
- **No OCR.** Scanned/image-only PDFs fail extraction with a clear error
  (`pdf_text.py`) instead of silently producing zero questions. Deliberate
  cut, not a bug.
- **Question Bank page still reads mock data.** The pipeline now populates
  real `questions` rows (including `pending-review` ones awaiting admin
  approval), but `question-bank-page.tsx` hasn't been switched from
  `mocks/questions.ts` to the API yet — that's the natural start of next
  sprint, not part of "AI Processing Platform."
- **Dashboard's `RecentPdfsCard` still reads `mocks/pdfs.ts`.** Same reasoning
  as above — swapping it to `usePdfs()` is a five-minute follow-up, scoped
  out here to keep this sprint's diff focused on the pipeline itself.
- **No signed-URL file viewing.** `PDFResource.storageUrl` is always `null`
  from the API today — there's no "view/download the original PDF" affordance
  yet (most PDFs are deleted post-extraction anyway per the storage policy;
  `KEEP_PERMANENT` ones could get a signed-URL endpoint later).
- **Admin role check re-queries `profiles` per request** rather than
  embedding a role claim in the JWT. Correct-but-slower; fine at this scale.

## Security Note

`server/.env` (present in the uploaded project) contains live Supabase
project credentials, including the secret/service-role key. That file was
visible in this session. If this repository or zip is ever shared,
committed, or uploaded anywhere else, rotate the Supabase keys first
(Project Settings → API in the Supabase dashboard).

## External Configuration Needed Now

- **`GEMINI_API_KEY`** — the one blocker on fully verifying this sprint.
  Set it in `server/.env` (see the setup guide provided alongside this
  update) and restart the FastAPI server; nothing else changes.

## Verification Log

- Backend: `ruff check app/` — pass, 0 issues. App imports and boots cleanly
  with all new routes registered (verified via `from app.main import app`
  in a fresh venv with the updated `requirements.txt` installed).
- Frontend: `pnpm -r typecheck` — pass, 0 errors (including one **pre-existing**
  route-id typo in `company-detail-page.tsx` fixed as part of this sprint's
  quality pass — unrelated to the AI pipeline, but required for a clean build).
- Frontend: `oxlint src` — pass, 0 errors (1 pre-existing warning in
  `main.tsx`, unrelated, left as-is).
- Frontend: `vite build` — pass (same bundle-size warning as Sprint 1A;
  unrelated to this sprint).
- **Not yet run**: a real upload → Gemini extraction → stored questions
  round-trip. Requires `GEMINI_API_KEY`.
