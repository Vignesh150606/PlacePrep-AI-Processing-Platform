-- =============================================================================
-- PlacePrep — Sprint 4 completion: extraction pipeline fixes
-- Run AFTER 0001-0003. Safe to re-run.
--
-- Backs the four traced causes of "extracts zero questions from MCQ PDFs":
--   - questions.page_number       (prompt now asks Gemini for page number)
--   - processing_jobs.ocr_used    (scanned-PDF OCR fallback, services/ocr.py)
--   - processing_jobs.chunk_count (large-PDF chunking, services/chunking.py)
-- See server/app/services/pipeline.py for how these get populated.
-- =============================================================================

alter table public.questions
  add column if not exists page_number int;

alter table public.processing_jobs
  add column if not exists ocr_used boolean not null default false;

alter table public.processing_jobs
  add column if not exists chunk_count int not null default 1;
