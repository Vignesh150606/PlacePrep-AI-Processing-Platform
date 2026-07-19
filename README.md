# PlacePrep

Placement Intelligence Platform for AI-assisted placement preparation.

## Workspace

```txt
PlacePrep/
  client/     React application
  server/     FastAPI application
  shared/     Shared TypeScript contracts and constants
  supabase/   SQL migrations, policies, and seed data
  docs/       Architecture and implementation notes
```

## Development

Install dependencies:

```bash
pnpm install
```

Run all JavaScript workspaces:

```bash
pnpm dev
```

The backend uses Python dependencies listed in `server/requirements.txt` --
see `server/README.md` for the full setup and deploy checklist (including
the CORS/Supabase redirect-URL gotchas that most commonly bite on first
deploy, and the `tesseract-ocr`/`poppler-utils` system packages OCR and
direct image upload need).

## Database

Apply every migration in `supabase/migrations/`, **in order**, via your
Supabase project's SQL editor: `0001` through `0016`. Each is idempotent
(safe to re-run), but they are not independent of each other.

## What's here (see `PROJECT_STATE.md` for the full, current status)

- Authentication (Google OAuth via Supabase) + protected routing, RBAC
  (student/alumni/admin) and a full Admin Portal (dashboard, user/role
  management, audit trail, moderation queues)
- PDF **and image** upload (phone photos, screenshots) -> AI extraction ->
  validation -> duplicate detection -> classification -> storage -> cleanup
  -> notification pipeline
