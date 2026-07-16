-- =============================================================================
-- PlacePrep -- Phase 12: Placement Community.
-- Run AFTER 0001-0013. Safe to re-run.
--
-- Audited first, per this project's own practice (see PROJECT_STATE.md):
-- grepped every prior migration/route/component/nav-item for "community" --
-- found exactly two hits, both placeholders anticipating this exact
-- migration and nothing else: `notifications_type_check` already allows
-- `'community-reply'` (added migration 0001, never used until now) and
-- `nav-items.ts`/`router.tsx` already have a "Community" entry pointed at
-- a `ComingSoonPage` stub. No posts/comments/categories table, no routes,
-- no components anywhere. This migration builds the real thing, reusing
-- every adjacent system instead of duplicating it:
--   - Identity: the EXISTING `profiles` table (author_id FK), same
--     anonymity shape `interview_experiences.is_anonymous` established --
--     `author_id` is always stored for accountability, redacted to null
--     in the API response for anonymous posts/comments (see community.py).
--   - Companies: the EXISTING `companies` table, same optional-FK +
--     denormalized-free-text-fallback shape `resources.author` /
--     `alumni_profiles.current_company_name` already established.
--   - Bookmarks: the EXISTING generic `bookmarks` table
--     (`target_type = 'community-post'`) -- no new bookmark table.
--   - Admin audit trail: extends the EXISTING `admin_audit_logs` table.
--   - Notifications: extends the EXISTING `notifications` table, and
--     actually uses the `'community-reply'` type migration 0001 already
--     reserved for this.
--   - Alumni integration (per the brief -- "reuse the Alumni module,"
--     not a parallel stats system): a verified alumnus's contributions and
--     helpful votes on Community posts/comments feed the SAME
--     `alumni_profiles.contribution_count` / `helpful_votes_received`
--     counters migration 0013 introduced, via two more trigger functions
--     alongside the existing interview-experience/resource ones -- not a
--     second "community contribution count" living on a different table.
--
-- Deliberate design choice (this is a forum, not a submission queue):
-- unlike `resources`/`interview_experiences`, posts and comments are NOT
-- pending-review-gated -- they're visible immediately on creation, same as
-- any real discussion board (a doubt or OA discussion is useless to anyone
-- if it sits in a moderation queue for a day). Moderation here is
-- reactive: users report, admins pin/lock/delete/suspend after the fact.
-- This is why there's no `status` column on `community_posts` the way
-- `resources.status` has one -- `is_pinned`/`is_locked` are the only
-- content-state flags, and reports live in their own tables exactly like
-- `interview_experience_reports` already does.
--
-- Real, trigger-maintained denormalized counts (same "trigger on the
-- other table, scoped narrowly" shape 0012/0013 established) --
-- needed for real DB-side sorting/filtering ("Most Helpful", "Most
-- Viewed", "Unanswered"), not just display numbers:
--   - `community_posts.helpful_count` / `not_helpful_count` -- from
--     `community_post_votes` (mirrors `resources.bookmark_count`, except
--     two counters instead of one, and it has a genuine UPDATE path like
--     `alumni_profiles.helpful_votes_received` does).
--   - `community_posts.reply_count` -- from `community_comments`
--     (insert/delete), powers the "Unanswered" filter (`reply_count = 0`).
--   - `community_comments.helpful_count` -- from `community_comment_votes`,
--     same shape as the post-vote trigger.
--   - `community_posts.view_count` -- NOT trigger-maintained; a plain
--     RPC-incremented counter (`increment_community_post_views`), same
--     atomic-RPC pattern as `increment_resource_downloads` (a view is a
--     read-path side effect, not a reaction to a write on another table).
-- =============================================================================

-- --- Community-specific user status (extends the EXISTING profiles table,
-- not a parallel user/status table -- same reasoning `role_id` already
-- lives directly on `profiles` rather than a separate roles-join record
-- per user). Scoped to Community specifically (posting privileges), not a
-- site-wide ban -- there is no site-wide suspension concept anywhere else
-- in this codebase to reuse, and inventing one here would be broader than
-- the brief asks for.
alter table public.profiles add column if not exists community_suspended boolean not null default false;
alter table public.profiles add column if not exists community_suspended_reason text;
alter table public.profiles add column if not exists community_suspended_at timestamptz;
alter table public.profiles add column if not exists community_suspended_by uuid references public.profiles (id) on delete set null;

-- --- Posts ------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  is_anonymous boolean not null default false,

  category text not null check (category in (
    'general-placement', 'aptitude', 'dsa', 'core-subjects', 'hr-interview',
    'technical-interview', 'company-specific', 'off-campus', 'higher-studies',
    'resume-review', 'mock-interview', 'resources'
  )),

  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 20000),

  -- Same "optional FK + always-populated free-text fallback" shape
  -- `resources.author` / `alumni_profiles.current_company_name` established
  -- -- a discussion is very often about a company not yet in our directory.
  company_id uuid references public.companies (id) on delete set null,
  company_name text,

  tags text[] not null default '{}',

  -- Structured attachment metadata (name/path/size/kind), not a parallel
  -- storage system -- files live in the EXISTING 'pdfs' bucket via the
  -- SAME `{uploader}/{uuid}.ext` convention `resources.py`/`pdfs.py` use.
  -- A jsonb array (not a child table) because attachments are immutable
  -- once a post is created (no per-attachment moderation/voting/edit),
  -- so a child table would just be a straight list a jsonb array already
  -- represents cleanly, without a fourth table for a bag of metadata.
  attachments jsonb not null default '[]'::jsonb,

  -- Real counts (see this migration's docstring for how each is kept in
  -- sync).
  view_count int not null default 0,
  helpful_count int not null default 0,
  not_helpful_count int not null default 0,
  reply_count int not null default 0,

  is_pinned boolean not null default false,
  is_locked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_community_posts_updated_at on public.community_posts;
create trigger trg_community_posts_updated_at
  before update on public.community_posts
  for each row execute function public.set_updated_at();

create index if not exists idx_community_posts_category on public.community_posts (category);
create index if not exists idx_community_posts_company_id on public.community_posts (company_id);
create index if not exists idx_community_posts_author_id on public.community_posts (author_id);
create index if not exists idx_community_posts_created_at on public.community_posts (created_at desc);
create index if not exists idx_community_posts_is_pinned on public.community_posts (is_pinned desc, created_at desc);
create index if not exists idx_community_posts_helpful_count on public.community_posts (helpful_count desc);
create index if not exists idx_community_posts_view_count on public.community_posts (view_count desc);
create index if not exists idx_community_posts_reply_count on public.community_posts (reply_count);
create index if not exists idx_community_posts_tags on public.community_posts using gin (tags);

create extension if not exists pg_trgm;
create index if not exists idx_community_posts_title_trgm
  on public.community_posts using gin (title gin_trgm_ops);
create index if not exists idx_community_posts_description_trgm
  on public.community_posts using gin (description gin_trgm_ops);

-- --- Comments (nested replies via self-referencing parent_comment_id) -------
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  parent_comment_id uuid references public.community_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  is_anonymous boolean not null default false,

  content text not null check (char_length(content) between 1 and 10000),

  helpful_count int not null default 0,
  edited_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_community_comments_updated_at on public.community_comments;
create trigger trg_community_comments_updated_at
  before update on public.community_comments
  for each row execute function public.set_updated_at();

create index if not exists idx_community_comments_post_id on public.community_comments (post_id);
create index if not exists idx_community_comments_parent_id on public.community_comments (parent_comment_id);
create index if not exists idx_community_comments_author_id on public.community_comments (author_id);
create index if not exists idx_community_comments_created_at on public.community_comments (created_at);

-- --- Votes (toggle semantics, identical shape to interview_experience_votes)-
create table if not exists public.community_post_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_type text not null check (vote_type in ('helpful', 'not-helpful')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists idx_community_post_votes_post_id on public.community_post_votes (post_id);

create table if not exists public.community_comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_type text not null check (vote_type in ('helpful', 'not-helpful')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists idx_community_comment_votes_comment_id on public.community_comment_votes (comment_id);

-- --- Reports (identical shape to interview_experience_reports) --------------
create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (post_id, reported_by)
);

create table if not exists public.community_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (comment_id, reported_by)
);

-- --- Reply-count sync (denormalized on community_posts) ---------------------
create or replace function public.sync_community_post_reply_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set reply_count = reply_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_community_post_reply_count on public.community_comments;
create trigger trg_sync_community_post_reply_count
  after insert or delete on public.community_comments
  for each row execute function public.sync_community_post_reply_count();

-- --- Post helpful/not-helpful vote sync (denormalized on community_posts) ---
create or replace function public.sync_community_post_vote_counts()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      update public.community_posts set helpful_count = helpful_count + 1 where id = new.post_id;
    else
      update public.community_posts set not_helpful_count = not_helpful_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.vote_type is distinct from new.vote_type then
      if new.vote_type = 'helpful' then
        update public.community_posts
          set helpful_count = helpful_count + 1, not_helpful_count = greatest(not_helpful_count - 1, 0)
          where id = new.post_id;
      else
        update public.community_posts
          set not_helpful_count = not_helpful_count + 1, helpful_count = greatest(helpful_count - 1, 0)
          where id = new.post_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      update public.community_posts set helpful_count = greatest(helpful_count - 1, 0) where id = old.post_id;
    else
      update public.community_posts set not_helpful_count = greatest(not_helpful_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_community_post_vote_counts on public.community_post_votes;
create trigger trg_sync_community_post_vote_counts
  after insert or update of vote_type or delete on public.community_post_votes
  for each row execute function public.sync_community_post_vote_counts();

-- --- Comment helpful-vote sync (denormalized on community_comments) ---------
create or replace function public.sync_community_comment_vote_counts()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      update public.community_comments set helpful_count = helpful_count + 1 where id = new.comment_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.vote_type is distinct from new.vote_type then
      if new.vote_type = 'helpful' then
        update public.community_comments set helpful_count = helpful_count + 1 where id = new.comment_id;
      else
        update public.community_comments set helpful_count = greatest(helpful_count - 1, 0) where id = new.comment_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      update public.community_comments set helpful_count = greatest(helpful_count - 1, 0) where id = old.comment_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_community_comment_vote_counts on public.community_comment_votes;
create trigger trg_sync_community_comment_vote_counts
  after insert or update of vote_type or delete on public.community_comment_votes
  for each row execute function public.sync_community_comment_vote_counts();

-- --- View-count (RPC-incremented, same shape as increment_resource_downloads)
create or replace function public.increment_community_post_views(p_post_id uuid)
returns int as $$
declare
  v_count int;
begin
  update public.community_posts
  set view_count = view_count + 1
  where id = p_post_id
  returning view_count into v_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- --- Alumni integration (extends the EXISTING alumni_profiles counters from
-- migration 0013 -- "reuse the Alumni module," per the brief, not a second
-- contribution-stats system living on a different table) ------------------
create or replace function public.sync_alumni_contribution_from_community_post()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.alumni_profiles set contribution_count = contribution_count + 1 where profile_id = new.author_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0) where profile_id = old.author_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_contribution_from_community_post on public.community_posts;
create trigger trg_sync_alumni_contribution_from_community_post
  after insert or delete on public.community_posts
  for each row execute function public.sync_alumni_contribution_from_community_post();

create or replace function public.sync_alumni_contribution_from_community_comment()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.alumni_profiles set contribution_count = contribution_count + 1 where profile_id = new.author_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.alumni_profiles set contribution_count = greatest(contribution_count - 1, 0) where profile_id = old.author_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_contribution_from_community_comment on public.community_comments;
create trigger trg_sync_alumni_contribution_from_community_comment
  after insert or delete on public.community_comments
  for each row execute function public.sync_alumni_contribution_from_community_comment();

create or replace function public.sync_alumni_helpful_from_community_post_vote()
returns trigger as $$
declare
  v_author_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      select author_id into v_author_id from public.community_posts where id = new.post_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1 where profile_id = v_author_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.vote_type is distinct from new.vote_type then
      select author_id into v_author_id from public.community_posts where id = new.post_id;
      if v_author_id is not null then
        if new.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1 where profile_id = v_author_id;
        elsif old.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0) where profile_id = v_author_id;
        end if;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      select author_id into v_author_id from public.community_posts where id = old.post_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0) where profile_id = v_author_id;
      end if;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_helpful_from_community_post_vote on public.community_post_votes;
