-- =============================================================================
-- PlacePrep -- Phase 6A, Company Intelligence Hub: allow bookmarking a company.
-- Run AFTER 0001-0010. Safe to re-run.
--
-- This is the ONLY schema change Phase 6A needed. Every other section on
-- the new company page (eligibility, upcoming events, most-common topics,
-- preparation resources, analytics, difficulty indicators, FAQs, related
-- companies) is derived entirely from data and endpoints that already
-- existed -- see PROJECT_STATE.md for the full breakdown of what was
-- reused vs. what (if anything) was new per section. Bookmarking a
-- company is the one thing with no existing mechanism at all: `bookmarks`
-- (migration 0001) never allowed `target_type = 'company'`.
-- =============================================================================

alter table public.bookmarks drop constraint if exists bookmarks_target_type_check;
alter table public.bookmarks add constraint bookmarks_target_type_check
  check (target_type in ('question', 'interview-experience', 'pdf', 'company'));
