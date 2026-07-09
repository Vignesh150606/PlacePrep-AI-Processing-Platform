-- =============================================================================
-- PlacePrep — Phase 5: Learning Platform (Quiz Engine + Submission +
-- Wrong Answer Notebook). Run AFTER 0001-0004. Safe to re-run.
--
-- Bookmarks needed no new table — `bookmarks` + its RLS already existed from
-- migration 0002; only the `/bookmarks` API endpoint was missing (see
-- server/app/api/v1/endpoints/bookmarks.py).
-- =============================================================================

-- No persisted `quizzes` table backs every ad-hoc generated quiz (the
-- Quiz Config form always built its question pool in memory, never saved a
-- template) — so quiz_attempts carries its own denormalized mode/topic/
-- company/difficulty rather than a quiz_id foreign key. `responses` is
-- stored as jsonb (an array of {questionId, selectedOptionIds, isCorrect,
-- timeSpentSeconds, wasSkipped, markedForReview}) rather than a normalized
-- quiz_responses table — see PROJECT_STATE.md's Sprint 5 prerequisite note
-- ("a quiz_attempts + quiz_responses table, OR EQUIVALENT") for why a jsonb
-- column is an intentional, reasonable equivalent here rather than a debt:
-- responses are always read/written as a whole per attempt, never queried
-- by individual response, so there's no normalization benefit to buy back.
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

-- Wrong Answer Notebook (Module 4). One row per (user, question) — the
-- `resolved` boolean backs both "Mastered" and "Delete" from the spec (see
-- client/src/hooks/use-wrong-answers.ts for why one field is enough: either
-- action means "stop showing me this in the notebook", and the historical
-- quiz_attempts row already preserves the fact that they once got it wrong).
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

-- "quiz-completed" is a real activity_logs action as of this pass (nothing
-- writes it yet — the pipeline's own activity-log integration is still the
-- Step-11-adjacent gap noted in PROJECT_STATE.md — but the column-level
-- constraint should already allow it so a future pass isn't ALSO a migration).
alter table public.activity_logs
  drop constraint if exists activity_logs_action_check;

alter table public.activity_logs
  add constraint activity_logs_action_check
  check (action in (
    'login', 'logout', 'profile-created', 'profile-updated',
    'pdf-uploaded', 'pdf-deleted', 'bookmark-added', 'bookmark-removed',
    'calendar-event-created', 'quiz-completed'
  ));
