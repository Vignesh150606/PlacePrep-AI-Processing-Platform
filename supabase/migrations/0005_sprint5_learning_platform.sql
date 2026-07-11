-- =============================================================================
-- PlacePrep -- Phase 5: Learning Platform (Quiz Engine + Submission +
-- Wrong Answer Notebook). Run AFTER 0001-0004. Safe to re-run.
--
-- Bookmarks needed no new table -- `bookmarks` + its RLS already existed from
-- migration 0002; only the `/bookmarks` API endpoint was missing.
-- =============================================================================

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in-progress'
    check (status in ('in-progress', 'completed', 'abandoned')),
  mode text not null
    check (mode in ('topic', 'company', 'mixed', 'random', 'wrong-answers', 'bookmarks')),
  topic text,
  company_id uuid references public.companies (id) on delete set null,
  difficulty text not null default 'mixed',
  question_ids uuid[] not null default '{}',
  responses jsonb not null default '[]',
  score numeric(5, 2) not null default 0,
  total_questions int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  skipped_count int not null default 0,
  time_limit_minutes int,
  time_taken_seconds int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists quiz_attempts_user_id_idx on public.quiz_attempts (user_id);
create index if not exists quiz_attempts_user_id_status_idx on public.quiz_attempts (user_id, status);
create index if not exists quiz_attempts_started_at_idx on public.quiz_attempts (started_at desc);

alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz_attempts_all_own" on public.quiz_attempts;
create policy "quiz_attempts_all_own" on public.quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wrong_answer_marks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  times_wrong int not null default 0,
  last_attempt_at timestamptz not null default now(),
  resolved boolean not null default false,
  primary key (user_id, question_id)
);

create index if not exists wrong_answer_marks_user_id_resolved_idx
  on public.wrong_answer_marks (user_id, resolved);

alter table public.wrong_answer_marks enable row level security;

drop policy if exists "wrong_answer_marks_all_own" on public.wrong_answer_marks;
create policy "wrong_answer_marks_all_own" on public.wrong_answer_marks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.activity_logs
  drop constraint if exists activity_logs_action_check;

alter table public.activity_logs
  add constraint activity_logs_action_check
  check (action in (
    'login', 'logout', 'profile-created', 'profile-updated',
    'pdf-uploaded', 'pdf-deleted', 'bookmark-added', 'bookmark-removed',
    'calendar-event-created', 'quiz-completed'
  ));
