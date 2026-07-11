-- =============================================================================
-- PlacePrep -- Phase 6: multi-format uploads, Daily Challenge, search
-- indexes, and an atomic bulk-stat-increment function (fixes a real
-- read-modify-write race condition in quiz submission -- see
-- server/app/api/v1/endpoints/quizzes.py's module docstring for the bug).
-- Run AFTER 0001-0005. Safe to re-run.
-- =============================================================================

-- --- Multi-format upload support ---------------------------------------------
-- Distinguishes a real PDF from a directly-uploaded image (phone photo /
-- screenshot of a question paper) so services/pipeline.py knows which
-- extraction path to use (native-text-then-OCR-fallback for a PDF; OCR-only
-- for an image, since an image never has an embedded text layer to try
-- first). Defaults every pre-existing row to 'pdf', which is correct: this
-- column didn't exist before this pass, so every row that already exists
-- really was a PDF upload.
alter table public.pdf_resources
  add column if not exists file_kind text not null default 'pdf'
    check (file_kind in ('pdf', 'image'));

create index if not exists idx_pdf_resources_file_kind on public.pdf_resources (file_kind);

-- --- Search indexes (Phase 6 -- previously only questions had one) ----------
create extension if not exists pg_trgm;

create index if not exists idx_companies_name_trgm
  on public.companies using gin (name gin_trgm_ops);

create index if not exists idx_pdf_resources_file_name_trgm
  on public.pdf_resources using gin (file_name gin_trgm_ops);

create index if not exists idx_pdf_resources_title_trgm
  on public.pdf_resources using gin (title gin_trgm_ops);

-- --- Atomic bulk stat increment (fixes the quiz-submission race) ------------
-- Replaces a per-response SELECT-then-UPDATE pattern (N+1 round trips, AND
-- a real read-modify-write race between two concurrent submissions touching
-- the same question) with one atomic, set-based UPDATE for the entire quiz
-- in a single round trip. `p_answered`/`p_corrects` are parallel arrays to
-- `p_question_ids` (element i describes question i) -- a skipped response
-- passes `p_answered[i] = false` and doesn't touch times_correct at all,
-- matching the existing "skipped responses don't count as an attempt"
-- semantics from the application code this replaces.
create or replace function public.bulk_increment_question_stats(
  p_question_ids uuid[],
  p_answered boolean[],
  p_corrects boolean[]
)
returns void as $$
begin
  update public.questions q
  set
    times_attempted = q.times_attempted + case when x.answered then 1 else 0 end,
    times_correct = q.times_correct + case when x.correct then 1 else 0 end
  from (
    select
      unnest(p_question_ids) as question_id,
      unnest(p_answered) as answered,
      unnest(p_corrects) as correct
  ) x
  where q.id = x.question_id;
end;
$$ language plpgsql security definer set search_path = public;

-- --- Daily Challenge (Phase 6 -- previously not built at all) ---------------
create table if not exists public.daily_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Plain `date`, computed server-side in UTC (see the endpoint module's
  -- honest timezone caveat) -- one row per (user, UTC day).
  challenge_date date not null,
  question_ids uuid[] not null default '{}',
  weak_topic_question_count int not null default 0,
  completed boolean not null default false,
  quiz_attempt_id uuid references public.quiz_attempts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_date)
);

create index if not exists idx_daily_challenge_progress_user_date
  on public.daily_challenge_progress (user_id, challenge_date desc);

alter table public.daily_challenge_progress enable row level security;

drop policy if exists "daily_challenge_progress_all_own" on public.daily_challenge_progress;
create policy "daily_challenge_progress_all_own" on public.daily_challenge_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.daily_challenge_streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_completed_date date,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_daily_challenge_streaks_updated_at on public.daily_challenge_streaks;
create trigger trg_daily_challenge_streaks_updated_at
  before update on public.daily_challenge_streaks
  for each row execute function public.set_updated_at();

alter table public.daily_challenge_streaks enable row level security;

drop policy if exists "daily_challenge_streaks_all_own" on public.daily_challenge_streaks;
create policy "daily_challenge_streaks_all_own" on public.daily_challenge_streaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- "daily-challenge-completed" is a real activity_logs action as of this
-- pass, matching the same forward-declared-constraint pattern migration
-- 0005 used for 'quiz-completed' (nothing writes it yet from this pass's
-- endpoints either -- activity_logs integration remains the tracked gap
-- noted in PROJECT_STATE.md -- but the column-level constraint allows it
-- now so wiring it up later isn't ALSO a migration).
alter table public.activity_logs
  drop constraint if exists activity_logs_action_check;

alter table public.activity_logs
  add constraint activity_logs_action_check
  check (action in (
    'login', 'logout', 'profile-created', 'profile-updated',
    'pdf-uploaded', 'pdf-deleted', 'bookmark-added', 'bookmark-removed',
    'calendar-event-created', 'quiz-completed', 'daily-challenge-completed',
    'questions-merged'
  ));
