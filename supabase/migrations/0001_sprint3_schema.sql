-- =============================================================================
-- PlacePrep — Sprint 3: Identity Platform + Database + PDF Library
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).
-- RLS policies and storage buckets are a SEPARATE migration (0002).
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id smallint primary key,
  name text not null unique check (name in ('student', 'alumni', 'admin'))
);

insert into public.roles (id, name) values
  (1, 'student'),
  (2, 'alumni'),
  (3, 'admin')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  avatar_url text,
  role_id smallint not null references public.roles (id) default 1,
  college text,
  department text,
  year int,
  profile_completion smallint not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  description text not null default '',
  website text,
  industry text not null default '',
  tier text not null check (tier in ('dream', 'super-dream', 'core', 'mass-recruiter')),
  roles text[] not null default '{}',
  average_package_lpa numeric(5, 2),
  question_count int not null default 0,
  experience_count int not null default 0,
  upcoming_visit_date timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  slug text not null,
  unique (subject_id, slug)
);

create table if not exists public.pdf_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded', 'queued', 'processing', 'extracting', 'completed', 'failed')),
  keep_permanent boolean not null default false,
  extracted_question_count int not null default 0,
  error_message text,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(file_name, '')), 'C')
  ) stored
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('mcq', 'multi-select', 'coding', 'subjective')),
  question_text text not null,
  content_hash text not null unique,
  correct_explanation text,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  source_pdf_id uuid references public.pdf_resources (id) on delete set null,
  status text not null default 'pending-review'
    check (status in ('pending-review', 'approved', 'rejected')),
  tags text[] not null default '{}',
  times_attempted int not null default 0,
  times_correct int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label text not null,
  option_text text not null,
  is_correct boolean not null default false,
  order_index smallint not null default 0
);

create table if not exists public.question_topics (
  question_id uuid not null references public.questions (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  primary key (question_id, topic_id)
);

create table if not exists public.question_companies (
  question_id uuid not null references public.questions (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  primary key (question_id, company_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('question', 'interview-experience', 'pdf')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (
    type in ('new-company', 'new-resource', 'calendar-update', 'community-reply', 'extraction-complete')
  ),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  link_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (
    type in ('oa', 'interview', 'company-visit', 'reminder', 'workshop')
  ),
  company_id uuid references public.companies (id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  description text
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in (
    'login', 'logout', 'profile-created', 'profile-updated',
    'pdf-uploaded', 'pdf-deleted', 'bookmark-added', 'bookmark-removed',
    'calendar-event-created'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'New User'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    1
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create index if not exists idx_profiles_role_id on public.profiles (role_id);
create index if not exists idx_companies_slug on public.companies (slug);
create index if not exists idx_topics_subject_id on public.topics (subject_id);
create index if not exists idx_pdf_resources_uploaded_by on public.pdf_resources (uploaded_by);
create index if not exists idx_pdf_resources_company_id on public.pdf_resources (company_id);
create index if not exists idx_pdf_resources_processing_status on public.pdf_resources (processing_status);
create index if not exists idx_pdf_resources_uploaded_at on public.pdf_resources (uploaded_at desc);
create index if not exists idx_pdf_resources_search_vector on public.pdf_resources using gin (search_vector);
create index if not exists idx_questions_source_pdf_id on public.questions (source_pdf_id);
create index if not exists idx_questions_status on public.questions (status);
create index if not exists idx_question_options_question_id on public.question_options (question_id);
create index if not exists idx_question_topics_topic_id on public.question_topics (topic_id);
create index if not exists idx_question_companies_company_id on public.question_companies (company_id);
create index if not exists idx_bookmarks_user_id on public.bookmarks (user_id);
create index if not exists idx_notifications_user_id_is_read on public.notifications (user_id, is_read);
create index if not exists idx_calendar_events_start_at on public.calendar_events (start_at);
create index if not exists idx_calendar_events_company_id on public.calendar_events (company_id);
create index if not exists idx_activity_logs_user_id_created_at on public.activity_logs (user_id, created_at desc);
