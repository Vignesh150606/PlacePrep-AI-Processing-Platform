-- =============================================================================
-- PlacePrep -- Phase 11: Alumni Intelligence Network.
-- Run AFTER 0001-0012. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- grepped every prior migration for "alumni" -- the ONLY existing alumni
-- infrastructure was `roles` already containing a plain 'alumni' role
-- (migration 0001, id 2) used purely for coarse RBAC (e.g. "students and
-- alumni" in calendar.py). There was no alumni PROFILE anywhere -- no
-- company/role/graduation-year/bio/mentorship data, no verification
-- workflow, no directory. This migration builds that, reusing every
-- adjacent system instead of duplicating it:
--   - Identity: the EXISTING `profiles` table/row (one alumni_profiles row
--     per `profiles.id`, not a parallel user model). Promoting the plain
--     RBAC role to 'alumni' (`profiles.role_id = 2`) happens automatically
--     when an admin verifies (see alumni.py), reusing the EXISTING
--     role-change codepath `admin.py`'s `update_user_role` already
--     established, not a second role system.
--   - Companies: the EXISTING `companies` table (optional `current_company_id`
--     FK), same "denormalized free-text fallback + optional FK" shape
--     `resources.author` (migration 0012) established for "a name that
--     isn't always in our directory".
--   - Moderation vocabulary: the same pending/decided lifecycle shape
--     `interview_experiences`/`resources` established (`reviewed_by`/
--     `reviewed_at`/`rejection_reason`), with one deliberate naming
--     departure -- the approved state is called 'verified' rather than
--     'approved', because this feature's entire premise (badge, directory,
--     "only verified alumni") is identity verification, not content
--     moderation, and 'approved' would read wrong on a profile.
--   - Admin audit trail: extends the EXISTING `admin_audit_logs` table
--     (migration 0010) with alumni-specific actions + an 'alumni'
--     target_type, instead of a second audit table.
--   - Notifications: extends the EXISTING `notifications` table the same
--     way migration 0012 extended it for resources.
--
-- Two genuinely new pieces of real (not cosmetic) logic, both denormalized
-- counters kept in sync by triggers on tables THIS migration does not own
-- (`interview_experiences`, `resources`, `interview_experience_votes`) --
-- same "trigger on the other table, scoped to only the rows that matter"
-- shape migration 0012's `sync_resource_bookmark_count` established:
--   1. `contribution_count` -- real, sortable "Most Contributions": counts
--      this alumnus's own APPROVED interview experiences + resources.
--      Recomputed incrementally on every insert/status-change/delete on
--      either source table (no full rescan).
--   2. `helpful_votes_received` -- real, sortable "Most Helpful": counts
--      "helpful" votes cast on this alumnus's own interview experiences.
--      `interview_experience_votes` has a genuine UPDATE path (voting the
--      other way replaces the row, see interview_experiences.py's
--      `vote_experience`), so this trigger (unlike the bookmark one)
--      also handles UPDATE OF vote_type, not just INSERT/DELETE.
-- =============================================================================

