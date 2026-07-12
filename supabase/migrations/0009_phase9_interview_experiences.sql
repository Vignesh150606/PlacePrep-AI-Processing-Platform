-- =============================================================================
-- PlacePrep -- Phase 9: Interview Experience Repository.
-- Run AFTER 0001-0008. Safe to re-run.
--
-- `shared/src/types/interview-experience.ts` and `bookmarks.target_type`'s
-- check constraint (migration 0001) both already anticipated this feature
-- (the type shape, and 'interview-experience' as a valid bookmark target)
-- but there was no backing table at all -- confirmed by grep, zero matches
-- for "interview_experience" across every prior migration. This is a
-- genuine ground-up build, not a fix.
--
-- Four tables:
--   interview_experiences        -- the submission itself
--   interview_experience_rounds  -- structured round-by-round breakdown
--   interview_experience_votes   -- Helpful / Not Helpful (one per user)
--   interview_experience_reports -- Report Experience (one per user)
--
-- Deliberately reuses the EXISTING `bookmarks` table for "Bookmarks"
-- (target_type = 'interview-experience') rather than a parallel bookmarking
-- system -- see server/app/api/v1/endpoints/interview_experiences.py's
-- module docstring.
-- =============================================================================

create table if not exists public.interview_experiences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  is_anonymous boolean not null default false,
  role text not null,
  employment_type text not null default 'full-time'
    check (employment_type in ('internship', 'full-time')),
  package_lpa numeric(6, 2),
  drive_date date,
  college text,
  department text,
  graduation_year int not null,
  outcome text not null check (outcome in ('selected', 'rejected', 'in-progress', 'withdrawn')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  overall_tips text not null default '',
  resources_used text,
  additional_notes text,
  key_topics text[],
  process_duration text,
  is_pinned boolean not null default false,
  status text not null default 'pending-review'
    check (status in ('pending-review', 'approved', 'rejected')),
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_experience_rounds (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.interview_experiences (id) on delete cascade,
  type text not null
    check (type in ('online-assessment', 'technical', 'hr', 'managerial', 'group-discussion')),
  title text not null,
  description text not null default '',
  duration_minutes int,
  round_order int not null default 0
);

create table if not exists public.interview_experience_votes (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.interview_experiences (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_type text not null check (vote_type in ('helpful', 'not-helpful')),
  created_at timestamptz not null default now(),
  unique (experience_id, user_id)
);

create table if not exists public.interview_experience_reports (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.interview_experiences (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (experience_id, reported_by)
);

drop trigger if exists trg_interview_experiences_updated_at on public.interview_experiences;
create trigger trg_interview_experiences_updated_at
  before update on public.interview_experiences
  for each row execute function public.set_updated_at();

create index if not exists idx_interview_experiences_company_id on public.interview_experiences (company_id);
create index if not exists idx_interview_experiences_status on public.interview_experiences (status);
create index if not exists idx_interview_experiences_author_id on public.interview_experiences (author_id);
create index if not exists idx_interview_experiences_graduation_year on public.interview_experiences (graduation_year);
create index if not exists idx_interview_experiences_department on public.interview_experiences (department);
create index if not exists idx_interview_experience_rounds_experience_id
  on public.interview_experience_rounds (experience_id);
create index if not exists idx_interview_experience_rounds_type on public.interview_experience_rounds (type);
create index if not exists idx_interview_experience_votes_experience_id
  on public.interview_experience_votes (experience_id);
create index if not exists idx_interview_experience_reports_experience_id
  on public.interview_experience_reports (experience_id);

-- --- RLS ----------------------------------------------------------------------
-- Every write from the backend goes through the service-role client (bypasses
-- RLS entirely, same as every other table in this system) -- these policies
-- are defense-in-depth for any future direct client access, written to match
-- the actual visibility rules the API layer enforces, not looser.

alter table public.interview_experiences enable row level security;
alter table public.interview_experience_rounds enable row level security;
alter table public.interview_experience_votes enable row level security;
alter table public.interview_experience_reports enable row level security;

drop policy if exists "interview_experiences_select" on public.interview_experiences;
create policy "interview_experiences_select" on public.interview_experiences
  for select using (status = 'approved' or author_id = auth.uid() or public.is_admin());

drop policy if exists "interview_experiences_insert_own" on public.interview_experiences;
create policy "interview_experiences_insert_own" on public.interview_experiences
  for insert with check (author_id = auth.uid());

drop policy if exists "interview_experiences_write_admin" on public.interview_experiences;
create policy "interview_experiences_write_admin" on public.interview_experiences
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "interview_experiences_delete_admin" on public.interview_experiences;
create policy "interview_experiences_delete_admin" on public.interview_experiences
  for delete using (public.is_admin());

drop policy if exists "interview_experience_rounds_select" on public.interview_experience_rounds;
create policy "interview_experience_rounds_select" on public.interview_experience_rounds
  for select using (
    exists (
      select 1 from public.interview_experiences e
      where e.id = interview_experience_rounds.experience_id
        and (e.status = 'approved' or e.author_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "interview_experience_rounds_write" on public.interview_experience_rounds;
create policy "interview_experience_rounds_write" on public.interview_experience_rounds
  for all using (
    exists (
      select 1 from public.interview_experiences e
      where e.id = interview_experience_rounds.experience_id
        and (e.author_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "interview_experience_votes_select_own" on public.interview_experience_votes;
create policy "interview_experience_votes_select_own" on public.interview_experience_votes
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "interview_experience_votes_write_own" on public.interview_experience_votes;
create policy "interview_experience_votes_write_own" on public.interview_experience_votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "interview_experience_reports_select_admin" on public.interview_experience_reports;
create policy "interview_experience_reports_select_admin" on public.interview_experience_reports
  for select using (public.is_admin());

drop policy if exists "interview_experience_reports_insert_own" on public.interview_experience_reports;
create policy "interview_experience_reports_insert_own" on public.interview_experience_reports
  for insert with check (reported_by = auth.uid());
