-- =============================================================================
-- PlacePrep -- Phase 15 (Part 2, Slice A): Resource Lifecycle Management.
-- Run AFTER 0001-0016. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- `resources.status` (migration 0012) only ever covered pending-review ->
-- approved/rejected -- there was no "archived" state and no soft delete;
-- `DELETE /resources/{id}` (resources.py's `_delete_resource`) did a real
-- `delete()` plus best-effort storage cleanup. This migration reuses
-- EXACTLY the shape migration 0016 already established for `questions` --
-- same two nullable column pairs, same reasoning for why there is no
-- separate "published" status (resources never had one to begin with --
-- `'approved'` already means "live" everywhere `resources.py`'s own
-- `list_resources`/`_visible_or_404` check it), same "extend the audit
-- check constraint, don't replace it" approach. See
-- `app/services/lifecycle.py` (new this pass) for the shared archive/
-- restore/soft-delete/permanent-delete helpers both `questions.py` (now
-- refactored to call it, Part 1 behavior unchanged) and `resources.py`
-- (new this pass) call into -- Feature 8, "Shared Lifecycle Framework".
-- =============================================================================

-- --- resources: archive + soft delete --------------------------------------

alter table public.resources add column if not exists archived_at timestamptz;
alter table public.resources add column if not exists archived_by uuid references public.profiles (id) on delete set null;
alter table public.resources add column if not exists deleted_at timestamptz;
alter table public.resources add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

-- 'archived' is new; 'pending-review'/'approved'/'rejected' are unchanged
-- from 0012. Soft delete is deliberately NOT a status value here either --
-- same reasoning as questions: `deleted_at` is independent of `status`, so
-- a pending, approved, rejected, or archived resource can each be deleted
-- and later restored back to whichever status it actually had.
alter table public.resources drop constraint if exists resources_status_check;
alter table public.resources add constraint resources_status_check
  check (status in ('pending-review', 'approved', 'rejected', 'archived'));

-- Backs the near-universal `deleted_at is null` filter `list_resources`'s
-- shared filter builder now applies (see resources.py), and the inverse
-- `deleted_at is not null` query the admin "Deleted" tab uses -- same
-- pair migration 0016 added for `questions`.
create index if not exists idx_resources_deleted_at on public.resources (deleted_at);
create index if not exists idx_resources_archived_at on public.resources (archived_at);

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
    -- Phase 15, Part 1 -- Question Lifecycle Management:
    'question-archived', 'question-unarchived', 'question-restored',
    'question-permanently-deleted', 'question-bulk-updated',
    'question-bulk-approved', 'question-bulk-rejected', 'question-bulk-published',
    'question-bulk-archived', 'question-bulk-unarchived', 'question-bulk-restored',
    'question-bulk-deleted', 'question-bulk-permanently-deleted',
    -- Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management (new):
    'resource-archived', 'resource-unarchived', 'resource-restored',
    'resource-permanently-deleted', 'resource-bulk-updated',
    'resource-bulk-archived', 'resource-bulk-unarchived', 'resource-bulk-restored',
    'resource-bulk-permanently-deleted'
  ));

-- target_type is unchanged -- every new action above targets a real
-- `resources.id` (or, for the bulk actions, the first succeeded id, same
-- convention every other bulk action in this table already follows), so
-- the existing 'resource' value already covers all of them.