create trigger trg_sync_alumni_helpful_from_community_post_vote
  after insert or update of vote_type or delete on public.community_post_votes
  for each row execute function public.sync_alumni_helpful_from_community_post_vote();

create or replace function public.sync_alumni_helpful_from_community_comment_vote()
returns trigger as $$
declare
  v_author_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      select author_id into v_author_id from public.community_comments where id = new.comment_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1 where profile_id = v_author_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.vote_type is distinct from new.vote_type then
      select author_id into v_author_id from public.community_comments where id = new.comment_id;
      if v_author_id is not null then
        if new.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = helpful_votes_received + 1 where profile_id = v_author_id;
        elsif old.vote_type = 'helpful' then
          update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0) where profile_id = v_author_id;
        end if;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      select author_id into v_author_id from public.community_comments where id = old.comment_id;
      if v_author_id is not null then
        update public.alumni_profiles set helpful_votes_received = greatest(helpful_votes_received - 1, 0) where profile_id = v_author_id;
      end if;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_sync_alumni_helpful_from_community_comment_vote on public.community_comment_votes;
create trigger trg_sync_alumni_helpful_from_community_comment_vote
  after insert or update of vote_type or delete on public.community_comment_votes
  for each row execute function public.sync_alumni_helpful_from_community_comment_vote();

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
    'community-user-suspended', 'community-user-unsuspended'
  ));

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check
  check (target_type in (
    'pdf', 'question', 'interview-experience', 'user', 'resource', 'alumni',
    'community-post', 'community-comment'
  ));

