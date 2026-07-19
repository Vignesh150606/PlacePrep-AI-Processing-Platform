-- =============================================================================
-- PlacePrep -- Phase 15 (Part 1): Question Lifecycle Management.
-- Run AFTER 0001-0015. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- `questions.status` already covers draft -> pending-review -> approved/
-- rejected (migration 0015); there was no "archived" state and no soft
-- delete anywhere in the schema -- `DELETE /questions/{id}` (questions.py)
-- did a real `delete()`, relying on `question_options`/`question_topics`/
-- `question_companies`'s ON DELETE CASCADE to clean up. This migration adds
-- exactly the two things the brief's lifecycle diagram needs that don't
-- already exist -- archive and soft delete -- reusing everything else:
--   - 'published' is NOT a new status value: `PATCH /questions/{id}/publish`
--     (Phase 13) already moves a draft straight to 'approved', and every
--     downstream consumer (Question Bank, Quiz Engine, Company Hub,
--     Analytics, Search, Daily Challenge) already treats 'approved' as
--     "live". Adding a second, functionally-identical status would be a
--     duplicate concept, not a new one -- see questions.py's docstring on
--     `publish_question` for where this equivalence was already established.
--   - `admin_audit_logs` -- extended, not replaced (new archive/restore/
--     permanent-delete/bulk-update actions; 'question-deleted' already
--     existed and is reused for the now-soft delete).
--   - Bulk operations reuse the exact `resources.py` bulk-action shape
--     (one endpoint, an `action` enum, loop-and-collect succeeded/failed,
--     one summary audit entry per batch) rather than inventing a new
--     pattern for questions specifically.
-- =============================================================================

-- --- questions: archive + soft delete --------------------------------------

alter table public.questions add column if not exists archived_at timestamptz;
alter table public.questions add column if not exists archived_by uuid references public.profiles (id) on delete set null;
alter table public.questions add column if not exists deleted_at timestamptz;
alter table public.questions add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

-- 'archived' is new; everything else is unchanged from 0015. Soft delete is
-- deliberately NOT a status value -- `deleted_at` is independent of
-- `status`, so a draft, an approved, or an archived question can each be
-- deleted and later restored back to whichever status it actually had.
alter table public.questions drop constraint if exists questions_status_check;
alter table public.questions add constraint questions_status_check
  check (status in ('draft', 'pending-review', 'approved', 'rejected', 'archived'));

-- Soft-deleted questions must disappear from the Question Bank, Quiz Engine,
-- Company pages, Analytics, and Search by default (see questions.py's
-- `_apply_server_side_filters`, search.py, daily_challenge.py) -- this index
-- backs that near-universal `deleted_at is null` filter, and the inverse
-- `deleted_at is not null` query the admin "Deleted" tab uses.
create index if not exists idx_questions_deleted_at on public.questions (deleted_at);
create index if not exists idx_questions_archived_at on public.questions (archived_at);

-- --- Admin audit trail (extend, not duplicate) ------------------------------

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
    'question-published', 'question-bulk-imported',
    -- Phase 15, Part 1 -- Question Lifecycle Management (new):
    'question-archived', 'question-unarchived', 'question-restored',
    'question-permanently-deleted', 'question-bulk-updated',
    'question-bulk-approved', 'question-bulk-rejected', 'question-bulk-published',
    'question-bulk-archived', 'question-bulk-unarchived', 'question-bulk-restored',
    'question-bulk-deleted', 'question-bulk-permanently-deleted'
  ));

-- target_type is unchanged -- every new action above targets a real
-- `questions.id` (or, for the bulk actions, the first succeeded id, same
-- convention `resources.py`'s bulk-action already established), so the
-- existing 'question' value already covers all of them.
