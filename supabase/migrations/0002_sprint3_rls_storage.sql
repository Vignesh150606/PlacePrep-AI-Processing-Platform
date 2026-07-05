-- =============================================================================
-- PlacePrep — Sprint 3 Step 5: RLS + Storage
-- Run AFTER 0001_sprint3_schema.sql. Safe to re-run.
-- =============================================================================

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role_id = 3
  );
$$ language sql security definer stable set search_path = public;

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

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

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

drop policy if exists "pdf_resources_select_all" on public.pdf_resources;
create policy "pdf_resources_select_all" on public.pdf_resources
  for select using (auth.role() = 'authenticated');

drop policy if exists "pdf_resources_insert_own" on public.pdf_resources;
create policy "pdf_resources_insert_own" on public.pdf_resources
  for insert with check (auth.uid() = uploaded_by);

drop policy if exists "pdf_resources_delete_own_or_admin" on public.pdf_resources;
create policy "pdf_resources_delete_own_or_admin" on public.pdf_resources
  for delete using (auth.uid() = uploaded_by or public.is_admin());

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

drop policy if exists "bookmarks_all_own" on public.bookmarks;
create policy "bookmarks_all_own" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "calendar_events_select_all" on public.calendar_events;
create policy "calendar_events_select_all" on public.calendar_events
  for select using (auth.role() = 'authenticated');

drop policy if exists "calendar_events_write_admin" on public.calendar_events;
create policy "calendar_events_write_admin" on public.calendar_events
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "activity_logs_select_own" on public.activity_logs;
create policy "activity_logs_select_own" on public.activity_logs
  for select using (auth.uid() = user_id);

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