-- --- Notifications (extend, not duplicate) ----------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new-company', 'new-resource', 'calendar-update', 'community-reply',
    'extraction-complete', 'extraction-started', 'extraction-failed', 'questions-added',
    'upload-pending-approval', 'upload-approved', 'upload-rejected',
    'resource-pending-review', 'resource-approved', 'resource-rejected',
    'alumni-verification-pending', 'alumni-verified', 'alumni-rejected', 'alumni-suspended',
    'community-post-reported', 'community-comment-reported', 'community-account-suspended'
  ));

-- --- Bookmarks (extend, not duplicate) --------------------------------------
alter table public.bookmarks drop constraint if exists bookmarks_target_type_check;
alter table public.bookmarks add constraint bookmarks_target_type_check
  check (target_type in ('question', 'interview-experience', 'pdf', 'company', 'resource', 'community-post'));

-- --- RLS ---------------------------------------------------------------------
-- Every real write goes through the service-role client and bypasses RLS
-- (same as every other table in this system) -- these are defense-in-depth,
-- written to match the actual visibility rules community.py enforces.
-- Posts/comments are visible to every signed-in user immediately (this is a
-- forum, not a moderation queue -- see this migration's own docstring), so
-- there's no "approved OR own OR admin" select gate the way
-- resources/interview_experiences have; the only gate is identity on write.

alter table public.community_posts enable row level security;
drop policy if exists "community_posts_select_all" on public.community_posts;
create policy "community_posts_select_all" on public.community_posts for select using (true);
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own" on public.community_posts
  for insert with check (author_id = auth.uid() or public.is_admin());
drop policy if exists "community_posts_update_own_or_admin" on public.community_posts;
create policy "community_posts_update_own_or_admin" on public.community_posts
  for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
drop policy if exists "community_posts_delete_own_or_admin" on public.community_posts;
create policy "community_posts_delete_own_or_admin" on public.community_posts
  for delete using (author_id = auth.uid() or public.is_admin());

alter table public.community_comments enable row level security;
drop policy if exists "community_comments_select_all" on public.community_comments;
create policy "community_comments_select_all" on public.community_comments for select using (true);
drop policy if exists "community_comments_insert_own" on public.community_comments;
create policy "community_comments_insert_own" on public.community_comments
  for insert with check (author_id = auth.uid() or public.is_admin());
drop policy if exists "community_comments_update_own_or_admin" on public.community_comments;
create policy "community_comments_update_own_or_admin" on public.community_comments
  for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
drop policy if exists "community_comments_delete_own_or_admin" on public.community_comments;
create policy "community_comments_delete_own_or_admin" on public.community_comments
  for delete using (author_id = auth.uid() or public.is_admin());

alter table public.community_post_votes enable row level security;
drop policy if exists "community_post_votes_select_own_or_admin" on public.community_post_votes;
create policy "community_post_votes_select_own_or_admin" on public.community_post_votes
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "community_post_votes_insert_own" on public.community_post_votes;
create policy "community_post_votes_insert_own" on public.community_post_votes
  for insert with check (user_id = auth.uid());
drop policy if exists "community_post_votes_update_own" on public.community_post_votes;
create policy "community_post_votes_update_own" on public.community_post_votes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "community_post_votes_delete_own" on public.community_post_votes;
create policy "community_post_votes_delete_own" on public.community_post_votes
  for delete using (user_id = auth.uid());

alter table public.community_comment_votes enable row level security;
drop policy if exists "community_comment_votes_select_own_or_admin" on public.community_comment_votes;
create policy "community_comment_votes_select_own_or_admin" on public.community_comment_votes
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "community_comment_votes_insert_own" on public.community_comment_votes;
create policy "community_comment_votes_insert_own" on public.community_comment_votes
  for insert with check (user_id = auth.uid());
drop policy if exists "community_comment_votes_update_own" on public.community_comment_votes;
create policy "community_comment_votes_update_own" on public.community_comment_votes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "community_comment_votes_delete_own" on public.community_comment_votes;
create policy "community_comment_votes_delete_own" on public.community_comment_votes
  for delete using (user_id = auth.uid());

alter table public.community_post_reports enable row level security;
drop policy if exists "community_post_reports_select_admin" on public.community_post_reports;
create policy "community_post_reports_select_admin" on public.community_post_reports
  for select using (reported_by = auth.uid() or public.is_admin());
drop policy if exists "community_post_reports_insert_own" on public.community_post_reports;
create policy "community_post_reports_insert_own" on public.community_post_reports
  for insert with check (reported_by = auth.uid());
drop policy if exists "community_post_reports_delete_admin" on public.community_post_reports;
create policy "community_post_reports_delete_admin" on public.community_post_reports
  for delete using (public.is_admin());

alter table public.community_comment_reports enable row level security;
drop policy if exists "community_comment_reports_select_admin" on public.community_comment_reports;
create policy "community_comment_reports_select_admin" on public.community_comment_reports
  for select using (reported_by = auth.uid() or public.is_admin());
drop policy if exists "community_comment_reports_insert_own" on public.community_comment_reports;
create policy "community_comment_reports_insert_own" on public.community_comment_reports
  for insert with check (reported_by = auth.uid());
drop policy if exists "community_comment_reports_delete_admin" on public.community_comment_reports;
create policy "community_comment_reports_delete_admin" on public.community_comment_reports
  for delete using (public.is_admin());