create table if not exists public.alumni_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,

  is_anonymous boolean not null default false,

  -- Current position. `current_company_name` is always populated (free
  -- text, filled from the companies directory at submission time when
  -- `current_company_id` is set) -- same reasoning as `resources.author`:
  -- an alumnus's employer is very often not yet in our companies directory.
  current_company_id uuid references public.companies (id) on delete set null,
  current_company_name text not null default '',
  -- NOTE: named `job_title`, not `current_role` -- `CURRENT_ROLE` is a
  -- reserved SQL keyword (equivalent to CURRENT_USER), so `current_role`
  -- as a bare column identifier is a syntax error, not just a style
  -- choice. The API/frontend still call this "currentRole" (see alumni.py's
  -- mapping in `_row_to_response`/`insert_payload`) -- only the actual
  -- column name changed.
  job_title text not null default '',
  department text,
  graduation_year int not null,
  location text,

  skills text[] not null default '{}',
  domains text[] not null default '{}',
  technologies text[] not null default '{}',

  bio text,
  career_journey text,
  preparation_strategy text,
  resume_tips text,
  interview_tips text,
  placement_advice text,

  -- "Current Availability" (general reachability, set by the alumnus) --
  -- deliberately distinct from `mentorship_available` below (the
  -- Mentorship Foundation's own, narrower flag).
  availability_status text not null default 'available'
    check (availability_status in ('available', 'busy', 'unavailable')),

  -- --- Mentorship (Foundation Only) ------------------------------------
  -- Per the brief: only the flag itself. No chat, scheduling, booking, or
  -- notifications table -- those are explicitly out of scope for this
  -- pass, same "stop here" boundary this project's own PROJECT_STATE.md
  -- has respected for every adjacent unbuilt module.
  mentorship_available boolean not null default false,

  linkedin_url text,
  portfolio_url text,
  github_url text,

  -- Future-ready per the brief: institution-email-based auto-verification
  -- is NOT implemented this pass -- the column exists so that piece can be
  -- added later without a schema migration, but today it's inert data,
  -- checked by nothing.
  institution_email text,

  -- --- Verification (identity, not content moderation -- see this
  -- migration's own docstring for why 'verified' replaces 'approved' here).
  verification_status text not null default 'pending-review'
    check (verification_status in ('pending-review', 'verified', 'rejected', 'suspended')),
  verification_method text not null default 'self-submitted'
    check (verification_method in ('self-submitted', 'admin-manual', 'institution-email')),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,

  -- Denormalized, trigger-maintained (see below) -- needed for real
  -- DB-side "Most Contributions" / "Most Helpful" sorting, not just a
  -- display number (identical reasoning to `resources.bookmark_count`).
  contribution_count int not null default 0,
  helpful_votes_received int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_alumni_profiles_updated_at on public.alumni_profiles;
create trigger trg_alumni_profiles_updated_at
  before update on public.alumni_profiles
  for each row execute function public.set_updated_at();

create index if not exists idx_alumni_profiles_verification_status on public.alumni_profiles (verification_status);
create index if not exists idx_alumni_profiles_current_company_id on public.alumni_profiles (current_company_id);
create index if not exists idx_alumni_profiles_department on public.alumni_profiles (department);
create index if not exists idx_alumni_profiles_graduation_year on public.alumni_profiles (graduation_year);
create index if not exists idx_alumni_profiles_mentorship_available on public.alumni_profiles (mentorship_available);
create index if not exists idx_alumni_profiles_contribution_count on public.alumni_profiles (contribution_count desc);
create index if not exists idx_alumni_profiles_helpful_votes on public.alumni_profiles (helpful_votes_received desc);
create index if not exists idx_alumni_profiles_created_at on public.alumni_profiles (created_at desc);
create index if not exists idx_alumni_profiles_skills on public.alumni_profiles using gin (skills);
create index if not exists idx_alumni_profiles_domains on public.alumni_profiles using gin (domains);
create index if not exists idx_alumni_profiles_technologies on public.alumni_profiles using gin (technologies);

-- pg_trgm already created in migration 0003 -- idempotent re-declaration.
create extension if not exists pg_trgm;
create index if not exists idx_alumni_profiles_role_trgm
  on public.alumni_profiles using gin (job_title gin_trgm_ops);
create index if not exists idx_alumni_profiles_bio_trgm
  on public.alumni_profiles using gin (bio gin_trgm_ops);

-- --- Contribution count (denormalized, trigger-maintained from tables this
-- migration does not own) -------------------------------------------------
create or replace function public.sync_alumni_contribution_from_experience()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and new.author_id is not null then
      update public.alumni_profiles set contribution_count = contribution_count + 1
        where profile_id = new.author_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status = 'approved' and new.author_id is not null then
        update public.alumni_profiles set contribution_count = contribution_count + 1
          where profile_id = new.author_id;
      elsif old.status = 'approved' and old.author_id is not null then
        update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0)
          where profile_id = old.author_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' and old.author_id is not null then
      update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0)
        where profile_id = old.author_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_contribution_from_experience on public.interview_experiences;
