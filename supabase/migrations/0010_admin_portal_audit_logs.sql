-- =============================================================================
-- PlacePrep -- Admin Portal Expansion, Module 2: Audit Logs.
-- Run AFTER 0001-0009. Safe to re-run.
--
-- Distinct from `activity_logs` (migration 0001), which is a per-user
-- "recent activity" feed shown on that user's OWN dashboard (login,
-- pdf-uploaded, bookmark-added, ...). This table is the opposite
-- direction: actions an ADMIN takes against content or other users'
-- accounts, visible only to admins (see server/app/services/audit.py and
-- the `/admin/audit-logs` endpoint in server/app/api/v1/endpoints/admin.py).
-- =============================================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in (
    'pdf-approved', 'pdf-rejected',
    'question-approved', 'question-rejected', 'question-edited',
    'question-merged', 'question-deleted',
    'interview-experience-approved', 'interview-experience-rejected',
    'interview-experience-edited', 'interview-experience-deleted',
    'user-role-changed'
  )),
  target_type text not null check (target_type in ('pdf', 'question', 'interview-experience', 'user')),
  target_id uuid not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_admin_id on public.admin_audit_logs (admin_id);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs (target_type, target_id);

-- --- RLS ----------------------------------------------------------------------
-- Every write goes through the service-role client (bypasses RLS, same as
-- every other table in this system) -- this policy is defense-in-depth for
-- any future direct client access, and the only one this table needs:
-- admins can read the trail, nobody else can read or write it directly.

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_audit_logs_select_admin" on public.admin_audit_logs;
create policy "admin_audit_logs_select_admin" on public.admin_audit_logs
  for select using (public.is_admin());
