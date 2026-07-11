-- =============================================================================
-- PlacePrep -- Sprint 4 completion: extraction pipeline fixes
-- Run AFTER 0001-0003. Safe to re-run.
-- =============================================================================

alter table public.questions
  add column if not exists page_number int;

alter table public.processing_jobs
  add column if not exists ocr_used boolean not null default false;

alter table public.processing_jobs
  add column if not exists chunk_count int not null default 1;
