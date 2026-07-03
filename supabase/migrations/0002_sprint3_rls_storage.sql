-- =============================================================================
-- PlacePrep — Sprint 3 Step 5: RLS + Storage
-- Run this in the Supabase SQL Editor AFTER 0001_sprint3_schema.sql has
-- succeeded. Safe to re-run: policies are dropped and recreated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: is the current authenticated user an admin? Used throughout the
-- policies below instead of repeating the same subquery everywhere.
-- SECURITY DEFINER so it can read `profiles` regardless of the caller's own
-- row-level permissions on that table.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role_id = 3
  );
$$ language sql security definer stable set search_path = public;

-- =============================================================================
-- ENABLE RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.pdf_resources enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_topics enable row level security;
alter table public.question_companies enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.calendar_events enable row level security;
alter table public.activity_logs enable row level security;

-- =============================================================================
-- PROFILES — a user reads/updates only their own row; admins read all.
-- No client-side insert/delete policy: rows are created by the
-- handle_new_user() trigger (runs as security definer) and deleted only via
-- the auth.users cascade.
-- =============================================================================
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =============================================================================
-- COMPANIES / SUBJECTS / TOPICS — public lookup data. Any authenticated
-- user can read; only admins can write.
-- =============================================================================
drop policy if exists "companies_select_all" on public.companies;
create policy "companies_select_all" on public.companies
  for select using (auth.role() = 'authenticated');

drop policy if exists "companies_write_admin" on public.companies;
create policy "companies_write_admin" on public.companies
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_all" on public.subjects
  for select using (auth.role() = 'authenticated');

drop policy if exists "subjects_write_admin" on public.subjects;
create policy "subjects_write_admin" on public.subjects
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "topics_select_all" on public.topics;
create policy "topics_select_all" on public.topics
  for select using (auth.role() = 'authenticated');

drop policy if exists "topics_write_admin" on public.topics;
create policy "topics_write_admin" on public.topics
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- PDF_RESOURCES — the shared library: every authenticated user can browse
-- every PDF's metadata. Only the uploader can insert their own row; the
-- uploader or an admin can delete it. No client-side UPDATE policy —
-- processing_status transitions are backend/service-role only (Sprint 4).
-- =============================================================================
drop policy if exists "pdf_resources_select_all" on public.pdf_resources;
create policy "pdf_resources_select_all" on public.pdf_resources
  for select using (auth.role() = 'authenticated');

drop policy if exists "pdf_resources_insert_own" on public.pdf_resources;
create policy "pdf_resources_insert_own" on public.pdf_resources
  for insert with check (auth.uid() = uploaded_by);

drop policy if exists "pdf_resources_delete_own_or_admin" on public.pdf_resources;
create policy "pdf_resources_delete_own_or_admin" on public.pdf_resources
  for delete using (auth.uid() = uploaded_by or public.is_admin());

-- =============================================================================
-- QUESTIONS / QUESTION_OPTIONS — read-only from the client this sprint
-- (extraction and moderation land in Sprint 4). Only approved questions are
-- visible to non-admins; admins see everything for moderation.
-- =============================================================================
drop policy if exists "questions_select_approved_or_admin" on public.questions;
create policy "questions_select_approved_or_admin" on public.questions
  for select using (status = 'approved' or public.is_admin());

drop policy if exists "question_options_select_via_question" on public.question_options;
create policy "question_options_select_via_question" on public.question_options
  for select using (
    exists (
      select 1 from public.questions q
      where q.id = question_id and (q.status = 'approved' or public.is_admin())
    )
  );

drop policy if exists "question_topics_select_all" on public.question_topics;
create policy "question_topics_select_all" on public.question_topics
  for select using (auth.role() = 'authenticated');

drop policy if exists "question_companies_select_all" on public.question_companies;
create policy "question_companies_select_all" on public.question_companies
  for select using (auth.role() = 'authenticated');

-- =============================================================================
-- BOOKMARKS — fully private to the owner.
-- =============================================================================
drop policy if exists "bookmarks_all_own" on public.bookmarks;
create policy "bookmarks_all_own" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- NOTIFICATIONS — a user reads and updates (marks read) only their own.
-- No client-side insert/delete: notifications are written by the backend
-- (service role bypasses RLS).
-- =============================================================================
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- CALENDAR_EVENTS — public read (placement calendar is shared campus-wide);
-- admin-only write.
-- =============================================================================
drop policy if exists "calendar_events_select_all" on public.calendar_events;
create policy "calendar_events_select_all" on public.calendar_events
  for select using (auth.role() = 'authenticated');

drop policy if exists "calendar_events_write_admin" on public.calendar_events;
create policy "calendar_events_write_admin" on public.calendar_events
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- ACTIVITY_LOGS — a user can read only their own log entries. No
-- client-side insert/update/delete at all: written exclusively by the
-- backend via the service-role key, which bypasses RLS entirely.
-- =============================================================================
drop policy if exists "activity_logs_select_own" on public.activity_logs;
create policy "activity_logs_select_own" on public.activity_logs
  for select using (auth.uid() = user_id);

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================

-- pdfs: PRIVATE. This is the "temporary storage" tier of the hybrid model —
-- access goes through the shared pdf_resources metadata table, not a public
-- URL. Every authenticated user can read (shared library, matches
-- pdf_resources SELECT policy above); only the uploader can write into
-- their own folder; uploader or admin can delete.
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

drop policy if exists "pdfs_select_authenticated" on storage.objects;
create policy "pdfs_select_authenticated" on storage.objects
  for select using (bucket_id = 'pdfs' and auth.role() = 'authenticated');

drop policy if exists "pdfs_insert_own_folder" on storage.objects;
create policy "pdfs_insert_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "pdfs_delete_own_or_admin" on storage.objects;
create policy "pdfs_delete_own_or_admin" on storage.objects
  for delete using (
    bucket_id = 'pdfs'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

-- avatars: PUBLIC read (profile pictures render without a signed URL).
-- Write restricted to the user's own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write_own_folder" on storage.objects;
create policy "avatars_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- interview-images: PUBLIC read, same own-folder write pattern. Not used by
-- any feature yet (Interview Experiences stays mocked this sprint) — set up
-- now so Sprint 4+ doesn't need a storage migration to use it.
insert into storage.buckets (id, name, public)
values ('interview-images', 'interview-images', true)
on conflict (id) do nothing;

drop policy if exists "interview_images_select_public" on storage.objects;
create policy "interview_images_select_public" on storage.objects
  for select using (bucket_id = 'interview-images');

drop policy if exists "interview_images_write_own_folder" on storage.objects;
create policy "interview_images_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'interview-images' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "interview_images_delete_own_folder" on storage.objects;
create policy "interview_images_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'interview-images' and auth.uid()::text = (storage.foldername(name))[1]
  );
