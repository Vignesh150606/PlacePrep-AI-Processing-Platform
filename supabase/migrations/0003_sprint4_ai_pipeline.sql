-- =============================================================================
-- PlacePrep -- Sprint 4: AI Processing Platform
-- Run AFTER 0001 and 0002. Safe to re-run.
-- =============================================================================

alter table public.pdf_resources
  drop constraint if exists pdf_resources_processing_status_check;

alter table public.pdf_resources
  add constraint pdf_resources_processing_status_check
  check (processing_status in ('uploaded', 'queued', 'processing', 'completed', 'failed'));

create index if not exists pdf_resources_processing_status_idx
  on public.pdf_resources (processing_status);

create index if not exists pdf_resources_uploaded_by_idx
  on public.pdf_resources (uploaded_by);

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

create extension if not exists pg_trgm;

create index if not exists questions_question_text_trgm_idx
  on public.questions using gin (question_text gin_trgm_ops);

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

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added'
  ));
