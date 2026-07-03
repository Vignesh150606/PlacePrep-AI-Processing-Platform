-- =============================================================================
-- PlacePrep — Sprint 4: AI Processing Platform
-- Run this in the Supabase SQL Editor AFTER 0001 and 0002 have succeeded.
-- Safe to re-run: every statement is idempotent.
--
-- What this adds:
--   1. Aligns pdf_resources.processing_status to the 5-state lifecycle the
--      frontend (`PdfProcessingStatus` in shared/) already models. 0001 had
--      an extra 'extracting' state that never made it into the shared type
--      — dropped here rather than adding it to the frontend, since
--      UPLOADED/QUEUED/PROCESSING/COMPLETED/FAILED is the contract this
--      sprint is required to implement on both sides.
--   2. Confidence + provenance columns on `questions` for the classification
--      step (Step 7) and duplicate-review flagging.
--   3. pg_trgm for fuzzy duplicate detection (Step 6) alongside the existing
--      exact-match `content_hash` unique constraint.
--   4. `processing_jobs` — one row per extraction attempt, giving the
--      dashboard (Step 9) queued/running/completed/failed counts and a
--      retry target, independent of the PDF's own current status.
--   5. Widens the `notifications` type enum for the extraction lifecycle
--      (Step 11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pdf_resources.processing_status — 5 states, matching shared/PdfProcessingStatus
-- -----------------------------------------------------------------------------
alter table public.pdf_resources
  drop constraint if exists pdf_resources_processing_status_check;

alter table public.pdf_resources
  add constraint pdf_resources_processing_status_check
  check (processing_status in ('uploaded', 'queued', 'processing', 'completed', 'failed'));

create index if not exists pdf_resources_processing_status_idx
  on public.pdf_resources (processing_status);

create index if not exists pdf_resources_uploaded_by_idx
  on public.pdf_resources (uploaded_by);

-- -----------------------------------------------------------------------------
-- 2. questions — confidence + provenance
-- -----------------------------------------------------------------------------
alter table public.questions
  add column if not exists confidence_score numeric(4, 3) not null default 1.0
    check (confidence_score >= 0 and confidence_score <= 1);

alter table public.questions
  add column if not exists ai_provider text;

alter table public.questions
  add column if not exists extraction_notes text;

create index if not exists questions_source_pdf_id_idx
  on public.questions (source_pdf_id);

create index if not exists questions_status_idx
  on public.questions (status);

-- -----------------------------------------------------------------------------
-- 3. Fuzzy duplicate detection — content_hash already catches byte-identical
--    text; trigram similarity catches near-duplicates (reworded options,
--    OCR noise) that hashing can't.
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists questions_question_text_trgm_idx
  on public.questions using gin (question_text gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 4. processing_jobs — one row per extraction attempt on a PDF.
--    `pdf_resources.processing_status` is the PDF's current state; this
--    table is the append-ish history that lets the dashboard show attempts,
--    retries, and per-attempt stats without overloading that single column.
-- -----------------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  pdf_resource_id uuid not null references public.pdf_resources (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  questions_extracted int not null default 0,
  duplicates_found int not null default 0,
  low_confidence_count int not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_processing_jobs_updated_at on public.processing_jobs;
create trigger trg_processing_jobs_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_updated_at();

create index if not exists processing_jobs_pdf_resource_id_idx
  on public.processing_jobs (pdf_resource_id);

create index if not exists processing_jobs_status_idx
  on public.processing_jobs (status);

alter table public.processing_jobs enable row level security;

drop policy if exists "processing_jobs_select_own_or_admin" on public.processing_jobs;
create policy "processing_jobs_select_own_or_admin" on public.processing_jobs
  for select using (
    exists (
      select 1 from public.pdf_resources p
      where p.id = pdf_resource_id
        and (p.uploaded_by = auth.uid() or public.is_admin())
    )
  );

-- No insert/update/delete policy for `processing_jobs`: every write goes
-- through the backend's service-role client (see app/core/supabase_client.py),
-- which bypasses RLS by design — same pattern as every other write path in
-- this schema.

-- -----------------------------------------------------------------------------
-- 5. notifications — widen the type enum for the extraction lifecycle
-- -----------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added'
  ));
