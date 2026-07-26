-- =============================================================================
-- PlacePrep -- Phase 18: Company Admin Management.
-- Run AFTER 0001-0020. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- `companies.py` was, until this phase, deliberately read-only -- its own
-- docstring said so explicitly ("there's no create/update endpoint here,
-- since admin-managed company profiles are a later feature"). Companies
-- were only ever auto-upserted by the classification step during PDF
-- extraction (see services/classification.py), with no way for an admin
-- to create one directly, fix a typo'd name, merge an accidental
-- duplicate, or remove one that shouldn't be in the directory. This
-- migration adds exactly what that later feature needs -- nothing more.
--
-- Deliberately a SMALLER lifecycle than questions/resources
-- (migrations 0016/0017): a company never goes through
-- draft -> pending-review -> approved/rejected -- there's no review queue,
-- it's either live in the directory or archived out of it. So this is a
-- two-state `status` ('active' | 'archived'), reusing the exact same
-- `archived_at`/`archived_by`/`deleted_at`/`deleted_by` column shape (and
-- the shared `lifecycle.py` archive_row/unarchive_row/soft_delete_row/
-- restore_row/permanent_delete_row helpers, via their `status_column`/
-- `require_status`/`restore_status` parameters) rather than inventing a
-- third variant of the same idea.
-- =============================================================================

-- --- companies: status + archive + soft delete + updated_at ----------------

alter table public.companies add column if not exists status text not null default 'active';
alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('active', 'archived'));

alter table public.companies add column if not exists archived_at timestamptz;
alter table public.companies add column if not exists archived_by uuid references public.profiles (id) on delete set null;
alter table public.companies add column if not exists deleted_at timestamptz;
alter table public.companies add column if not exists deleted_by uuid references public.profiles (id) on delete set null;
alter table public.companies add column if not exists updated_at timestamptz not null default now();

-- Reuses `set_updated_at()` (defined in migration 0001 for `profiles`) --
-- same trigger shape, new table, not a second copy of the function.
drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Backs the near-universal `deleted_at is null` / `status = 'active'`
-- filter every non-admin-facing query needs (`GET /companies`, `GET
-- /search`, the quiz-config/question-authoring/resource-submission/
-- alumni-profile company pickers), same reasoning as migration 0016's
-- equivalent indexes for `questions`.
create index if not exists idx_companies_status on public.companies (status);
create index if not exists idx_companies_archived_at on public.companies (archived_at);
create index if not exists idx_companies_deleted_at on public.companies (deleted_at);

-- --- Admin audit trail (extend, not duplicate) ------------------------------

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check
  check (target_type in (
    'pdf', 'question', 'interview-experience', 'user', 'resource', 'alumni',
    'community-post', 'community-comment', 'question-import-batch',
    -- Phase 18 (new):
    'company'
  ));

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
    'question-archived', 'question-unarchived', 'question-restored',
    'question-permanently-deleted', 'question-bulk-updated',
    'question-bulk-approved', 'question-bulk-rejected', 'question-bulk-published',
    'question-bulk-archived', 'question-bulk-unarchived', 'question-bulk-restored',
    'question-bulk-deleted', 'question-bulk-permanently-deleted',
    'resource-archived', 'resource-unarchived', 'resource-restored',
    'resource-permanently-deleted', 'resource-bulk-updated',
    'resource-bulk-archived', 'resource-bulk-unarchived', 'resource-bulk-restored',
    'resource-bulk-permanently-deleted',
    -- Phase 18 (new): Company Admin Management.
    'company-created', 'company-edited', 'company-archived', 'company-unarchived',
    'company-deleted', 'company-restored', 'company-permanently-deleted',
    'company-merged',
    'company-bulk-archived', 'company-bulk-unarchived', 'company-bulk-deleted',
    'company-bulk-restored', 'company-bulk-permanently-deleted'
  ));

-- --- Bookmarks: already allow target_type = 'company' (migration 0011) --
-- nothing to change there; a merged-away company's bookmarks are handled
-- in application code (company_merge.py), same shape as
-- question_merge.py's bookmark reassignment.
