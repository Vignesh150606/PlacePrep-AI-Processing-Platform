-- =============================================================================
-- PlacePrep -- Fix: questions.confidence_score must allow NULL for
-- non-AI-authored questions.
-- Run AFTER 0018. Safe to re-run.
-- =============================================================================
--
-- Root cause: migration 0003 added `confidence_score numeric(4,3) not null
-- default 1.0` back when the AI extraction pipeline (`services/pipeline.py`)
-- was the ONLY thing that ever created a `questions` row. Phase 13
-- (`services/question_authoring.py`, migration 0015) later added three more
-- creation paths -- Admin Manual Builder, Student Submission, and the Smart
-- Bulk Parser -- none of which have an AI confidence score to record, so
-- `create_question_record()`'s `confidence_score` parameter defaults to
-- `None` for all of them. That was never a mistake in the Python code: the
-- dashboard stats endpoint (`api/v1/endpoints/processing.py`) already
-- filters `if row.get("confidence_score") is not None` when averaging AI
-- confidence, i.e. the application was ALREADY written expecting non-AI
-- rows to have a NULL score here. The column itself was just never updated
-- to match once those other creation paths existed, so every insert from
-- any of them has been writing an explicit NULL into a NOT NULL column and
-- failing outright with "null value in column confidence_score violates
-- not-null constraint" -- for every single row, on every Admin Manual
-- Builder save, Student Submission, and Bulk Import, since Phase 13 shipped.
--
-- (Deliberately not defaulting non-AI confidence_score to 1.0 in Python
-- instead of doing this migration: that would "fix" the crash but silently
-- feed fake 1.0 values from every human-authored question into the
-- dashboard's average-AI-confidence metric, corrupting a real signal to
-- paper over a schema bug.)

alter table public.questions
  alter column confidence_score drop not null;

alter table public.questions
  alter column confidence_score drop default;

comment on column public.questions.confidence_score is
  'AI extraction confidence (0-1). NULL for questions from a non-AI source '
  '(source_type = ADMIN_MANUAL / STUDENT_MANUAL / BULK_IMPORT), which have '
  'no confidence score to record -- NOT the same as a low/zero-confidence '
  'AI extraction.';
