-- =============================================================================
-- PlacePrep -- Phase 13: Question Authoring System.
-- Run AFTER 0001-0014. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- `questions.py` has no create endpoint at all -- every row in `questions`
-- to date came from exactly one place, `services/pipeline.py`'s AI
-- extraction run. There is no manual authoring path anywhere in the schema
-- or API. This migration adds the columns needed for three new entry
-- points (Admin Manual Builder, Student Submission, Smart Bulk Parser)
-- while reusing everything that already exists instead of duplicating it:
--   - The `questions` / `question_options` / `question_topics` /
--     `question_companies` tables themselves -- unchanged shape, just a
--     handful of new nullable/defaulted columns so AI-extracted and
--     manually-authored questions are indistinguishable to every
--     downstream consumer (Question Bank, Quiz Engine, Company Hub,
--     Analytics, Bookmarks, Wrong Answer Notebook).
--   - `services/duplicate.py` (content-hash + fuzzy similarity) and
--     `services/classification.py` (subject/topic/company get-or-create) --
--     both already generic over "some question text", not AI-pipeline
--     specific. No changes needed to either; `services/question_authoring.py`
--     (application code, not this migration) is the new thin layer that
--     calls both, shared by the AI pipeline AND all three new entry points.
--   - `admin_audit_logs` -- extended, not replaced (two new actions).
--   - `notifications` -- extended, not replaced (three new types, mirroring
--     the exact `resource-pending-review` / `resource-approved` /
--     `resource-rejected` trio Phase 10 established for `resources`).
--   - The existing "non-admins see approved OR their own regardless of
--     status" visibility rule `resources`/`interview_experiences` already
--     use (Phase 10/9) -- now extended to `questions` too, since students
--     can finally author a question that isn't immediately public.
--
-- New, because nothing existing covers it:
--   - `question_import_batches` -- one row per Smart Bulk Parser import run,
--     for the admin-facing Import History / Import Statistics screens.
--     Deliberately does NOT store the raw pasted text (keeps the table
--     light and avoids duplicating whatever the admin pasted from
--     elsewhere) -- just aggregate counts plus an optional admin-supplied
--     label (e.g. "GATE 2023 CS mock paper").
-- =============================================================================

-- --- questions: new authoring metadata ------------------------------------

alter table public.questions add column if not exists source_type text not null default 'AI';
alter table public.questions add column if not exists submission_method text;
alter table public.questions add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.questions add column if not exists reviewed_at timestamptz;
alter table public.questions add column if not exists rejection_reason text;
alter table public.questions add column if not exists image_urls text[] not null default '{}';
alter table public.questions add column if not exists attachment_urls text[] not null default '{}';
alter table public.questions add column if not exists solution_steps text;
alter table public.questions add column if not exists interview_tip text;
alter table public.questions add column if not exists reference_note text;

-- 'draft' is new (Admin Manual Builder + Smart Bulk Parser previews save
-- here before publish/import); everything else is unchanged from 0001.
alter table public.questions drop constraint if exists questions_status_check;
alter table public.questions add constraint questions_status_check
  check (status in ('draft', 'pending-review', 'approved', 'rejected'));

alter table public.questions drop constraint if exists questions_source_type_check;
alter table public.questions add constraint questions_source_type_check
  check (source_type in ('AI', 'ADMIN_MANUAL', 'STUDENT_MANUAL', 'BULK_IMPORT'));

alter table public.questions drop constraint if exists questions_submission_method_check;
alter table public.questions add constraint questions_submission_method_check
  check (submission_method is null or submission_method in ('PDF', 'IMAGE', 'TEXT', 'MANUAL'));

create index if not exists idx_questions_source_type on public.questions (source_type);
create index if not exists idx_questions_created_by on public.questions (created_by);

-- --- question_import_batches (new) ----------------------------------------

create table if not exists public.question_import_batches (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  total_detected int not null default 0,
  total_imported int not null default 0,
  total_duplicate int not null default 0,
  total_error int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_import_batches_admin on public.question_import_batches (admin_id, created_at desc);

-- --- Admin audit trail (extend, not duplicate) ----------------------------

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_action_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_action_check
  check (action in (
    'pdf-approved', 'pdf-rejected',
    'question-approved', 'question-rejected', 'question-edited',
    'question-merged', 'question-deleted',
    'interview-experience-approved', 'interview-experience-rejected',
    'interview-experience-edited', 'interview-experience-deleted',
    'user-role-changed',
    'resource-approved', 'resource-rejected', 'resource-edited', 'resource-deleted',
    'resource-bulk-approved', 'resource-bulk-rejected', 'resource-bulk-deleted',
    'alumni-verified', 'alumni-rejected', 'alumni-edited', 'alumni-suspended',
    'alumni-verification-removed', 'alumni-deleted', 'alumni-manual-created',
    'community-post-pinned', 'community-post-unpinned',
    'community-post-locked', 'community-post-unlocked',
    'community-post-edited', 'community-post-deleted',
    'community-comment-edited', 'community-comment-deleted',
    'community-report-dismissed',
    'community-user-suspended', 'community-user-unsuspended',
    'question-published', 'question-bulk-imported'
  ));

-- target_type: 'question' already existed and covers 'question-published'
-- (target_id is a real questions.id there); 'question-bulk-imported'
-- targets a question_import_batches.id instead, so it gets its own value
-- rather than reusing 'question' for an id that isn't actually one.
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check
  check (target_type in (
    'pdf', 'question', 'interview-experience', 'user', 'resource', 'alumni',
    'community-post', 'community-comment', 'question-import-batch'
  ));

-- --- Notifications (extend, not duplicate) --------------------------------
-- Mirrors the exact resource-pending-review/resource-approved/resource-rejected
-- trio Phase 10 introduced -- same shape, new noun.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added',
    'upload-pending-approval', 'upload-approved', 'upload-rejected',
    'resource-pending-review', 'resource-approved', 'resource-rejected',
    'alumni-verification-pending', 'alumni-verified', 'alumni-rejected', 'alumni-suspended',
    'community-post-reported', 'community-comment-reported', 'community-account-suspended',
    'question-pending-review', 'question-approved', 'question-rejected'
  ));

-- --- RLS -------------------------------------------------------------------
-- Every real write goes through the service-role client and bypasses RLS
-- (same as every other table in this system, see questions.py's own
-- docstring) -- these are defense-in-depth, written to match the actual
-- visibility rules questions.py now enforces in application code.

drop policy if exists "questions_select_approved_or_admin" on public.questions;
create policy "questions_select_approved_or_admin" on public.questions
  for select using (status = 'approved' or created_by = auth.uid() or public.is_admin());

drop policy if exists "questions_insert_own" on public.questions;
create policy "questions_insert_own" on public.questions
  for insert with check (created_by = auth.uid());

drop policy if exists "questions_write_admin" on public.questions;
create policy "questions_write_admin" on public.questions
  for update using (public.is_admin()) with check (public.is_admin());

alter table public.question_import_batches enable row level security;

drop policy if exists "question_import_batches_admin_only" on public.question_import_batches;
create policy "question_import_batches_admin_only" on public.question_import_batches
  for select using (public.is_admin());

drop policy if exists "question_import_batches_insert_admin" on public.question_import_batches;
create policy "question_import_batches_insert_admin" on public.question_import_batches
  for insert with check (public.is_admin());
