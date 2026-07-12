-- =============================================================================
-- PlacePrep -- Phase 7: AI extraction reliability fixes + upload approval
-- workflow.
-- Run AFTER 0001-0006. Safe to re-run.
--
-- Backing schema changes for two things done in this pass:
--   1. Upload approval gate: a fresh upload no longer queues the AI
--      pipeline immediately (see server/app/api/v1/endpoints/pdfs.py's
--      module docstring). It now lands in 'pending-approval' and stays
--      there until an admin explicitly approves or rejects it.
--   2. `processing_jobs.failed_chunk_count`: previously, an AI-call
--      failure on a chunk was silently swallowed and indistinguishable
--      from "no MCQs in this chunk" -- this column lets the admin
--      dashboard show it as a real, separate number (see
--      server/app/services/pipeline.py's Phase 7 fix).
-- =============================================================================

-- --- Upload approval workflow -------------------------------------------------
alter table public.pdf_resources
  drop constraint if exists pdf_resources_processing_status_check;

alter table public.pdf_resources
  add constraint pdf_resources_processing_status_check
  check (processing_status in (
    'uploaded', 'pending-approval', 'queued', 'processing', 'completed', 'failed', 'rejected'
  ));

alter table public.pdf_resources
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

alter table public.pdf_resources
  add column if not exists reviewed_at timestamptz;

alter table public.pdf_resources
  add column if not exists rejection_reason text;

create index if not exists idx_pdf_resources_reviewed_by on public.pdf_resources (reviewed_by);

-- --- Chunk-failure visibility (Critical Issue 1) ------------------------------
alter table public.processing_jobs
  add column if not exists failed_chunk_count int not null default 0;

-- --- New notification types for the approval workflow -------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added',
    'upload-pending-approval', 'upload-approved', 'upload-rejected'
  ));
