-- =============================================================================
-- PlacePrep -- Phase 16: Settings Module.
-- Run AFTER 0001-0017. Safe to re-run.
--
-- Audited first, per this project's own established practice: grepped the
-- whole schema for anything settings-shaped before adding new tables.
-- Found nothing -- no preferences column anywhere, no per-user notification
-- gating, no alumni directory opt-out. `/settings` itself was still the one
-- literal ComingSoonPage stub left in the app (see router.tsx).
--
-- Most of what a "Settings" page needs turns out to need NO new database
-- state at all, because it's either already a column (profiles.full_name /
-- avatar_url / college / department / year, via the existing PATCH
-- /profiles/me) or an ACTION against something that already exists and
-- isn't app state:
--   - Theme + accessibility (reduced motion, font size) stay client-only,
--     the same pattern theme-provider.tsx already established (a value
--     that's read on next paint, not something the backend needs to know).
--   - Password change, Google account linking/unlinking, and "sign out of
--     other devices" are all Supabase Auth actions (`supabase.auth.*`) --
--     there's no PlacePrep-owned row to add a column to.
--   - Data export and delete account are one-shot actions against tables
--     that already exist (quiz_attempts, bookmarks, wrong_answer_marks,
--     questions, resources, interview_experiences, community_posts) plus
--     `auth.admin.delete_user`, which cascades through every
--     `references public.profiles (id) on delete cascade` FK already in
--     place since migration 0001 -- again, no new column.
--
-- The two pieces below are the only settings that change server *behavior*
-- (what a notification insert does, what the alumni directory query
-- returns), which is why -- and the only reason -- they need real columns.
-- =============================================================================

-- Notification category preferences. Deliberately just two toggles, not one
-- per notification type: this app has no email/SMS delivery to begin with
-- (grepped for resend/sendgrid/smtp -- none exists), so these gate the
-- in-app feed only, and only the two categories that are genuinely
-- discretionary. Everything else notify()/notify_admins() sends (extraction
-- status, question/resource/alumni review outcomes, moderation actions,
-- suspensions) is the direct result of the user's own action or their
-- account status -- muting those would hide things people actually need to
-- see, not "reduce noise".
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default
    '{"contentUpdates": true, "communityActivity": true}'::jsonb;

-- Pre-fills the "post anonymously" checkbox on the interview experience
-- submission form (services/interview_experiences.py already has a
-- per-submission `is_anonymous` flag -- this is just a remembered default
-- for it, not a second anonymity system).
alter table public.profiles
  add column if not exists default_anonymous_interview boolean not null default false;

-- Lets a VERIFIED alumnus opt out of being listed in the public Alumni
-- Directory without losing their verified badge or mentorship eligibility
-- elsewhere -- alumni.py's directory list query is updated in the same
-- pass to additionally require this. Defaults true (today's behavior: every
-- verified alumnus is listed) so this is additive, not a silent visibility
-- change for existing rows.
alter table public.alumni_profiles
  add column if not exists directory_visible boolean not null default true;

-- No RLS changes needed: `profiles_update_own` (migration 0002) and
-- `alumni_profiles_update_own_or_admin` (migration 0013) already cover
-- these columns on the user's own row, and -- same as every other write in
-- this API -- the real enforcement is server-side in settings.py via the
-- service-role client, per this project's established RLS-is-defense-in-
-- depth-only convention (see questions.py / migration 0015's own note).
