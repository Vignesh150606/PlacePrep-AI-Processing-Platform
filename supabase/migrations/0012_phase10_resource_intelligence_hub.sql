-- =============================================================================
-- PlacePrep -- Phase 10: Resource Intelligence Hub.
-- Run AFTER 0001-0011. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- `pdf_resources` already covers "PDF Notes" uploaded specifically to feed
-- the AI question-extraction pipeline, but there was no genuinely generic
-- resource table -- confirmed by grep, zero matches for "resources" (the
-- standalone table, not "pdf_resources") across every prior migration.
-- This is a ground-up build for a NEW table, reusing every adjacent system
-- instead of duplicating it:
--   - Storage: reuses the EXISTING 'pdfs' bucket and its EXISTING RLS
--     policies (migration 0002) -- a resource file is stored at
--     `{uploader_id}/{uuid}.{ext}`, identical to how pdf_resources already
--     stores files, so `pdfs_insert_own_folder` / `pdfs_select_authenticated`
--     / `pdfs_delete_own_or_admin` apply unchanged. No new bucket, no new
--     storage policy.
--   - Bookmarks: reuses the EXISTING generic `bookmarks` table
--     (target_type = 'resource') rather than a parallel system -- see
--     migration 0011's identical reasoning for `target_type = 'company'`.
--   - Moderation shape: reuses the exact pending-review/approved/rejected
--     status lifecycle `interview_experiences` (migration 0009) already
--     established, plus the reviewed_by/reviewed_at/rejection_reason
--     columns `pdf_resources` (migration 0007) already established.
--   - Admin audit trail: extends the EXISTING `admin_audit_logs` table
--     (migration 0010) with resource-specific actions + a 'resource'
--     target_type, instead of a second audit table.
--   - Taxonomy: tags every resource against the EXISTING `subjects` /
--     `topics` / `companies` tables (all migration 0001) rather than
--     inventing a new classification scheme.
--
-- Two genuinely new pieces of real (not cosmetic) logic:
--   1. `bookmark_count` is a denormalized column kept in sync by a trigger
--      on `bookmarks` (scoped to target_type = 'resource' only -- every
--      other target_type is untouched). This is a deliberate departure from
--      `interview_experience_votes`' "always compute fresh, never
--      denormalize" approach (see that module's docstring) -- votes are
--      never *sorted or paginated by*, but "Most Bookmarked" is an explicit
--      required sort option here, and sorting/paginating a DB query by a
--      count that lives in a different table needs either this trigger or
--      an expensive per-page aggregation join. The trigger is atomic
--      (a single `UPDATE ... WHERE id = ...` per bookmark insert/delete),
--      so there's no read-modify-write race to worry about, unlike the
--      bug `bulk_increment_question_stats` (migration 0006) had to fix.
--   2. `increment_resource_downloads()` -- same atomic-RPC pattern as
--      `bulk_increment_question_stats`, for the same reason: a plain
--      SELECT-then-UPDATE from the API layer would be a real (if low-odds)
--      race between two simultaneous downloads of the same resource.
-- =============================================================================

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in (
    'company', 'subject', 'topic', 'aptitude', 'technical', 'interview',
    'cheat-sheet', 'formula-sheet', 'roadmap', 'previous-paper',
    'external-link', 'video', 'pdf-notes'
  )),
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  tags text[] not null default '{}',
  -- Credited creator/source of the material -- free text, deliberately
  -- distinct from `uploaded_by`: the person submitting a resource to
  -- PlacePrep is very often not the person who originally wrote it (e.g.
  -- a senior's shared cheat sheet, a public roadmap, a YouTube video).
  author text,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  -- Exactly one of these two must be set (see the check constraint below):
  -- an uploaded file (cheat sheets/formula sheets/roadmaps/previous papers/
  -- PDF notes are typically this) or an external link (videos, external
  -- articles/roadmaps are typically this).
  file_storage_path text unique,
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  file_kind text check (file_kind in ('pdf', 'image')),
  external_url text,
  -- Real revision counter -- incremented by the API only when an admin
  -- edit actually changes a field (see resources.py's `update_resource`),
  -- never fabricated or bumped on a no-op save.
  version int not null default 1,
  status text not null default 'pending-review'
    check (status in ('pending-review', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  -- Denormalized, trigger-maintained (see `sync_resource_bookmark_count`
  -- below) -- needed for real DB-side "Most Bookmarked" sorting/pagination,
  -- not just display.
  bookmark_count int not null default 0,
  -- Denormalized, RPC-incremented (see `increment_resource_downloads`
  -- below) -- same real-count reasoning as bookmark_count.
  download_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_has_content check (file_storage_path is not null or external_url is not null)
);

drop trigger if exists trg_resources_updated_at on public.resources;
create trigger trg_resources_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

create index if not exists idx_resources_category on public.resources (category);
create index if not exists idx_resources_status on public.resources (status);
create index if not exists idx_resources_company_id on public.resources (company_id);
create index if not exists idx_resources_subject_id on public.resources (subject_id);
create index if not exists idx_resources_topic_id on public.resources (topic_id);
create index if not exists idx_resources_uploaded_by on public.resources (uploaded_by);
create index if not exists idx_resources_created_at on public.resources (created_at desc);
create index if not exists idx_resources_download_count on public.resources (download_count desc);
create index if not exists idx_resources_bookmark_count on public.resources (bookmark_count desc);
create index if not exists idx_resources_tags on public.resources using gin (tags);

-- pg_trgm already created in migration 0003 -- idempotent re-declaration,
-- same as migration 0006's own re-declaration before it.
create extension if not exists pg_trgm;

create index if not exists idx_resources_title_trgm
  on public.resources using gin (title gin_trgm_ops);
create index if not exists idx_resources_description_trgm
  on public.resources using gin (description gin_trgm_ops);

-- --- Bookmark support (reuse, not a parallel system) --------------------------
alter table public.bookmarks drop constraint if exists bookmarks_target_type_check;
alter table public.bookmarks add constraint bookmarks_target_type_check
  check (target_type in ('question', 'interview-experience', 'pdf', 'company', 'resource'));

create or replace function public.sync_resource_bookmark_count()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    if new.target_type = 'resource' then
      update public.resources set bookmark_count = bookmark_count + 1 where id = new.target_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.target_type = 'resource' then
      update public.resources set bookmark_count = greatest(bookmark_count - 1, 0) where id = old.target_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_resource_bookmark_count on public.bookmarks;
create trigger trg_sync_resource_bookmark_count
  after insert or delete on public.bookmarks
  for each row execute function public.sync_resource_bookmark_count();

-- --- Atomic download counter (same pattern/rationale as migration 0006's
-- bulk_increment_question_stats -- a plain SELECT-then-UPDATE from the API
-- layer would be a real race between two simultaneous downloads) ------------
create or replace function public.increment_resource_downloads(p_resource_id uuid)
returns int as $$
declare
  v_count int;
begin
  update public.resources
  set download_count = download_count + 1
  where id = p_resource_id
  returning download_count into v_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- --- Admin audit trail (extend, not duplicate) ---------------------------------
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
    'resource-bulk-approved', 'resource-bulk-rejected', 'resource-bulk-deleted'
  ));

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check
  check (target_type in ('pdf', 'question', 'interview-experience', 'user', 'resource'));

-- --- Notifications (extend, not duplicate) -------------------------------------
-- 'new-resource' was already anticipated back in migration 0001 but never
-- used by any endpoint -- kept here for a published resource becoming
-- visible, with two new types added alongside it mirroring the exact
-- upload-pending-approval / upload-approved / upload-rejected trio migration
-- 0007 added for pdf_resources.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added',
    'upload-pending-approval', 'upload-approved', 'upload-rejected',
    'resource-pending-review', 'resource-approved', 'resource-rejected'
  ));

-- --- RLS ------------------------------------------------------------------------
-- Every write from the backend goes through the service-role client
-- (bypasses RLS entirely, same as every other table in this system) --
-- these policies are defense-in-depth for any future direct client access,
-- written to match the actual visibility rules the API layer enforces
-- (identical shape to interview_experiences' policies, migration 0009).

alter table public.resources enable row level security;

drop policy if exists "resources_select" on public.resources;
create policy "resources_select" on public.resources
  for select using (status = 'approved' or uploaded_by = auth.uid() or public.is_admin());

drop policy if exists "resources_insert_own" on public.resources;
create policy "resources_insert_own" on public.resources
  for insert with check (uploaded_by = auth.uid());

drop policy if exists "resources_write_admin" on public.resources;
create policy "resources_write_admin" on public.resources
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "resources_delete_admin" on public.resources;
create policy "resources_delete_admin" on public.resources
  for delete using (public.is_admin());