create trigger trg_sync_alumni_contribution_from_experience
  after insert or update of status or delete on public.interview_experiences
  for each row execute function public.sync_alumni_contribution_from_experience();

create or replace function public.sync_alumni_contribution_from_resource()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      update public.alumni_profiles set contribution_count = contribution_count + 1
        where profile_id = new.uploaded_by;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status = 'approved' then
        update public.alumni_profiles set contribution_count = contribution_count + 1
          where profile_id = new.uploaded_by;
      elsif old.status = 'approved' then
        update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0)
          where profile_id = old.uploaded_by;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' then
      update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0)
        where profile_id = old.uploaded_by;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_contribution_from_resource on public.resources;
create trigger trg_sync_alumni_contribution_from_resource
  after insert or update of status or delete on public.resources
  for each row execute function public.sync_alumni_contribution_from_resource();

-- --- Helpful-votes count (denormalized, trigger-maintained) --------------
-- Unlike the bookmark-count trigger (migration 0012), this also handles
-- UPDATE OF vote_type: `interview_experiences.py`'s `vote_experience` has a
-- genuine update path (voting the other way replaces the existing row
-- rather than delete-then-insert), so a helpful vote can become a
-- not-helpful vote in place.
create or replace function public.sync_alumni_helpful_votes()
returns trigger as $$
declare
  v_author_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      select author_id into v_author_id from public.interview_experiences where id = new.experience_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1
          where profile_id = v_author_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.vote_type is distinct from new.vote_type then
      select author_id into v_author_id from public.interview_experiences where id = new.experience_id;
      if v_author_id is not null then
        if new.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1
            where profile_id = v_author_id;
        elsif old.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0)
            where profile_id = v_author_id;
        end if;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      select author_id into v_author_id from public.interview_experiences where id = old.experience_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0)
          where profile_id = v_author_id;
      end if;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_helpful_votes on public.interview_experience_votes;
create trigger trg_sync_alumni_helpful_votes
  after insert or update of vote_type or delete on public.interview_experience_votes
  for each row execute function public.sync_alumni_helpful_votes();

-- --- Admin audit trail (extend, not duplicate) ---------------------------
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
    'alumni-verification-removed', 'alumni-deleted', 'alumni-manual-created'
  ));

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check
  check (target_type in ('pdf', 'question', 'interview-experience', 'user', 'resource', 'alumni'));

-- --- Notifications (extend, not duplicate) -------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added',
    'upload-pending-approval', 'upload-approved', 'upload-rejected',
    'resource-pending-review', 'resource-approved', 'resource-rejected',
    'alumni-verification-pending', 'alumni-verified', 'alumni-rejected', 'alumni-suspended'
  ));

-- --- RLS ------------------------------------------------------------------
-- Every write from the backend goes through the service-role client
-- (bypasses RLS entirely, same as every other table in this system) --
-- these policies are defense-in-depth for any future direct client access,
-- written to match the actual visibility rules the API layer enforces
-- (same "select: decided-and-visible OR own OR admin" shape as
-- interview_experiences/resources, plus an own-row UPDATE policy so a
-- verified alumnus can keep their own bio/tips/availability current
-- without needing admin involvement for every edit -- see alumni.py's
-- `update_my_alumni_profile`).

alter table public.alumni_profiles enable row level security;

drop policy if exists "alumni_profiles_select" on public.alumni_profiles;
create policy "alumni_profiles_select" on public.alumni_profiles
  for select using (verification_status = 'verified' or profile_id = auth.uid() or public.is_admin());

drop policy if exists "alumni_profiles_insert_own" on public.alumni_profiles;
create policy "alumni_profiles_insert_own" on public.alumni_profiles
  for insert with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "alumni_profiles_update_own_or_admin" on public.alumni_profiles;
create policy "alumni_profiles_update_own_or_admin" on public.alumni_profiles
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "alumni_profiles_delete_admin" on public.alumni_profiles;
create policy "alumni_profiles_delete_admin" on public.alumni_profiles
  for delete using (public.is_admin());
