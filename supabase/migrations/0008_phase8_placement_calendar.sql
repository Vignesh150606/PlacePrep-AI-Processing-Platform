-- =============================================================================
-- PlacePrep -- Phase 8: Placement Calendar.
-- Run AFTER 0001-0007. Safe to re-run.
--
-- `public.calendar_events` has existed since Sprint 3 (0001_sprint3_schema.sql)
-- with RLS already correctly scoped for this exact feature -- select open to
-- all authenticated users, all writes (`for all`) gated to `is_admin()` --
-- but was never actually wired up to any endpoint or frontend page (grep
-- confirms zero references anywhere in server/app or client/src before this
-- pass; the route just rendered <ComingSoonPage>). Rather than create a
-- second, overlapping "placement_events" table, this pass extends the
-- existing one with the placement-drive-specific fields the brief asks for
-- (role, package, eligibility, registration deadline, venue, online/offline,
-- application link, status, a single attachment) and wires it up for real.
--
-- Scoping note: the brief asks for "Admins and Placement Coordinators" to
-- have write access. There is no "placement coordinator" role in this
-- system (`roles` only has student/alumni/admin, per Sprint 3) -- adding a
-- fourth role is a bigger identity-platform change than this pass, so
-- admin-only write access (already what the existing RLS policy enforces)
-- is what's actually implemented. Noted honestly rather than silently
-- treating "admin" as a stand-in without saying so.
-- =============================================================================

alter table public.calendar_events
  add column if not exists role text;

alter table public.calendar_events
  add column if not exists package_lpa numeric(6, 2);

alter table public.calendar_events
  add column if not exists eligibility text;

alter table public.calendar_events
  add column if not exists registration_deadline timestamptz;

alter table public.calendar_events
  add column if not exists venue text;

alter table public.calendar_events
  add column if not exists is_online boolean not null default false;

alter table public.calendar_events
  add column if not exists application_link text;

alter table public.calendar_events
  add column if not exists attachment_url text;

alter table public.calendar_events
  add column if not exists status text not null default 'upcoming'
    check (status in ('upcoming', 'ongoing', 'completed', 'cancelled'));

alter table public.calendar_events
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

create index if not exists idx_calendar_events_status on public.calendar_events (status);
create index if not exists idx_calendar_events_registration_deadline
  on public.calendar_events (registration_deadline);