- Question Bank, Quiz Engine (with resume/timer/palette), Quiz Attempts,
  Wrong Answer Notebook, Bookmarks, Analytics, and full Question Lifecycle
  Management (Phase 15, Part 1 -- see below; supersedes the old "Admin
  Review" approve/reject/edit/delete/merge feature set)
- Resource Intelligence Hub (cheat sheets, formula sheets, roadmaps,
  previous papers, links, videos -- submission + admin moderation)
- Interview Experience Repository (anonymity, round-by-round breakdown,
  votes, reports, admin moderation) and Placement Calendar
  (List/Calendar/Timeline views)
- Company Intelligence Hub -- every company page aggregates Questions,
  Interview Experiences, Resources, Alumni, Community discussions, and
  analytics/FAQ derived from real data
- Alumni Intelligence Network (Phase 11) -- a verified-alumni directory,
  self-submission + admin verification workflow (approve/reject/suspend/
  remove-verification/manual-verification), automatic contribution
  stats, and a mentorship-availability flag (foundation only -- no chat/
  scheduling/booking yet)
- Placement Community (Phase 12) -- a professional discussion forum
  (doubts, OA/company discussions, preparation strategies), 12 structured
  categories, nested replies, votes, tags, attachments, search/sort
  (newest/most-helpful/most-viewed/unanswered), reactive admin moderation
  (reported queue, pin/lock/delete, per-user suspension), integrated into
  Company Hub (a "Community" tab) and the Alumni module (verified badge,
  contribution stats, mentorship indicator carry over from Community
  activity too) -- no real-time chat, DMs, or mentorship scheduling (out
  of scope by design; see `PROJECT_STATE.md`'s Phase 12 section)
- Question Authoring System (Phase 13) -- three no-AI ways to grow the
  Question Bank: an Admin Manual Builder (draft/publish), Student
  Submission (always routes through Admin Review -- students never
  publish directly), and a Smart Bulk Parser (paste hundreds of
  "Q1./A.B.C.D./Answer:/Solution:"-formatted questions, get a preview
  table with per-row status -- parsed/missing answer/missing option/
  duplicate/invalid -- edit any row, then import); manually-authored and
  AI-extracted questions are indistinguishable everywhere downstream
  (Question Bank, Quiz Engine, Company Hub, Analytics, Bookmarks, Wrong
  Answer Notebook)
- Mobile Experience & PWA (Phase 14, Part 1) -- an installable PWA from
  scratch: manifest + icons, a hand-written Workbox service worker
  (`injectManifest`) with NetworkFirst API caching, CacheFirst image
  caching, a two-tier offline fallback (cached app shell, then a static
  offline page), an install prompt (including an iOS Safari "Add to Home
  Screen" variant), an update-available toast, and background sync for
  quiz submissions made offline. Plus a responsive pass: a persistent
  mobile bottom tab bar, every dialog in the app now renders as a bottom
  sheet on mobile instead of a centered modal, route-based code splitting
  for all 22 non-landing pages, and touch-target/form-layout fixes.
  Production hardening (Phase 14, Part 2) is deliberately deferred -- see
  "Not yet built" below.
- Question Lifecycle Management & Question Bank Admin UX (Phase 15, Part
  1) -- the Question Bank's "Admin Review" page is now "Manage Questions":
  every question, in every lifecycle state (draft / pending review /
  approved / archived / rejected / deleted), one page, with tabs, search,
  a source filter, pagination, multi-select + a bulk toolbar (approve /
  reject / publish / archive / unarchive / restore / delete / permanently
  delete, contextual to the active tab), a bulk field-edit dialog
  (subject / topic / company / difficulty / add-tags, each independently
  optional -- one endpoint, not five), and an "Undo" toast action on
  archive/unarchive/delete. Delete is now a **soft delete** -- recoverable
  from the Deleted tab -- not the real row delete it used to be; a new
  "Permanent Delete" is the actual irreversible one, reached from there.
  Soft-deleted questions disappear from the Question Bank, Quiz Engine,
  Company pages, Search, and the Daily Challenge (all patched to filter
  them out), same as the brief asked. A new admin-only analytics endpoint
  (status/source-type breakdown, approval rate, 30-day growth, moderator
  activity, bulk-import duplicate totals) backs two new dashboard stat
  cards (archived/deleted counts); everything is wired into the existing
  `admin_audit_logs` trail (13 new action types). "Published" is
  deliberately **not** a new status -- it's `"approved"` under the name
  the brief's lifecycle diagram uses; every downstream consumer already
  treated it that way.
- Resource Lifecycle Management (Phase 15, Part 2, Slice A) -- the
  Resource Intelligence Hub's admin page is now "Manage Resources", the
  same shape as "Manage Questions": every resource, in every lifecycle
  state (pending review / approved / archived / rejected / deleted), one
  page, with tabs, debounced search, a category filter, real pagination,
  multi-select + a bulk toolbar (approve / reject / archive / unarchive /
  restore / delete / permanently delete, contextual to the active tab), a
  bulk field-edit dialog (category / add-tags -- one endpoint, not two),
  and an "Undo" toast action on archive/unarchive/delete. Delete is now a
  **soft delete** -- recoverable from the Deleted tab -- not the real row
  delete (plus storage cleanup) it used to be unconditionally; a new
  "Permanent Delete" is the actual irreversible one, reached from there.
  A new admin-only analytics endpoint (status/category breakdown, approval
  rate, 30-day growth, moderator activity) backs two new dashboard stat
  cards (archived/deleted counts); everything is wired into
  `admin_audit_logs` (9 new action types). The archive/soft-delete/bulk
  pattern is now shared, real code (`app/services/lifecycle.py`) between
  Questions and Resources, not two copies of the same shape -- see
  `PROJECT_STATE.md`'s Phase 15 Part 2 entry. The same pattern for
  Interview Experiences, Community, and Alumni, plus Company Management
  (create/edit/archive/merge -- there is no admin company CRUD at all
  today) and the rest of the brief's analytics/audit-export work, remains
  deferred; see "Not yet built" below.
- Global search (⌘K command palette) and Daily Challenge backend (with
  streak tracking)
- Notifications (dropdown + standalone page), Dashboard, Company pages,
  PDF Library
- Basic rate limiting on upload/quiz-submission endpoints

## Not yet built

- Phase 15, Part 2 (remaining slices) -- the rest of the Global Content
  Management & Production Administration brief: archive/restore + bulk
  operations for Interview Experiences, Community (posts/comments), and
  Alumni (each already has approve/reject/edit/delete-style moderation
  from earlier phases; Part 1 added the archive/soft-delete/bulk layer for
  Questions, Part 2 Slice A added it for Resources -- both now share one
  `app/services/lifecycle.py`); Company Management (create/edit/archive/
  restore/merge -- today `companies` rows only ever come from
  `classification.py`'s get-or-create-on-first-use, there's no admin CRUD
  surface for them at all); and the non-Questions/non-Resources slices of
  analytics, plus the Global Audit System's "Export" feature. Deliberately
  split out the same way Phase 14's Part 2 was -- see `PROJECT_STATE.md`'s
  Phase 15 entries for the full reasoning and exactly what's covered so
  far.
- Production hardening (Phase 14, Part 2) -- security review (auth/RBAC/
  input validation/rate limiting/CORS/security headers), a database audit
  (indexes, constraints, cascade behavior, slow queries), an API audit
  (status codes, validation, permissions, pagination across every
  endpoint), and dead-code cleanup. This was the other half of the Phase
  14 brief; deliberately deferred to its own pass rather than done at
  reduced quality alongside Part 1 -- see `PROJECT_STATE.md`'s Phase 14
  entry for the reasoning and for exactly what Part 1 did and didn't
  cover (e.g. background sync covers one write endpoint, not all of
  them; no hand-generated iOS splash-screen image matrix).
- Real-time chat, direct messaging, and mentorship scheduling/booking --
  deliberately out of scope for both the Alumni Intelligence Network and
  the Placement Community; see `PROJECT_STATE.md`'s Phase 11/12 sections
  for exactly what's deferred and why
- A checked-in automated test suite (`pytest`/`vitest`) -- verification to
  date has been real but ad hoc: typecheck/lint/build, live migration runs
  against a throwaway Postgres instance, and targeted unit tests of pure
  logic. See `PROJECT_STATE.md` for the exact list of what was and wasn't
  verified, and how.
