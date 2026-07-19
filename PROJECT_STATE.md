# PlacePrep Project State

Last updated: 2026-07-19 (Phase 15, Part 2, Slice A -- Resource Lifecycle Management + Shared Lifecycle Framework)

## This pass, in one paragraph

Phase 15, Part 2, Slice A -- of the broader "Global Content Management &
Production Administration" brief (Resources, Interview Experiences,
Community, Alumni, Company Management, plus the cross-cutting Analytics/
Audit/Shared-Framework/UX/Security features). This pass delivered Resource
Lifecycle Management (Feature 1) and the genuine two-caller extraction of
Part 1's per-question archive/soft-delete pattern into a Shared Lifecycle
Framework (Feature 8), plus the Resources-only slices of Analytics
(Feature 6) and Audit (Feature 7) those two directly enable. Interview
Experience Management, Community Moderation, Alumni Management, and
Company Management (which still doesn't exist as an admin module at all)
remain deferred to a further pass -- the same split-brief decision this
project already made for Phase 14 and Phase 15 Part 1, for the same
reason: attempting all five content types' lifecycles plus the
cross-cutting systems in one pass, at reduced depth each, would have
violated the brief's own "no partial implementations" bar. Audited first:
read `resources.py` end-to-end, `questions.py`'s Part 1 lifecycle helpers
and `bulk_question_action`, migration 0016, and grepped every
`.table("resources")` call in the server (only `resources.py` itself and
`admin.py`'s dashboard count -- unlike `questions`, resources have no
`search.py` or `daily_challenge.py` touchpoint) before writing anything.
Same two nullable column pairs as Part 1 (`archived_at`/`archived_by`,
`deleted_at`/`deleted_by`), same new status value (`'archived'`, migration
0017), same reasoning for no separate "published" status. `DELETE /{id}`
changed from a real delete (which also did best-effort file-storage
cleanup) to a soft delete; the storage cleanup moved to the new, actually
irreversible `DELETE /{id}/permanent`. `POST /bulk-action` gained bulk
archive/unarchive/restore/permanent-delete alongside its original
approve/reject/delete; a new `PATCH /bulk-update` covers "Bulk Category
Update"/"Bulk Tag Update" as one endpoint, mirroring `bulk_update_
questions`'s shape (two fields instead of five -- a resource has no
subject/topic/company/difficulty bulk fields). `list_resources` gained a
`deleted` query param with the same admin-only, mutually-exclusive-with-
every-other-tab semantics `list_questions` already had. Feature 8 is a
genuine extraction, not a rename: a new `app/services/lifecycle.py` holds
`archive_row`/`unarchive_row`/`soft_delete_row`/`restore_row`/
`permanent_delete_row`/`run_bulk`, and BOTH `questions.py` (refactored) and
`resources.py` (new) call into it -- `questions.py`'s five per-question
helpers and its bulk-action loop were rewritten to delegate rather than
keeping a second copy of the same SQL shapes, Part 1's behavior otherwise
unchanged (one small, deliberate, non-behavioral difference: validation-
error wording is now generated from a `noun` parameter instead of
hardcoded per table). `_approve_or_reject_one`/`_publish_one` deliberately
stayed put, not pulled into the shared module -- their notification/
duplicate-recheck side effects are genuinely table-specific. A new
Resources-only analytics endpoint (status/category breakdown, approval
rate, 30-day growth, moderator activity) backs two new dashboard stat
cards; `admin.py`'s pending-resource count also picked up the same
`deleted_at is null` fix Part 1 made for questions. `admin_audit_logs`'
action check constraint gained 9 new values; the frontend's `AuditAction`
union and the audit log page's label/badge maps were extended to match
(verified programmatically -- union, filter array, and both maps all agree
on exactly 48 actions). The frontend's old "Pending Resources" page (one
status filter, no search, no pagination, `pageSize: 100` loaded in one
shot) became "Manage Resources": the same tabs-plus-search-plus-category-
filter-plus-pagination-plus-multi-select-plus-bulk-toolbar-plus-Undo-toast
shape "Manage Questions" already established (no "Drafts" tab -- a
resource is never manually drafted the way an admin-authored question
can be). Verified: Python byte-compiles clean, `ruff check` passes with
zero errors, a live import of `app.main` registers all 120 routes, and --
learning from Part 1's own note that this kind of routing collision "had
never happened before" -- a live dispatch test (not just a route-list
inspection, mocking `lifecycle.run_bulk` to prove which function actually
ran) confirms `PATCH /resources/bulk-update` invokes `bulk_update_
resources`, not `update_resource` via a swallowed `{resource_id}=
"bulk-update"`. The shared `lifecycle.py` functions were also unit-tested
directly against a mocked Supabase client: correct update payloads on the
happy path, correct validation-error wording and status codes on each
rejected transition, correct succeeded/failed split in `run_bulk`. `pnpm
install`, `pnpm -r typecheck`, `pnpm -r lint` (zero errors -- the one
warning is the pre-existing, untouched `main.tsx` fast-refresh warning),
and `pnpm -r build` (including the PWA service-worker build) all pass
clean. Everything else in the Part 2 scope -- Interview Experience
Management, Community Moderation, Alumni Management, Company Management
(still no admin CRUD for `companies` at all -- rows only ever come from
`classification.py`'s get-or-create-on-first-use), and the non-Resources
slices of Analytics/Audit -- remains deferred. See "Not yet built" in
`README.md` and this file's Phase 15 Part 2 detail section below.

## Phase 15 -- Global Content Management & Production Administration (Part 2, Slice A) detail

**The brief.** A ten-feature "Global Content Management & Production
Administration" brief, extending Part 1's Question Lifecycle pattern to
every remaining content type (Resources, Interview Experiences, Community,
Alumni), adding a Company Management module that doesn't exist yet, and
building out the cross-cutting Analytics/Audit/Shared-Framework/Admin-UX/
Security features those all share. This slice covers Feature 1 (Resource
Management) plus Feature 8 (Shared Lifecycle Framework) end-to-end, and
the Resources-only edges of Features 6 and 7. Features 2-5 (Interview
Experience, Community, Alumni, Company) are untouched.

**Schema (migration 0017).** Same shape as migration 0016: `resources`
gained `archived_at`/`archived_by` (nullable timestamptz/uuid) and
`deleted_at`/`deleted_by` (same), plus `'archived'` added to the existing
`status` check constraint (`'pending-review' | 'approved' | 'rejected' |
'archived'`). Two new indexes on `deleted_at`/`archived_at`. The
`admin_audit_logs` action check constraint was dropped and re-added with
the full existing list plus 9 new resource actions -- verified
programmatically (a small script diffing the two migrations' constraint
bodies) that nothing existing was dropped.

**Feature 8, done as a real extraction.** `app/services/lifecycle.py` is
new: `archive_row`/`unarchive_row`/`soft_delete_row`/`restore_row`/
`permanent_delete_row` (each taking a `table` name, a `fetch_or_404`
callable, and a `noun` for error wording) plus `run_bulk` (the loop-and-
collect-succeeded/failed shape both `questions.py`'s and `resources.py`'s
bulk endpoints already had their own copy of). `questions.py`'s
`_archive_one`/`_unarchive_one`/`_soft_delete_one`/`_restore_one`/
`_permanent_delete_one` were rewritten to delegate to it, and
`bulk_question_action`'s manual try/except loop now calls `lifecycle.
run_bulk`. This was a deliberate, low-risk, behavior-preserving refactor
of already-shipped Part 1 code -- not something taken lightly given "DO
NOT rewrite working code" -- verified by re-running the full Part 1
verification suite afterward (typecheck/lint/build/ruff/route-registration
all still pass) plus new unit tests directly against the shared module.
`_approve_or_reject_one`/`_publish_one` stayed in `questions.py`
unmodified -- notification calls and duplicate-recheck side effects are
table-specific, not a shape `resources.py` needs.

**Resources' lifecycle, mapped onto the shared framework.**
`DELETE /{resource_id}` used to do a real `delete()` plus best-effort
storage cleanup unconditionally; it's now `_soft_delete_one` (via
`lifecycle.soft_delete_row`), and the storage cleanup moved into the new
`_permanent_delete_one` / `DELETE /{resource_id}/permanent`. New
`PATCH /{resource_id}/archive`, `/unarchive`, `/restore` round out the
single-item surface. `POST /bulk-action` (already existed, for approve/
reject/delete) gained archive/unarchive/restore/permanent-delete, using
`lifecycle.run_bulk` instead of its own hand-rolled loop; its response
gained `undoAction` (archive<->unarchive, delete->restore -- same set
Part 1 used, approve/reject/permanent-delete excluded for the same
reason: no clean inverse). A small polish while touching this endpoint:
the toast message used to build past-tense wording by naively appending
"d" to the action name (`"delete" + "d"` reads fine, but a hypothetical
`"permanent-delete" + "d"` would not have) -- replaced with an explicit
`_BULK_ACTION_PAST_TENSE` map.

**`PATCH /bulk-update` -- registration-order hazard, avoided the same way
Part 1 first found it.** `bulk-update` and `{resource_id}` are both
single-path-segment PATCH routes, so `bulk-update` had to be registered
before `update_resource` or it would be swallowed as a `resource_id`
value. Registered correctly; verified not just by listing routes but by a
live `TestClient` dispatch with `lifecycle.run_bulk` mocked to raise a
sentinel -- the traceback confirms `resources.py`'s `bulk_update_
resources` (not `update_resource`) is what actually runs.

**`list_resources`'s Deleted tab.** Added a `deleted` query param with
identical semantics to `list_questions`': non-admins get 403 if they ask
for it; admins get ONLY soft-deleted rows when true, everything else
(status filter included) when false. `_get_resource_or_404` was left
alone -- it still fetches regardless of deleted state, since restore/
permanent-delete need to find already-deleted rows.

**Analytics (Feature 6, Resources-only).** `GET /resources/analytics/
summary`: status/category breakdowns (`count="exact"` per value, not a
full scan), archived/deleted counts, approval rate, a 30-day growth
series and moderator-activity leaderboard both aggregated from a single
bounded fetch (not per-day/per-admin round trips) -- same shape as
`questions.py`'s analytics endpoint. Backs two new dashboard stat cards
(archived/deleted resource counts); `admin.py`'s `pending_resources` count
also picked up the `deleted_at is null` filter it was missing (the same
gap Part 1 fixed for `pending_questions`).

**Frontend: "Manage Resources."** Replaces the old admin-resources-page.tsx
(one status filter via a plain `<select>`, no search, no pagination --
`useResources({ status, pageSize: 100 })` loaded everything in one shot).
Now: five tabs (Pending review / Approved / Archived / Rejected / Deleted
-- no Drafts tab, resources are never manually drafted), a debounced
search box, a category filter, real pagination (`PAGE_SIZE = 20`),
multi-select with a context-aware bulk toolbar (which buttons show depends
on the active tab, same `showApprove Reject`/`showArchive`/`showUnarchive`/
`showRestore`/`showPermanentDelete`/`showDelete` flags Manage Questions
uses), a bulk-edit dialog (category + add-tags, two fields instead of
Questions' five), and an Undo toast wired to `bulkAction`'s `undoAction`.
The existing `RejectDialog` and `EditResourceDialog` components carried
over unchanged -- both already worked, and Part 1's own convention is to
reuse rather than rebuild already-good UI. New `useResourceLifecycle`
(archive/unarchive/restore/permanentDelete) and `useBulkUpdateResources`
hooks in `use-resources.ts`, mirroring `use-admin-questions.ts`'s
`useQuestionLifecycle`/`useBulkUpdateQuestions` shape exactly.

**What this slice deliberately did NOT touch** (remains Phase 15, Part 2,
future slices): Interview Experience Management, Community Moderation,
and Alumni Management (each already has its own approve/reject/edit/
delete-style moderation from earlier phases; none of it was touched this
pass), Company Management (still no admin CRUD for `companies` at all --
rows only ever come from `classification.py`'s get-or-create-on-first-use,
and there is no merge/logo-upload/hiring-stats surface), and the non-
Resources slices of Analytics (Feature 6) and the Global Audit System's
"Export" feature (Feature 7).

## Phase 15 -- Content Management & Production Administration (Part 1) detail

**The brief.** Twelve features, aimed at giving admins "COMPLETE control
over all platform content" across Questions, Resources, Interview
Experiences, Community, Alumni, and Companies, without breaking any of
the ~30 features already shipped. Part 1 covers exactly Features 1 and 2
(Question Lifecycle Management, Question Bank Admin UX) plus the slices
of Features 8 and 9 (Audit Logs, Analytics) those two directly needed.

**Schema (migration 0016).** `questions` gained four nullable columns:
`archived_at`, `archived_by` (FK -> `profiles.id`, `ON DELETE SET NULL`),
`deleted_at`, `deleted_by` (same FK shape). Both pairs are independent of
`status` and of each other -- a draft, an approved, or an archived
question can each be soft-deleted and later restored back to whichever
status it actually had; archiving only ever happens from `'approved'`
(see below), but soft delete doesn't care what status the row is in.
`questions_status_check` gained exactly one new value, `'archived'`.
`admin_audit_logs_action_check` gained 13 new values: `question-archived`,
`question-unarchived`, `question-restored`, `question-permanently-deleted`,
`question-bulk-updated`, and bulk variants of approve/reject/publish/
archive/unarchive/restore/delete/permanent-delete. Two new indexes
(`deleted_at`, `archived_at`) back the near-universal
`deleted_at is null` filter and its inverse (the admin Deleted tab).

**Why "published" isn't a new status.** `PATCH /questions/{id}/publish`
already existed (Phase 13) and already moved a draft straight to
`'approved'`; every downstream consumer -- `list_questions`'s non-admin
branch, `search.py`, `daily_challenge.py`'s two selection queries, the
Company Hub's question tab, the admin dashboard's analytics -- already
treated `'approved'` as "this question is live." Adding a second status
value that means the exact same thing to every one of those call sites
would have been a duplicate concept dressed up as a new one. The
lifecycle diagram in the brief (Draft -> Pending Review -> Approved ->
Published -> Archived -> Restored -> Deleted) maps onto the actual
implementation as: Draft -[publish]-> Approved(-="Published") -[archive]->
Archived -[unarchive]-> Approved; and, orthogonally, any of
Draft/Approved/Rejected/Archived -[delete]-> soft-deleted
-[restore]-> (whatever it was) or -[permanent-delete]-> actually gone.

**Shared helpers, not duplicated logic.** Every transition --
`_approve_or_reject_one`, `_publish_one`, `_archive_one`, `_unarchive_one`,
`_soft_delete_one`, `_restore_one`, `_permanent_delete_one` -- is a single
function in `questions.py` that both the matching single-item endpoint
AND `bulk_question_action`'s loop call. `publish_question` (the existing
single-item endpoint) was refactored to call `_publish_one` rather than
keeping its own copy of the duplicate-check-then-update logic once that
logic needed to also be reachable from the bulk endpoint.

**Two bulk endpoints, not seven.** `POST /questions/bulk-action` (ids +
one of approve/reject/publish/archive/unarchive/restore/delete/
permanent-delete) mirrors `resources.py`'s existing `bulk-action` shape
exactly -- same loop-and-collect-succeeded/failed pattern, same one
summary audit-log entry per batch, same `{id, error}` shape for partial
failures. `PATCH /questions/bulk-update` covers the brief's five separate
"Bulk Subject/Topic/Company/Difficulty/Tags Update" items as one call with
five independently-optional fields, backed by a new
`question_authoring.reclassify_question()` helper that reuses
`classification.py`'s existing get-or-create-subject/topic/company
functions rather than inventing a second name-resolution path -- the only
genuinely new logic there is rewriting a question's existing
`question_topics`/`question_companies` join rows, which `classify()`
(a create-time, insert-only helper) never needed to do. Caveat carried
over honestly, not hidden: a question's "subject" is only ever reachable
through a topic (topics have `subject_id NOT NULL`; there's no "subject
with no topic" column), so `subject_name` alone with no existing or new
topic resolves the subject row but doesn't attach it to the question --
the exact same shape `create_question_record` already had, not a new
limitation introduced here.

**Registration-order routing hazard (real, not hypothetical).**
`PATCH /questions/bulk-update` and `PATCH /questions/{question_id}`
(the pre-existing single-item edit) are both one-path-segment PATCH
routes. Starlette matches routes in registration order and does not
prioritize literal segments over path parameters, so if `{question_id}`
had been registered first, a request to `/questions/bulk-update` would
have been swallowed as `question_id = "bulk-update"` and routed to the
wrong handler entirely -- returning a 404 "Question not found" instead of
ever reaching the bulk endpoint. Placed `bulk-update` (and `bulk-action`,
though that one had no real collision risk -- there's no single-segment
POST `/{id}` route) before the single-item PATCH in the file, and
confirmed with a Starlette route-matching simulation (not just "it
compiled") that `PATCH /questions/bulk-update` resolves to
`bulk_update_questions` and `PATCH /questions/{id}` still resolves to
`update_question`.

**Soft-deleted questions actually disappear everywhere.** Audited by
grepping every `.table("questions")` call across the server, not assumed
from reading `list_questions` alone. Fixed sites: `list_questions`'s
shared filter builder (new `deleted` param, admin-only, default
`is_("deleted_at", "null")`); `search.py`'s question search (unconditional
`is_("deleted_at", "null")`, admin or not -- search isn't the lifecycle
management surface, so it never shows deleted rows even to an admin);
`daily_challenge.py`'s weak-topic and filler selection queries (both
gained the filter); the admin dashboard's `pending_question_reviews`
count. `quizzes.py` needed no change -- it only ever resolves question
data from ids the frontend already fetched via `list_questions`, it
doesn't re-query the `questions` table by status itself.

**Frontend: "Manage Questions."** Replaces the old admin-review-page.tsx
(pending-review only, no multi-select, no bulk anything) in place --
same route (`/admin/review`), same exported component name
(`AdminReviewPage`, so `router.tsx`'s lazy import didn't need touching),
new content. Six tabs (Pending review / Drafts / Approved / Archived /
Rejected / Deleted) map onto `status` + the new `deleted` query param;
the existing source-type filter row, edit dialog, and single-item
approve/reject flow carried over unchanged. New: a debounced search box
(300ms, same local pattern `admin-dashboard-page.tsx`'s `UsersTable`
already uses -- no shared debounce hook exists in this codebase yet, so
this stays a second local copy rather than introducing one for two
callers); pagination (same `ChevronLeft`/`ChevronRight` Prev/Next pattern
as that same table); a context-aware bulk toolbar (only the actions valid
for the active tab render -- Approve/Reject only on Pending Review,
Publish only on Drafts, Archive only on Approved, Unarchive/Restore/
Permanent-Delete only on Archived/Deleted); a "Bulk edit" dialog for the
five field updates; and an "Undo" action button on the result toast for
archive/unarchive/delete (the three bulk actions with a clean one-call
inverse -- `QuestionBulkActionResult.undoAction` is `null` for the rest).
Confirmation for destructive bulk actions (delete, permanent-delete) uses
`window.confirm`, matching this codebase's existing convention
(`admin-resources-page.tsx`'s single-delete flow) rather than introducing
a new dialog-based confirmation pattern. Publishing a draft from the new
page reuses `use-question-authoring.ts`'s existing `usePublishDraftQuestion`
hook rather than adding a second hook wrapping the same
`PATCH /{id}/publish` endpoint -- the "Draft Management" section of
`admin-question-builder-page.tsx` (an admin's own drafts, personal
authoring workflow) and the new page's Drafts tab (every admin's drafts,
platform-wide oversight) are genuinely different surfaces over the same
data, not duplicate functionality.

**Analytics (Feature 9, Questions-only).** `GET /questions/analytics/
summary`: counts by status and by source type (both `count="exact"`
round trips per value, not a full-table fetch), approval rate
(approved / (approved + rejected)), a 30-day daily creation count
(bounded fetch + Python-side `Counter`, not a full scan), moderator
activity (`admin_audit_logs` rows targeting questions in the last 30
days, grouped by admin, names joined from `profiles`), and a bulk-import
duplicate total (summed from `question_import_batches.total_duplicate`
-- the one place duplicate counts are actually persisted; duplicates
blocked at single-question create time return an error and are never
written anywhere, so this figure is honestly scoped to bulk-import only,
not "all duplicates ever blocked"). Backs two new dashboard stat cards
(archived/deleted question counts); the existing summary endpoint's
`pending_question_reviews` count also picked up the `deleted_at is null`
filter it was missing.

**What Part 1 deliberately did NOT touch** (Phase 15, Part 2): Resources,
Interview Experiences, Community, and Alumni all still only have the
approve/reject/edit/delete-style moderation they already had from Phases
10-12 -- no archive, no soft delete, no bulk beyond what `resources.py`
already had going into this phase. Company Management (create/edit/
archive/restore/merge) doesn't exist at all yet -- `companies` rows are
only ever created via `classification.py`'s get-or-create-on-first-use,
there is no admin-facing CRUD surface for them. The non-Questions slices
of Feature 9's analytics (company/resource/alumni/community-wide) are
also deferred. Split out the same way Phase 14's Part 2 (production
hardening) was split from Part 1 -- a twelve-feature brief attempted in
full, at reduced depth per feature, would have violated the brief's own
"no partially implemented features" bar; a smaller, fully-verified slice
doesn't.

## Phase 14 -- Mobile Experience & PWA (Part 1) detail

**What exists (new: `client/src/sw.ts`, PWA plugin config in
`vite.config.ts`, `client/public/offline.html`, `client/public/icons/`,
`client/public/apple-touch-icon.png`, `hooks/use-pwa-update.ts`,
`components/pwa/install-prompt.tsx`, `components/pwa/offline-banner.tsx`,
`components/layout/bottom-tab-bar.tsx`, `components/layout/
route-loading-fallback.tsx`, `providers/mobile-nav-context.ts` +
`providers/mobile-nav-provider.tsx` + `hooks/use-mobile-nav-context.ts`;
modified: `components/ui/dialog.tsx`, `components/layout/app-layout.tsx`,
`components/layout/mobile-nav.tsx`, `components/layout/top-nav.tsx`,
`router.tsx`, `components/ui/button.tsx`, `index.html`, plus 25 form-grid
call sites across 7 page/dialog files):**

- **PWA strategy -- `injectManifest`, not `generateSW`:** the hand-written
  `src/sw.ts` is bundled by vite-plugin-pwa with the real precache
  manifest injected at `self.__WB_MANIFEST` (confirmed in the built
  `dist/sw.js`: 106 entries, ~1.86 MB). Chosen over the plugin's
  zero-config mode specifically so `BackgroundSyncPlugin` and
  `workbox-recipes`' `offlineFallback` could be used directly instead of
  fought around.
- **Caching strategy, by content type:** app shell (JS/CSS/HTML/icons/
  fonts) precached and served via `precacheAndRoute`; Supabase
  (`*.supabase.co`) explicitly `NetworkOnly` -- never cached, since
  serving a stale/expired auth token is worse than a clear offline state;
  `/api/v1/*` GET requests `NetworkFirst` (`placeprep-api-cache`, 6s
  network timeout, 200 entries / 24h) so a student who already opened a
  page can still read it on a spotty connection; images `CacheFirst`
  (`placeprep-image-cache`, 150 entries / 14 days).
- **Background sync, scoped deliberately:** only
  `POST /quizzes/attempts/{id}/submit` is queued via
  `BackgroundSyncPlugin` (24h max retention) when offline. This is the
  one write action where silently losing the request costs a student real
  work -- a completed quiz attempt. Every other write endpoint (bookmarks,
  community posts, admin actions, uploads, etc.) is deliberately NOT
  covered; those still fail normally offline, surfaced by the app's
  existing error-toast pattern. Extending this further is real remaining
  work, not an oversight -- several of those writes are multi-step actions
  where a queued-and-silently-replayed request could contradict state the
  user already saw change.
- **Offline fallback, two tiers:** `NavigationRoute` serves the precached
  `index.html` for any client-side route navigation (the normal case,
  works for every route once the app shell is cached); `offlineFallback`
  serves a separate static `offline.html` (no JS dependency, inline CSS
  only) only in the belt-and-suspenders case where even the app shell
  isn't available yet.
- **Icons:** generated programmatically from the existing `favicon.svg`
  brand mark (cairosvg rasterization + Pillow compositing), centered at
  ~62% scale on a solid `#0f0f14` background (the app's own dark-mode
  `--background` token) so the icon stays within the safe zone OS
  shape-masks (circle/squircle/rounded-square) won't clip. Produced at
  192/512 (manifest, incl. a `purpose: maskable` entry) and 180
  (`apple-touch-icon`). No separate iOS splash-screen image matrix was
  generated -- see "deliberately out of scope" below.
- **Install prompt, two variants:** Chromium/Android/desktop Chrome
  capture the real `beforeinstallprompt` event and re-fire it from an
  "Install" button tap; iOS Safari never fires that event at all and has
  no programmatic install API, so it gets a one-line "tap Share, then Add
  to Home Screen" instructional variant instead. Dismissal is remembered
  in `localStorage` for 14 days, not forever, since a rushed first-session
  dismissal shouldn't cost the option permanently.
- **Update flow:** `virtual:pwa-register/react`'s `useRegisterSW` hook
  (`use-pwa-update.ts`) bridges `needRefresh`/`offlineReady` into the
  app's existing `sonner` toaster instead of a bare `confirm()` --
  registration is driven from React (`injectRegister: null` in the plugin
  config) so it isn't double-registered by the plugin's own auto-injected
  script.
- **Offline visibility:** a live `navigator.onLine` banner
  (`offline-banner.tsx`), distinct from the one-time install/update
  toasts -- appears and clears itself automatically as connectivity
  changes.
- **Bottom tab bar:** four primary destinations (Dashboard, Question
  Bank, Quiz, Bookmarks) plus a "More" tab. The full nav tree (Admin,
  Community, Alumni, Calendar, Resources, Settings, etc.) is deliberately
  NOT duplicated as tabs -- "More" opens the exact same drawer `MobileNav`
  already renders, via a lifted `MobileNavContext` (split into
  `mobile-nav-context.ts` / `mobile-nav-provider.tsx` /
  `use-mobile-nav-context.ts`, mirroring this codebase's own existing
  `auth-context.ts` / `auth-provider.tsx` / `use-auth.ts` split), rather
  than mounting a second drawer instance.
- **Dialog -> responsive bottom sheet:** `DialogContent` renders as a
  full-width bottom sheet (slide-up, rounded top corners, drag-handle
  affordance, safe-area-aware bottom padding) below `lg`, and the
  original centered modal at `lg` and up. Reuses the `slide-in-bottom`
  keyframe the quiz palette sheet already defined, generalized into the
  one component every dialog in the app renders through, instead of
  staying a one-off pattern.
- **Form-grid stacking, judgment not a mechanical sweep:** searched for
  every un-prefixed `grid-cols-{2,3,...,9}` across `pages/` and
  `components/`; 25 of them, across `admin-alumni-page.tsx`,
  `placement-calendar-page.tsx`, `interview-experiences-page.tsx`,
  `community-post-composer-dialog.tsx`, `alumni-profile-dialog.tsx`,
  `resource-submission-dialog.tsx`, and `question-authoring-form.tsx`,
  were genuine form-field pairs/triples (including side-by-side
  `textarea`s in the authoring form) that would cramp badly at phone
  width; those became `grid-cols-1 sm:grid-cols-2` /
  `grid-cols-1 sm:grid-cols-3`. Three more matched the same grep
  (`placement-calendar-page.tsx`'s two 7-column week grids,
  `quiz-runner.tsx`'s 5-column palette button grid) but were deliberately
  left untouched -- those column counts are what the content IS (a week
  has 7 days; the shared palette component already fits comfortably at
  phone width), not an oversight. Dashboard/analytics/alumni stat-tile
  grids that start at `grid-cols-2` on the smallest phones were also left
  alone on purpose -- 2-up compact stat tiles is a deliberate, common
  mobile pattern, not the same failure mode as a 2-column form.
- **Route-based code splitting:** every page other than `LoginPage` and
  `DashboardPage` (the two first-paint routes) converted to
  `React.lazy(() => import(...))` in `router.tsx`, with one
  `<React.Suspense>` boundary around `AppLayout`'s `<Outlet>`
  (`route-loading-fallback.tsx`) rather than one per route. Confirmed in
  the build output: 22 separate page chunks plus `vendor-react`/
  `vendor-charts`/`vendor-motion` manual chunks, replacing the prior
  single eager bundle.
- **Touch targets:** the shared `Button` component's `icon` size variant
  went from 36px to 40px (one CVA change, applies everywhere `size="icon"`
  is used -- 21 call sites); the mobile-only search trigger in `TopNav`
  (a hand-rolled button, not the shared component) was bumped to match.
- **`viewport-fit=cover` + safe-area insets:** added to `index.html` so
  `env(safe-area-inset-*)` works, and applied to the bottom tab bar,
  install prompt, offline banner, and the mobile dialog sheet's bottom
  padding, so none of them sit under a notch or home-indicator area.

**How this was verified (real, not asserted):**

- `pnpm typecheck` (shared, then client) -- clean, after fixing two real
  errors caught along the way: a `manualChunks` overload mismatch in
  `vite.config.ts` (switched from the object-record form to the function
  form) and `self.__WB_MANIFEST` needing an explicit ambient type
  (`declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: ... }`
  in `sw.ts`).
- `pnpm lint` (oxlint, client) -- 0 errors. Two new warnings this pass
  introduced were fixed before calling it done, not left for later: an
  `exhaustive-deps` warning once `setOpen` moved from local state to
  context (added it to the dependency array -- a `useState` setter is a
  stable reference, so this is safe), and a `react-refresh/
  only-export-components` warning from mixing a hook export with a
  component export in one file (split into context/provider/hook files,
  matching this codebase's own existing `auth-context.ts` split rather
  than leaving a new inconsistency). The one pre-existing warning in
  `main.tsx` (predates this phase, confirmed by checking it against the
  unmodified file via `git stash`) is unchanged.
- `pnpm build` (client, production) -- clean, and checked past the exit
  code: `dist/` contains `sw.js`, `manifest.webmanifest`, `offline.html`,
  `icons/`, `apple-touch-icon.png`; `manifest.webmanifest`'s fields
  (name, icons array, `theme_color`, `background_color`) were read back
  from the actual built file; `dist/sw.js` was grepped for
  `placeprep-api-cache`, `placeprep-image-cache`, `quiz-submit-queue`,
  and `supabase` to confirm the runtime-caching and background-sync
  config compiled through, not just that the build didn't throw. 106
  precache entries (~1.86 MB). 22 separate lazy-route chunk files
  confirmed in the build output.
- `ruff check` (server) -- 0 errors, unchanged from Phase 13 (this pass
  touched zero server files).
- Live import: `from app.main import app` succeeds with a dummy `.env`
  (no live Supabase project in this environment) -- 107 routes, identical
  to Phase 13's count, confirming no accidental server-side regression
  from a frontend-only pass.
- **What could NOT be verified this pass** (no real browser in this
  environment, same constraint every earlier phase has noted for
  live-render behavior): the service worker actually installing/
  activating in a browser; the install prompt firing on a genuine
  Chromium `beforeinstallprompt` event, or how its iOS variant actually
  renders on a real device; the offline fallback triggering correctly
  against a real severed network; background sync actually queuing and
  replaying a request; and how the bottom sheet, bottom tab bar, and
  newly-stacked form grids actually look and feel at real phone/tablet
  viewport sizes, versus the Tailwind classes being syntactically the
  ones intended. `tsc` and a successful build catch type and bundling
  errors, not rendered layout.
- **Deliberately out of scope this pass, not overlooked:** a
  hand-generated iOS splash-screen image matrix (the many exact
  per-device-resolution PNGs Apple's older mechanism wants) -- relying
  instead on `apple-touch-icon` + `apple-mobile-web-app-capable` meta
  tags, consistent with what most production PWAs ship today; background
  sync on any write endpoint other than quiz submission; and Part 2 of
  the Phase 14 brief (security/DB/API hardening, dead-code cleanup),
  unchanged from Phase 13's deferral.

## Phase 13 -- Question Authoring System detail

**What exists (migration 0015, `question_authoring.py`, extended
`questions.py`, `use-question-authoring.ts`,
`components/questions/question-authoring-form.tsx`,
`admin-question-builder-page.tsx`, `submit-question-page.tsx`,
`admin-bulk-import-page.tsx`, extended `admin-review-page.tsx`):**

- **Shared write path** -- `question_authoring.create_question_record()`
  validates (type/difficulty/option count/at-least-one-correct), computes
  the content hash, runs `duplicate.check_duplicate()`, runs
  `classification.classify()` for subject/topic/company get-or-create
  (its confidence-driven `status` is ignored here -- every caller decides
  `status` explicitly), then does the same four-table insert
  `pipeline.py` always did. Returns `is_duplicate` (with a
  `duplicate_reason` of `"exact-hash"` or `"fuzzy-similarity"`) instead of
  raising, so a bulk import loop can count a duplicate and move to the
  next row instead of aborting. An exact content-hash match ALWAYS blocks
  (the DB's unique constraint would reject the insert anyway); a fuzzy
  near-match only blocks when the caller passes
  `block_fuzzy_duplicates=True` -- the AI pipeline does (preserving its
  exact original always-skip-on-any-duplicate behavior), manual/bulk
  callers default to leaving it as a non-blocking warning, since a human
  is right there to decide.
- **Method 1 -- Admin Manual Builder** (`POST /questions`,
  `PATCH /{id}/publish`) -- `publish: false` (default) saves `status:
  'draft'`, private to its creator; `publish: true` runs straight to
  `'approved'` (no separate review step -- the admin publishing is the
  reviewer). Draft Management is `GET /questions?mine=true&status=draft`.
- **Method 2 -- Student Submission** (`POST /questions/submissions`) --
  always `status: 'pending-review'`, `notifications.notify_admins()`
  fires the same way `resources.py`'s upload workflow already does. "My
  Submissions" is `GET /questions?mine=true`. The Review Queue
  (`admin-review-page.tsx`) gained a source-type filter row (All /
  Student submissions / Bulk import / Admin manual / AI extracted) --
  that filter IS the "Student Question Queue," not a second page. Reject
  now requires a reason (`rejectionReason`, prompted client-side, stored
  on the row) and notifies the submitter (`question-approved` /
  `question-rejected`) when the question is their own manually-authored
  or submitted one -- an AI-extracted question has no single "owner"
  checking a status page, so this notify path never existed before now.
- **Method 3 -- Smart Bulk Parser** (`POST /questions/bulk-parse`,
  `POST /questions/bulk-import`, `GET /questions/import-batches`) -- pure
  regex-based parsing (`question_authoring.parse_bulk_text`), NO AI/LLM
  call: splits on either an inline `Q<n>.` line or a `---`/`===`
  separator, detects `A./B./C./D.` options, an `Answer:` line (single or
  comma/space-separated for multi-select), a `Solution:`/`Explanation:`
  section, and optional `Difficulty:`/`Tags:`/`Company:`/`Subject:`/
  `Topic:` lines. `bulk-parse` writes nothing -- pure preview, including a
  read-only duplicate lookup against the real bank. `bulk-import` only
  imports rows the admin chose to keep (per the brief: a single bad row
  never aborts the batch -- it's a per-item result, not a fatal error) and
  records one `question_import_batches` row for Import History/Import
  Statistics.
- **Reused, not duplicated:** `services/duplicate.py`,
  `services/classification.py`, the storage upload pattern
  `resources.py` established (`{uploader}/{uuid}.ext` path, this time
  against the `interview-images` bucket -- see below), the
  `resources.py`-established "non-admins see approved OR their own
  regardless of status" RLS/app-filter pattern (now on `questions` too,
  behind an explicit `mine=true` flag rather than the default browse
  query -- see "A deliberate deviation" below), and the exact
  `resource-pending-review`/`resource-approved`/`resource-rejected`
  notification trio shape (new nouns, same shape).
- **A deliberate deviation from the `resources.py` pattern:** for
  `resources`, "own regardless of status" is the DEFAULT for a
  non-admin's browse query. For `questions`, it's only applied when the
  caller explicitly passes `mine=true`; the default Question Bank browse
  (which feeds the Quiz Engine directly) still strictly returns
  `status = 'approved'`, unchanged from before this phase. A resource
  showing up "pending" in a library list is a minor cosmetic thing; a
  non-approved question showing up in a quiz attempt is not.
- **Storage:** question images/attachments reuse the `interview-images`
  bucket (migration 0002, public, `{uploader}/{uuid}.ext` RLS) --
  provisioned in Phase 9's own migration but never actually wired to any
  endpoint until this phase. `config.py`'s new `QUESTION_ASSET_BUCKET`
  points at it, with a comment explaining the reuse, rather than
  provisioning a second public bucket for the same purpose.
- **Schema (migration 0015):** `questions` gained `source_type`
  (`AI`/`ADMIN_MANUAL`/`STUDENT_MANUAL`/`BULK_IMPORT`),
  `submission_method` (`PDF`/`IMAGE`/`TEXT`/`MANUAL`, nullable --
  pre-existing AI rows are left null rather than backfilled),
  `reviewed_by`/`reviewed_at`/`rejection_reason`, `image_urls`/
  `attachment_urls` (`text[]`), `solution_steps`/`interview_tip`/
  `reference_note`, and `'draft'` added to the status check constraint.
  New table `question_import_batches` (aggregate stats only). Extended,
  not replaced: `admin_audit_logs`' action check (+`question-published`,
  +`question-bulk-imported`) and target_type check
  (+`question-import-batch`, since a bulk-import audit entry's
  `target_id` is a batch id, not a real `questions.id` -- reusing
  `'question'` there would have been misleading); `notifications`' type
  check (+`question-pending-review`, +`question-approved`,
  +`question-rejected`).

**How this was verified (real, not asserted):**

- `pnpm typecheck` (shared, then client) -- clean on the first pass.
- `pnpm lint` (oxlint, client) -- 0 errors (1 pre-existing warning in
  `main.tsx`, unrelated to this phase).
- `pnpm build` (client, production) -- clean; existing >500kB single-chunk
  warning is pre-existing (no code-splitting has been introduced for any
  page yet, Phase 13 included).
- `ruff check` (server) -- 0 errors after fixing one ambiguous-variable-name
  lint (`l` -> `lbl` in the answer-label parser) caught on the first run.
- Live import: `from app.main import app` succeeds; enumerated all 107
  routes app-wide and confirmed every new endpoint registers at the
  expected path (`GET/POST /questions`, `POST /questions/assets`,
  `POST /questions/submissions`, `POST /questions/bulk-parse`,
  `POST /questions/bulk-import`, `GET /questions/import-batches`,
  `PATCH /questions/{id}/publish`); `app.openapi()` generates cleanly
  (81 paths) -- a real check that every new Pydantic response/request
  model is well-formed, not just that the file imports.
- `services/pipeline.py`'s refactored insert path imports and resolves
  correctly (`from app.services import pipeline, question_authoring`) --
  confirms the DRY-up didn't break the AI extraction path it replaced
  code in.
- The Smart Bulk Parser's `_split_blocks`/`_parse_block` logic was
  extracted standalone (no DB dependency) and run against a hand-built
  4-question sample covering every documented case: a clean MCQ, a
  multi-select (`Answer: A, B, D`), a question with no options at all,
  and a question whose answer letter doesn't match any option -- all
  four classified correctly before this logic was pasted into the real
  service module.
- **What could NOT be verified this pass** (no live Supabase project in
  this environment, same constraint every earlier phase has noted): the
  migration was not run against a real Postgres instance (SQL was
  proofread twice, including a cross-check of the full prior
  `admin_audit_logs`/`notifications` check-constraint lists against
  migration 0014 to make sure extending them didn't silently drop an
  existing value); the `interview-images` bucket reuse (public URL
  generation, upload RLS) was not exercised against a live bucket; no
  browser/live-render check of the three new pages or the shared
  authoring form (react-hook-form + zod validation, the options
  field-array, image/attachment upload UI) -- `tsc` catches type errors,
  not runtime/rendering behavior.

## Phase 12 -- Placement Community detail

**What exists (migration 0014, `community.py`, `use-community.ts`,
`components/community/*`, `community-page.tsx`,
`community-post-detail-page.tsx`, `admin-community-page.tsx`):**

- `community_posts` -- `author_id` (FK to `profiles`), `is_anonymous`,
  `category` (12-value check constraint: General Placement, Aptitude,
  DSA, Core Subjects, HR Interview, Technical Interview, Company
  Specific, Off Campus, Higher Studies, Resume Review, Mock Interview,
  Resources), `title`/`description`, optional `company_id` + denormalized
  `company_name` fallback, `tags text[]`, `attachments jsonb` (up to 4
  files, reusing the EXISTING `pdfs` storage bucket and the same
  `{uploader}/{uuid}.ext` path convention `resources.py` uses), and four
  real, trigger-maintained counters: `view_count` (RPC-incremented, same
  shape as `increment_resource_downloads`), `helpful_count`/
  `not_helpful_count` (from `community_post_votes`), `reply_count` (from
  `community_comments`, powers the "Unanswered" filter as
  `reply_count = 0` -- a real DB-side filter, not client-side). Plus
  `is_pinned`/`is_locked` (admin-only moderation flags).
- `community_comments` -- nested replies via a self-referencing
  `parent_comment_id`; the backend returns a flat, chronologically
  ordered list and the frontend (`community-comment-thread.tsx`) builds
  the tree client-side, same division of labor
  `interview_experience_rounds` already established. `helpful_count` is
  likewise a real trigger-maintained column.
- `community_post_votes` / `community_comment_votes` -- toggle semantics
  identical to `interview_experience_votes` (vote again with the same
  type to retract; vote with the other type to switch).
- `community_post_reports` / `community_comment_reports` -- identical
  shape to `interview_experience_reports`; report counts are computed
  fresh per admin request (same "small table, Python de-dupe" approach
  `admin.py`'s dashboard summary already used for experience reports),
  not denormalized.
- `profiles.community_suspended` (+ `_reason`/`_at`/`_by`) -- extends the
  EXISTING `profiles` table (same reasoning `role_id` already lives
  there) rather than a new user-status table. Scoped to Community
  posting privileges specifically, not a site-wide ban -- there's no
  site-wide suspension concept anywhere else in this codebase to reuse,
  and inventing one here would be broader than the brief asked for.
- Alumni integration -- `sync_alumni_contribution_from_community_post`,
  `sync_alumni_contribution_from_community_comment`,
  `sync_alumni_helpful_from_community_post_vote`,
  `sync_alumni_helpful_from_community_comment_vote`: four triggers that
  feed the EXISTING `alumni_profiles.contribution_count`/
  `helpful_votes_received` counters Phase 11 introduced. A verified
  alumnus's post/comment authorship shows a verified badge
  (`ShieldCheck`) and, where set, a "open to mentoring" indicator --
  reusing `alumni_profiles.mentorship_available` -- next to their name
  everywhere in the Community UI.
- `community.py` (22 routes) -- list/get/create/update/delete posts;
  pin/lock (admin-only, separate from content-edit `PATCH` so each toggle
  gets its own audit-log action); vote/report; attachment download
  (mints a short-lived signed URL, same pattern
  `resources.py`'s `download_resource` uses); nested comment CRUD +
  vote/report; admin reported-posts/reported-comments queues + dismiss;
  user suspend/unsuspend; and `/community/meta/analytics` (deliberately
  NOT `/community/analytics`, to avoid the exact route-ordering trap
  `alumni.py`'s docstring calls out between `/{alumni_id}` and a bare
  `/analytics` -- verified directly against the live route table, not
  just asserted, see Verification below).
- Frontend -- `use-community.ts` (every endpoint above, TanStack Query),
  `community-post-card.tsx`/`community-post-filters.tsx`/
  `community-post-composer-dialog.tsx` (multipart attachment upload, same
  `FormData` pattern `use-resources.ts` established)/
  `community-comment-thread.tsx` (recursive nested rendering), and three
  pages: `/community` (list + filters + composer), `/community/$postId`
  (detail + votes/report/bookmark/inline edit/delete + comment thread),
  `/admin/community` (reported queues + pin/lock/dismiss/suspend). Company
  Hub's new Community tab and Admin Dashboard's new stat card both reuse
  these same components/hooks rather than parallel implementations.
- Bookmarks (`target_type = 'community-post'`) and notifications
  (`'community-reply'` -- finally used; plus new
  `'community-post-reported'`/`'community-comment-reported'`/
  `'community-account-suspended'`) extend the existing generic tables;
  neither module needed a code change beyond the check-constraint
  extension (Community wasn't a new concept to either system).

**Deliberately deferred (explicit in the brief):** real-time chat, direct
messaging, mentorship scheduling/booking. `mentorship_available` (Phase
11) continues to be display-only.

**Verification (real, not asserted):**

- `pnpm typecheck` (shared, then client) -- clean. One real bug caught
  and fixed: the post composer cast `category` to the zod schema's
  `string` field type instead of the shared `CommunityCategory` union;
  `tsc` correctly rejected the assignment.
- `pnpm lint` (oxlint) -- 0 errors (one pre-existing, unrelated warning
  in `main.tsx` about fast-refresh export shape, not touched this pass).
- `pnpm build` -- production build succeeds (`vite build`, 2892 modules
  transformed).
- `ruff check` (server) -- all checks passed.
- `python -m py_compile` across all 51 server `.py` files -- clean.
- Live import of `app.main` -- 100 total routes, 22 under `/community`,
  matching `community.py` route-for-route.
- OpenAPI schema generation via `TestClient` (`/openapi.json`) -- 200 OK,
  every Community Pydantic response model resolves cleanly.
- Route-resolution test (bypassing auth, matching directly against
  `app.router.routes`) -- specifically targeted the ordering concern
  called out above: confirmed `GET /community/admin/reported-posts`,
  `GET /community/admin/reported-comments`, `GET /community/meta/analytics`,
  `DELETE /community/admin/reported-posts/{id}/dismiss`,
  `POST /community/admin/users/{id}/suspend` all resolve to their
  intended handlers and are never shadowed by the `GET/PATCH/DELETE
  /community/{post_id}` catch-alls, regardless of registration order (the
  literal second path segment on every admin/meta route -- `reported-posts`,
  `reported-comments`, `analytics`, `dismiss`, `suspend` -- never
  collides with a route pattern that expects a different literal there,
  so this turned out not to be the same trap `alumni.py` hit with its
  single-segment `/analytics`/`/me`, but it was verified directly rather
  than assumed safe).

**What could NOT be verified from here:** no live Supabase project to run
migration 0014 against (same limitation every prior phase has noted) --
the SQL has been read closely against the existing migrations' exact
conventions (trigger naming, `security definer set search_path = public`,
`drop ... if exists` before every `create`) but not executed. Flagged for
manual application via the Supabase SQL editor, in order, after 0013.

## Phase 11 -- Alumni Intelligence Network detail

**Audit first** (see the migration file's own docstring for the full
reasoning): grepped every prior migration and every `.py`/`.ts`/`.tsx`
file for "alumni" -- found exactly one hit, the plain RBAC role. No
alumni profile model, no verification workflow, no directory, nothing to
reuse beyond that role id and the identity/companies/moderation/
audit/notification infrastructure every other content-moderation module
in this app already shares.

**New migration**, `supabase/migrations/0013_phase11_alumni_intelligence_network.sql`:
- `alumni_profiles` table -- one row per `profiles.id` (`profile_id uuid
  unique`), optional `current_company_id` FK + always-populated
  `current_company_name` free text (same fallback shape `resources.author`
  established), `job_title` (NOTE: not `current_role` -- `CURRENT_ROLE` is
  a reserved SQL keyword, so that's a genuine constraint, not a style
  choice; the API/frontend still call it `currentRole` -- only the actual
  column name differs, mapped in `alumni.py`), `department`,
  `graduation_year`, `location`, `skills`/`domains`/`technologies`
  (`text[]`, GIN-indexed), free-text bio/career-journey/preparation-
  strategy/resume-tips/interview-tips/placement-advice, `availability_status`
  (general reachability -- distinct from `mentorship_available`),
  `linkedin_url`/`portfolio_url`/`github_url`, a future-ready (currently
  unused, per the brief) `institution_email` column, the verification
  lifecycle (`verification_status` -- `pending-review`/`verified`/
  `rejected`/`suspended`, deliberately 'verified' not 'approved' since this
  is identity verification, not content moderation; `verification_method`
  -- `self-submitted`/`admin-manual`/`institution-email`;
  `verified_by`/`verified_at`/`rejection_reason`), and two denormalized,
  trigger-maintained counters:
  - `contribution_count` -- real, sortable "Most Contributions". Two new
    trigger functions (`sync_alumni_contribution_from_experience`/
    `..._from_resource`) on `interview_experiences`/`resources`
    (tables this migration doesn't own) recompute it incrementally on
    every insert/status-change/delete, scoped only to `approved` rows --
    no full rescan, same "trigger on the other table" shape
    `sync_resource_bookmark_count` (migration 0012) established.
  - `helpful_votes_received` -- real, sortable "Most Helpful". A new
    trigger (`sync_alumni_helpful_votes`) on `interview_experience_votes`
    handles INSERT/DELETE **and** UPDATE OF `vote_type` -- unlike the
    bookmark-count trigger, `interview_experiences.py`'s `vote_experience`
    has a genuine update path (voting the other way replaces the row in
    place), verified end-to-end against a real local Postgres instance
    (see "How this pass was verified" below).
- Extended (not replaced) `admin_audit_logs_action_check` (+
  `alumni-verified`/`alumni-rejected`/`alumni-edited`/`alumni-suspended`/
  `alumni-verification-removed`/`alumni-deleted`/`alumni-manual-created`),
  `admin_audit_logs_target_type_check` (+ `'alumni'`), and
  `notifications_type_check` (+ `alumni-verification-pending`/
  `alumni-verified`/`alumni-rejected`/`alumni-suspended`).
- RLS: select = verified OR own row OR admin; insert = own row OR admin;
  update = own row OR admin (a verified alumnus can keep their own bio/
  tips/availability/mentorship flag current without admin involvement for
  every small edit); delete = admin only. Every real write goes through
  the service-role client and bypasses RLS regardless (same as every
  other table in this system) -- these are defense-in-depth, written to
  match the actual visibility rules `alumni.py` enforces.

**New endpoint module**, `server/app/api/v1/endpoints/alumni.py` (10 routes):
`GET /alumni` (list -- verified-only for non-admins plus their own profile
regardless of status; admins can filter by `status` to work the queue;
filters: search/company/department/graduation-year/domain/skill/
mentorship; sort: newest/most-helpful/most-contributions), `GET
/alumni/analytics` (open to any signed-in user -- powers both the public
directory header and the Admin Alumni page's stats, not duplicated in two
endpoints), `GET /alumni/me`, `GET /alumni/{id}`, `POST /alumni`
(self-submission -- always `pending-review`, profile_id forced to the
caller, never self-promotes), `PATCH /alumni/me` (self-edit, any
verification status), `PATCH /alumni/{id}` (admin edit), `PATCH
/alumni/{id}/status` (Approve/Reject/Suspend/Remove Verification, with a
real state-transition guard -- e.g. you can't "reject" an already-verified
profile; verifying/suspending/removing-verification is the ONLY codepath
that ever moves `profiles.role_id`, reusing the exact same role-change
write `admin.py`'s `update_user_role` performs, not a parallel mechanism),
`POST /alumni/manual` (admin "Manual verification" -- creates AND
verifies in one step for a user who can't self-submit), `DELETE
/alumni/{id}`.

Name/avatar/email are never duplicated onto `alumni_profiles` -- a
batched `_profiles_for()` lookup reads them from the existing `profiles`
table per request (this table has TWO foreign keys into `profiles`
-- `profile_id` and `verified_by` -- so an unqualified PostgREST embed
would be ambiguous anyway; same reasoning `interview_experiences.py`
already avoids embedding `profiles` for the identical two-FK reason).

**Admin Portal integration** (extended, not replaced): `admin.py`'s
`DashboardSummary` gained `pending_alumni_verifications`;
`_VALID_AUDIT_TARGET_TYPES` gained `'alumni'`. New page `/admin/alumni`
(`AdminAlumniPage`) -- status-filtered queue, Verify/Reject/Suspend/Remove
Verification/Edit/Delete per row, a Manual Verification dialog (searches
existing users via the same `useAdminUsers` the Users & Roles page uses),
contribution stats. New nav entry "Pending Alumni Verification" and a
dashboard stat card, both admin-gated the same way every other admin-only
surface in this app already is.

**Company Hub integration**: `company-detail-page.tsx` gained an Alumni
tab -- verified alumni at that company, reusing the exact same
`useAlumni`/`AlumniCard` the Alumni Directory page itself uses (same
"not a parallel implementation" reasoning the existing Resources tab
established for Phase 10).

**Frontend**: `shared/src/types/alumni.ts` (new shared types), `use-alumni.ts`
(hook, mirrors `use-resources.ts`), `alumni-card.tsx`/`alumni-filters.tsx`/
`alumni-profile-dialog.tsx` (new components), `alumni-directory-page.tsx`
(`/alumni` -- public directory with an analytics header, deliberately
routed separately from `/community`'s still-unbuilt stub per the brief),
`admin-alumni-page.tsx` (`/admin/alumni`).

**Mentorship (foundation only, per the brief)**: a single
`mentorship_available` boolean on `alumni_profiles`, surfaced as a filter
and a badge. No chat, scheduling, booking, or notifications table for it
-- those are explicitly out of scope this pass.

**How this pass was verified** (real, not asserted): `pnpm typecheck`
(shared, then client) clean; `pnpm lint` (oxlint) clean (one pre-existing,
unrelated warning in `main.tsx`); `pnpm build` clean; `ruff check .` clean;
a live Python import of `app.main` confirming route count (68 -> 78, +10
alumni routes, registered in the correct order -- `/analytics` and `/me`
before the `/{alumni_id}` catch-all) and `py_compile` across all 50
server files. Beyond that: installed a throwaway local PostgreSQL 16
instance, stubbed the minimum of Supabase's managed `auth`/`storage`
schemas migrations 0001-0012 already depended on, and replayed
migrations 0001 through 0013 end-to-end against it from empty -- caught a
real bug this way (`current_role` as a bare column identifier is a syntax
error, since `CURRENT_ROLE` is a reserved SQL keyword; renamed the column
to `job_title`, kept the API/frontend-facing field as `currentRole`).
Then exercised both new triggers with real rows: inserted a pending
interview experience by a verified alumnus (`contribution_count` correctly
stayed 0), approved it (`contribution_count` -> 1), cast a "helpful" vote
(`helpful_votes_received` -> 1), flipped the same vote to "not-helpful"
(`helpful_votes_received` -> 0, confirming the UPDATE OF `vote_type` path
works, not just INSERT/DELETE), then rejected the previously-approved
experience (`contribution_count` -> 0). All five steps produced the
expected number.

**Deliberately not built this pass** (explicitly out of scope per the
brief): Community, Messaging, and full Mentorship (chat/scheduling/
booking/notifications) -- only the foundation flag for the last one.
Institution-email auto-verification is schema-ready (`institution_email`
column exists) but not implemented -- no verification logic reads it yet.

## Phase 10 -- Resource Intelligence Hub detail (previous pass)

**Audit first** (see the migration file's own docstring for the full
reasoning): confirmed via grep across every prior migration that no
generic `resources` table existed; confirmed `subjects`/`topics` RLS
(`subjects_select_all`/`topics_select_all`, migration `0002`) had no
endpoint ever built against it; confirmed `bookmarks`, `admin_audit_logs`,
and `notifications`' check constraints were the only three schema pieces
that needed extending (not replacing) to plug a fifth content type in.

**New migration**, `supabase/migrations/0012_phase10_resource_intelligence_hub.sql`:
- `resources` table -- `category` (13-value CHECK: `company`/`subject`/
  `topic`/`aptitude`/`technical`/`interview`/`cheat-sheet`/`formula-sheet`/
  `roadmap`/`previous-paper`/`external-link`/`video`/`pdf-notes`),
  optional `subject_id`/`topic_id`/`company_id` FKs (any resource can be
  tagged by any/none of these regardless of its category), optional
  `difficulty`, `tags text[]`, free-text `author` (distinct from
  `uploaded_by` -- the submitter is very often not the original creator),
  `file_storage_path`/`file_name`/`file_size_bytes`/`file_kind` OR
  `external_url` (a `resources_has_content` CHECK requires at least one),
  `version int` (real edit-revision counter, only bumped by
  `update_resource` when a field actually changes), the standard
  `pending-review`/`approved`/`rejected` `status` lifecycle plus
  `reviewed_by`/`reviewed_at`/`rejection_reason`, and two denormalized,
  mechanically-maintained counts:
  - `bookmark_count`, kept in sync by a new trigger on `bookmarks`
    (`sync_resource_bookmark_count`, scoped to `target_type = 'resource'`
    only -- every other target type untouched) -- a deliberate departure
    from `interview_experience_votes`' "always compute fresh" approach,
    because "Most Bookmarked" needed to be a real, paginatable DB sort,
    not just a display number.
  - `download_count`, incremented via a new atomic RPC
    (`increment_resource_downloads`), same race-avoidance pattern Phase 6's
    `bulk_increment_question_stats()` established.
- Extended (not replaced) three existing CHECK constraints:
  `bookmarks_target_type_check` (+ `'resource'`), `admin_audit_logs_action_check`
  (+ 7 resource actions) and its `target_type_check` (+ `'resource'`),
  `notifications_type_check` (+ `resource-pending-review`/`resource-approved`/
  `resource-rejected` -- alongside `new-resource`, which migration `0001`
  had already anticipated back in Sprint 3 but nothing had used until now).
- RLS mirrors `interview_experiences`' exact shape: select
  (`approved` OR own OR admin), insert (own row only), update/delete
  (admin only) -- defense-in-depth, since every write already goes through
  the service-role client.

**New backend, `subjects.py` / `topics.py`** (2 routes total): minimal
read-only lists completing a read-surface that already had tables + RLS
but no endpoint, so the Resource submission form can offer real subject/
topic ids instead of free text.

**New backend, `resources.py`** (8 routes): list (search/category/company/
subject/topic/difficulty/tags/status/sort_by, all server-side --
deliberately not the "fetch everything, filter client-side"
`useQuestionFilters` pattern, since this taxonomy is wide enough that
wouldn't scale the way it does for a few hundred questions), get-one,
create (multipart, file OR external link, reuses the exact `pdfs.py`
upload-validation/storage-path convention), download (mints a short-lived
signed URL for a file resource since the `pdfs` bucket is private, or
hands back the external link as-is; either way atomically increments
`download_count`), status update (approve/reject with required rejection
reason), edit (bumps `version` only on a real change), delete (also
removes the underlying storage object for file-based resources -- there
was no existing precedent for this in the codebase, since `pdf_resources`
has no delete endpoint at all, so this is fresh cleanup logic, not a copy),
and **bulk-action** (approve/reject/delete many at once, reusing the exact
same per-item logic as the single-item endpoints rather than a second
implementation, one summarizing audit-log entry per batch instead of one
per item).

**Admin integration** (no separate admin module, per the brief): 
`admin.py`'s dashboard summary gained `pendingResourceReviews` (same
count-per-status-query style as every other stat there); the audit
target-type/action lists gained `resource`/8 new actions; a new
`AdminResourcesPage` at `/admin/resources` -- its own route, same as
Question Bank moderation already gets its own `/admin/review` instead of
living inside the dashboard -- with a moderation queue, per-item approve/
reject/edit/delete, and a checkbox-driven **Bulk Actions** toolbar (select-all
+ per-row select + bulk approve/reject/delete), which is a genuinely new
UI pattern in this codebase (neither `admin-review-page.tsx` nor
`interview-experiences-page.tsx`'s admin actions had bulk selection to
copy from).

**Company Hub integration:** the existing `company-detail-page.tsx`
Resources tab (previously PDF-only) now shows two labeled subsections --
"Preparation PDFs" (unchanged) and "Resource Library" (new, reuses the
exact `ResourceCard` component the Resource Library page itself renders,
filtered to `companyId` + `status=approved`) -- rather than a second,
parallel resources tab.

**New frontend:** `resource.ts` (shared types), `use-subjects.ts`/
`use-topics.ts`/`use-resources.ts` (hooks), `resource-card.tsx`/
`resource-filters.tsx`/`resource-submission-dialog.tsx` (components),
`resource-library-page.tsx` (the main `/resources` page) and
`admin-resources-page.tsx`. Wired into `router.tsx` (`/resources`,
`/admin/resources`), `nav-items.ts` ("Resource Library" under Prepare,
"Pending Resources" under Admin), and `admin-dashboard-page.tsx` (new stat
card linking to the queue). Existing modules untouched beyond the minimal
integration edits above -- no redesign, no nav restructuring, no
duplicated components.

**Deliberately not built this pass:** Alumni, Community, Mentorship --
explicitly out of scope per the brief, same "stop here" boundary every
prior pass in this file has respected for adjacent unbuilt modules.

**Verified (real, not asserted):**
- `pnpm typecheck` (shared + client), `pnpm lint` (oxlint -- 0 errors,
  same 1 pre-existing `main.tsx` fast-refresh warning carried forward
  unchanged), `pnpm build` (production Vite build) -- all pass.
- `ruff check` on the full `server/app` tree -- 0 issues.
- **Installed a real, throwaway PostgreSQL 16 instance** (via `apt-get`)
  and ran migrations `0001` through `0012` in sequence for real against a
  minimal `auth`/`storage` shim -- all twelve apply cleanly, and `0012`
  was additionally re-run a second time to confirm it's idempotent (every
  `drop ... if exists` / `create or replace` / `create index if not
  exists` genuinely no-ops on a second run rather than erroring).
- **Functionally tested the new trigger and RPC against real rows**, not
  just read for syntax: inserting a `bookmarks` row with
  `target_type='resource'` incremented the target's `bookmark_count` by
  exactly 1, deleting it decremented back to 0, and (critically) inserting
  an unrelated `question`-type bookmark that happened to reuse the same
  UUID as a resource's id did *not* touch `bookmark_count` -- confirming
  the trigger's `target_type` guard actually works, not just its happy
  path. `increment_resource_downloads()` was called twice against the
  same row and returned `1` then `2`, matching the row's own
  `download_count` read back afterward. The `resources_has_content` CHECK
  was confirmed to genuinely reject an insert with neither a file nor a
  link.
- **Functionally exercised all 8 `resources.py` routes end-to-end**
  through FastAPI's `TestClient` against a purpose-built in-memory fake
  standing in for the Supabase client (not just import-and-boot): a
  40-assertion scenario covering submit -> pending-review -> a second
  student can't see it -> admin can (via `status` filter) -> approve ->
  now visible to everyone -> edit bumps `version` (a no-op edit does not)
  -> download increments `download_count` twice -> non-admin gets 403 on
  status/delete -> bulk-approve two resources at once (plus one unknown
  id correctly reported as failed, not a 500) -> bulk-reject without a
  reason correctly 422s -> deleting a file-backed resource actually
  removes the fake storage object -> the audit log contains every
  expected action. All 40 checks passed; the two real bugs this caught
  before they shipped (a `resource-bulk-rejectd` string-formatting typo
  in the bulk audit-action name, and the download endpoint originally
  being `GET` instead of `POST` despite mutating state) are both fixed in
  the code above, not just noted here. The test harness itself was
  removed after use -- this codebase still has no checked-in automated
  suite (see the standing caveat below), and one ad hoc verification
  script isn't a substitute for one.
- Confirmed route registration by count: 68 total routes, up from 58
  (8 `resources.py` + 1 `subjects.py` + 1 `topics.py`).

**What could NOT be verified** (same standing caveat every pass in this
file carries): no live Supabase project, so PostgREST's actual embed
syntax (`subjects(id,name)`/`topics(id,name)`/`companies(id,name)` off
`resources`), real RLS enforcement under a real JWT's `auth.uid()`, and
the real Storage API's `create_signed_url()` response shape were
confirmed by reading the installed `storage3` library's source and
matching existing call sites, not by an actual call against a live
project. Migration `0012` itself needs to be applied via the Supabase SQL
editor/CLI, same as every migration before it, before any of this works
in production.

## Phase 6A -- Company Intelligence Hub detail (previous pass)

**Per-section reuse breakdown** (the point of doing the audit first):

| Section | Source | New backend? |
|---|---|---|
| Overview | `useCompany()` (already existed) | No |
| Eligibility criteria | nearest upcoming `/calendar?company_id=` event's `eligibility` field | No |
| Upcoming placement events | `usePlacementEvents({ companyId })` (already existed) | No |
| Interview Experiences | `useInterviewExperiences({ companyId })` (already existed) | No |
| Question Bank filtered by company | `useQuestions()` + client filter (same as before) | No |
| Most common topics | `question.topic` + `experience.keyTopics`, aggregated client-side | No |
| Preparation resources | `usePdfs()` + client filter on `companyId`/`processingStatus` | No |
| Analytics | difficulty/outcome distributions computed from the two lists above | No |
| Difficulty indicators | same computation, `DifficultyBadge` + a progress-bar idiom copied from `analytics-page.tsx`'s existing coverage bars | No |
| FAQs | derived Q&A from company fields + the aggregations above (nothing shown without a real number behind it) | No |
| Related companies | `useCompanies()` (already existed), scored by shared industry/tier | No |
| Bookmark support | `useBookmarks()` (already existed) | **Yes -- migration 0011** |

**The one schema change:** `supabase/migrations/0011_phase6a_company_bookmarks.sql`
extends `bookmarks`' `target_type` check constraint to add `'company'`.
RLS didn't need touching -- `bookmarks_all_own` was already generic over
`user_id`, not `target_type`. `bookmarks.py` gained one line
(`"company"` added to `_VALID_TARGET_TYPES`); no new endpoint.

**Reused, not duplicated:** `EventRow` (from `placement-calendar-page.tsx`)
and `ExperienceCard`/`SubmissionDialog` (from `interview-experiences-page.tsx`)
are now both exported and rendered directly on the company page --
`EventRow` read-only there (`isAdmin` forced `false`, no-op edit/delete
callbacks) rather than pulling the full admin edit-dialog machinery onto
what's meant to be a student-facing page. `CompanyCard` (from
`companies-page.tsx`) is reused as-is for Related Companies. `ROUND_TYPE_LABELS`/
`OUTCOME_VARIANT` moved out of `interview-experiences-page.tsx` into a new
`client/src/lib/interview-labels.ts` so both pages import the same
mapping instead of duplicating it (and so exporting them doesn't trip the
react-refresh "only export components" lint rule on a page file).

**Caught during implementation, not after:** the first draft called two
`useMemo`s (`topicCounts`, `outcomeCounts`) *after* the component's
loading/error early-returns -- a Rules of Hooks violation oxlint caught
immediately (`react-hooks/rules-of-hooks`, 2 errors). Fixed by moving all
hook calls (the two `useMemo`s, plus the `questions` filter that feeds
them) above the early returns, using `company?.id` optional chaining
since `company` isn't confirmed non-null until after those returns.

**Verified:** `pnpm typecheck` (shared + client), `pnpm lint` (oxlint, 0
errors -- same 1 pre-existing unrelated `main.tsx` warning as always,
confirmed it's still the only one), `pnpm build`, `ruff check`, and a live
boot of `app.main` confirming route count is unchanged at 58 (this module
added zero new routes, by design). Routing: `/companies/$slug` still
resolves to `CompanyDetailPage` unchanged; no circular imports between
`company-detail-page.tsx` and the two pages it now imports from (verified
by grep + the build succeeding).

**Not done, per the brief:** Alumni Network and Community are explicitly
out of scope for this pass. Company profile fields (eligibility as a
standing company attribute, rather than derived per-event) would need an
admin-facing company-editing UI, which doesn't exist yet (`companies.py`
has never had a create/update endpoint) -- not built here since it wasn't
one of the 11 requested sections and the per-event derivation already
covers the ask.

## Admin Portal Expansion -- Module 2 detail (previous pass)

**New migration**, `supabase/migrations/0010_admin_portal_audit_logs.sql`:
`admin_audit_logs` table (12-action CHECK constraint covering every admin
write that exists today, `target_type` in `pdf`/`question`/
`interview-experience`/`user`, `metadata jsonb` for action-specific
detail), 3 indexes (`admin_id`, `created_at desc`, `(target_type,
target_id)`), RLS enabled with a single admin-only select policy reusing
the existing `public.is_admin()` helper function (same pattern as
migration `0009`'s `interview_experience_reports` policy). No insert/
update/delete policy -- all writes go through the service-role client,
same as every other table.

**New service**, `server/app/services/audit.py`: one function,
`log_admin_action(admin_id, action, target_type, target_id, metadata)`,
mirroring the existing `notifications.py` service shape. Deliberately
*not* wrapped in try/except -- `notifications.notify()` already doesn't
swallow failures at its call sites (e.g. in `pdfs.py`'s `approve_pdf`),
so making audit logging fail differently would be a new, inconsistent
failure mode rather than a fix.

**Wired into every existing admin write**, right after the state-changing
DB call succeeds (same placement `notifications.notify()` already uses):
`pdfs.py` (`approve_pdf`, `reject_pdf`), `questions.py`
(`update_question_status`, `update_question`, `merge_question`,
`delete_question`), `interview_experiences.py` (`update_status`,
`update_experience`, `delete_experience`), and `admin.py`
(`update_user_role` -- now records `{from, to}` role names in metadata).
Each of these endpoints' `_admin` parameter (previously unused, hence the
underscore) became `admin_user` since the audit call now needs the
caller's id.

**New endpoint**, `GET /admin/audit-logs` in `admin.py`: paginated,
optional `action`/`target_type` filters. Resolves each entry's admin name
via a batch `profiles` lookup (`.in_("id", admin_ids)`) rather than a
Postgrest FK-embed -- there was no existing precedent in this codebase for
embedding `profiles` through a single FK column, and the batch-lookup-then-
merge approach already has one (`processing.py`'s pdf-name lookup), so
that's what this copies rather than guessing at untested join syntax.

**New frontend:** `admin-audit-log-page.tsx` (filterable/paginated table,
color-coded action badges, a "View" link out to the relevant existing
page per target type) and the matching hooks/types appended to
`use-admin.ts`. Wired into `router.tsx` as `/admin/audit-log`, into
`nav-items.ts` as "Audit Log" under the Admin section, and linked directly
from the Admin Dashboard header.

**Verified:** `pnpm typecheck` (shared + client), `pnpm lint` (oxlint,
0 errors, same 1 pre-existing `main.tsx` fast-refresh warning as before),
`pnpm build`, `ruff check`, and a live Python import of `app.main`
confirming the new route registers (58 total routes, up from 57). The
migration SQL itself could not be run against a live database from this
environment (no DB access here) -- it needs to actually be applied via
the Supabase SQL editor/CLI before the new endpoints will work; everything
else (schema shape, RLS policy, index names) was checked by hand against
migrations `0001`/`0002`/`0009`'s exact conventions rather than assumed.

## Admin Portal Expansion -- Module 1 detail (previous pass)

**New backend module**, `server/app/api/v1/endpoints/admin.py`, mounted at
`/admin` (3 routes, `require_admin`-gated, no schema migration needed --
reuses `profiles`/`role_id` as-is):
- `GET /admin/dashboard-summary` -- counts mirrored from each existing
  table (`pdf_resources`, `questions`, `interview_experiences`,
  `processing_jobs`, `interview_experience_reports`, `profiles`), same
  count-per-status query style as `processing.py`'s existing dashboard.
- `GET /admin/users` -- paginated, `search` (ilike on name/email),
  `role` filter. Same `page`/`page_size`/`count="exact"` pattern as
  `pdfs.py`/`questions.py`.
- `PATCH /admin/users/{id}/role` -- validates the target role, blocks an
  admin from changing their own role (self-lockout guard), updates
  `role_id`.

**New frontend:** `admin-dashboard-page.tsx` (stat cards + searchable/
filterable/paginated user table with a role-change dropdown) and
`use-admin.ts` (mirrors `use-processing.ts`/`use-pdfs.ts` hook shape).
Reuses the existing `Profile`/`UserRole` shared types directly for the
user list rather than introducing a parallel type. Wired into
`router.tsx` as `/admin` and into `nav-items.ts` as "Dashboard" above the
existing "Review Queue" entry, following the same "not gated at the route
level, backend + nav enforce it" pattern already used for `/admin/review`.

**Deliberately not built this pass** (see the audit's missing-functionality
list for the reasoning): audit trail for role changes, storage usage,
AI/token usage tracking, persisted queryable error logs (today's
unhandled-exception logging is stdout-only), and Community moderation
(blocked on the Community module itself not existing yet -- it's still a
`ComingSoonPage` stub).

**Verified:** `pnpm typecheck` (shared + client), `pnpm lint` (oxlint,
0 errors, same 1 pre-existing `main.tsx` fast-refresh warning as before),
`pnpm build`, `ruff check`, and a live Python import of `app.main` confirming
all 3 new routes register (57 total routes, up from 54).

## Phase 9 detail (previous pass)


**Schema** (migration `0009`, four new tables): `interview_experiences`
(the submission), `interview_experience_rounds` (structured round-by-round
breakdown, one row per round), `interview_experience_votes` (Helpful/Not
Helpful, one row per user per experience, toggle semantics), and
`interview_experience_reports` (Report Experience, one per user per
experience). RLS on all four, matching the API layer's own visibility
rules rather than looser (approved-or-own-or-admin for select; admin-only
for status/edit/delete; own-row-only for votes/reports).

**Deliberate reuse instead of a parallel system:** "Bookmarks" uses the
*existing* generic `bookmarks` table (`target_type: 'interview-experience'`)
-- there's no bookmark endpoint in the new `interview_experiences.py` file
at all; `bookmarks.py` (built in Module 5) already handles it, and the
frontend's existing `useBookmarks()` hook needed zero changes to support
this content type.

**Field consolidation, done deliberately and stated here rather than
silently:** the brief listed several near-duplicate free-text fields
("Preparation Tips" / "Overall Advice" -> just `overallTips`, already
in the pre-existing type; "Aptitude Topics" / "Important Concepts" ->
one `keyTopics: string[]` tag list; "Questions Asked" / "Coding
Questions" / "Technical Questions" -> folded into each round's own
`description`, which is what a per-round description is for). Adding
three more overlapping text fields on top of `overallTips`/`keyTopics`/
rounds would have made the submission form worse, not more complete.

**Anonymity, implemented as real accountability rather than a fake
toggle:** `author_id` is always stored on the row. The API redacts it to
`null` in every response for an `is_anonymous` submission *unless* the
requester is the author or an admin -- verified directly (`_row_to_response`
tested against a stranger, the owner, and an admin viewing the same
anonymous row: stranger and non-owner get `null`, owner and admin see the
real id). This is deliberately different from "nobody can ever know who
posted this," which would make abuse/moderation impossible.

**Backend** (`server/app/api/v1/endpoints/interview_experiences.py`, new,
8 routes): list (with company/role/difficulty/year/department/round-type/
package-range filters, plus a `status` filter for admins working the
moderation queue), get one, create (any authenticated user, always starts
`pending-review`), admin status update (approve/reject with reason),
admin edit (including wholesale round-list replacement and `is_pinned`),
admin delete, vote (toggle, counts always computed fresh from the votes
table rather than a denormalized counter -- no drift to worry about), and
report. Verified: full backend import, `app.main` boots with all 8 routes
correctly wired, `ruff check` clean across the whole `app/` tree, and a
direct functional test of the anonymity redaction logic against three
different viewers of the same row (above) plus the create-request
validation.

**Explicitly NOT implemented, with the actual reasoning (not just a
checklist gap):** admin "Merge" for interview experiences. `questions.py`'s
merge has one clear, mechanical, structural target: re-pointing
`quiz_attempts`/`bookmarks`/`wrong_answer_marks` between two rows of
identical shape. A real interview-experience merge would need editorial
judgment about which rounds, tips, and author to keep across two
free-form personal accounts -- that's a distinct, later feature, not a
find-and-replace of the question version, and attempting a rushed copy
here risked shipping something worse than not having it at all.

**Frontend:**
  - `hooks/use-interview-experiences.ts` (new) -- list (with filters),
    detail, create, admin status/edit/delete, vote, report.
  - `pages/interview-experiences-page.tsx` (new) -- filterable list,
    expandable cards (round breakdown, tips, key topics, resources,
    notes), a submission form (react-hook-form + zod, dynamic round
    list via `useFieldArray`, prefilled from the user's own profile
    college/department/year), inline admin moderation (approve/reject
    with reason/edit/pin/delete), and a real empty state.
  - `company-detail-page.tsx`'s "Interview Experiences" tab -- previously
    showed explicitly-labeled sample data matched by name against a demo
    dataset (an honest placeholder, not fabricated data, but a
    placeholder nonetheless) -- now calls the real API filtered to that
    company and reuses the same `ExperienceCard`/`SubmissionDialog`
    components from the main page (exported for reuse rather than
    duplicated).
  - `router.tsx`'s `/experiences` route now renders the real page instead
    of `<ComingSoonPage title="Interview Experiences">`.
  - Deleted `mocks/interview-experiences.ts` and `mocks/companies.ts` --
    confirmed (grepped) every remaining reference to either was a code
    comment, not an import, before removing them.
  - Verified: `pnpm --filter client typecheck`, `lint` (oxlint, 0 errors),
    and `build` all clean.


## Phase 8 detail

**Schema** (migration `0008`): extended `calendar_events` with `role`,
`package_lpa`, `eligibility`, `registration_deadline`, `venue`,
`is_online`, `application_link`, `attachment_url`, and `status`
(`upcoming`/`ongoing`/`completed`/`cancelled`, default `upcoming`), plus
`updated_at` with a trigger reusing the existing `set_updated_at()`
function. No RLS changes needed -- the Sprint 3 policies already matched
the brief's access model exactly.

**Scoping note, stated honestly:** the brief asks for "Admins and
Placement Coordinators" to have write access. There is no "Placement
Coordinator" role in this system (`roles` only has student/alumni/admin)
-- adding a fourth role is a bigger identity-platform change than this
pass, so admin-only write access is what's actually implemented (which is
also all the existing RLS policy enforces). Noted here rather than
silently treating "admin" as a stand-in without saying so.

**Backend** (`server/app/api/v1/endpoints/calendar.py`, new):
  - `GET /calendar` -- open to any authenticated user; filters by
    `company_id`, `status`, and `month` (`YYYY-MM`).
  - `POST /calendar`, `PATCH /calendar/{id}`, `DELETE /calendar/{id}` --
    all admin-only (`require_admin`). Reschedule and cancel are both just
    the same `PATCH` (reschedule = new `startAt`/`endAt`, cancel =
    `{"status": "cancelled"}`) rather than separate endpoints, since a
    partial update already covers both.
  - Verified: full backend import, `app.main` boots with all 4 new routes
    correctly wired, `ruff check` clean, and a direct functional test of
    the Pydantic request/response models -- confirmed camelCase JSON in
    (`packageLpa`, `registrationDeadline`, etc.) validates and converts to
    snake_case for the DB insert, invalid `type`/`status` enum values are
    correctly rejected, `exclude_unset` partial-update semantics work for
    the cancel-via-status-only case, and DB rows convert back to camelCase
    for the frontend correctly.

**Frontend:**
  - `hooks/use-calendar.ts` (new) -- `usePlacementEvents` (with
    company/status/month filters), `useCreatePlacementEvent`,
    `useUpdatePlacementEvent`, `useDeletePlacementEvent`.
  - `pages/placement-calendar-page.tsx` (new) -- all three requested view
    modes (List grouped by upcoming/past, Calendar as a real month grid
    with day-click-through, Timeline grouped by month), an admin
    create/edit dialog (react-hook-form + zod, matching the existing
    `quiz-config-form.tsx` convention) covering every field the brief
    asked for, and a real empty state when no events exist yet
    (distinct copy for admins vs. students).
  - `router.tsx`'s `/calendar` route now renders the real page instead of
    `<ComingSoonPage title="Placement Calendar">`.
  - Deleted `mocks/calendar-events.ts` -- confirmed (grepped) nothing
    else referenced it once the real page shipped, so this is an actual
    verified removal, not an assumed-safe one.
  - Verified: `pnpm --filter client typecheck`, `lint` (oxlint, 0
    errors), and `build` all clean.

**Explicitly not done in this pass:** a fourth "Placement Coordinator"
role (see scoping note above), a background job to auto-transition
`status` from `upcoming` -> `ongoing` -> `completed` as dates pass (it's a
plain column an admin sets manually via the status field in the edit
dialog for now), multi-file attachments (one `attachment_url` field, not
a subsystem), and any notification fan-out on event create/update -- the
brief listed "future notification support" as explicitly future, so it
wasn't built now; `notifications.notify_admins()` from Phase 7 shows the
plumbing is there if/when this is prioritized.


## Phase 7 detail

**Critical Issue 1, root-caused (not guessed) to four separate confirmed
bugs, all fixed:**

1. `services/answer_key.py` rejected the *entire* answer-key section
   outright once it exceeded a fixed 6,000-character budget -- a real
   solutions section for 40+ questions routinely exceeds that, so every
   chunk sent to Gemini had zero answer-key context. Replaced the
   length-based cutoff with a shape-based check (does the candidate text
   actually contain a plausible density of "12. B"-style entries?) with a
   much larger sanity ceiling (40,000 chars) instead of a real gate.
   Verified against a large synthetic key, a false-header-in-prose case,
   a grid-style key, and a no-key case -- all four behave correctly.
2. `services/pdf_text.py`'s OCR trigger averaged `chars_per_page` across
   the WHOLE document -- a document with dense native-text question pages
   and a few scanned/photographed solution pages averages out fine, so
   OCR never ran on those specific pages and their content silently
   vanished (empty-text pages are dropped from `full_text` with no
   trace). Added a per-page low-quality signal
   (`ExtractionResult.low_quality_page_numbers`) and a new
   `services/ocr.py:ocr_pdf_pages()` that OCRs *just* those pages and
   splices the result back into the correct position
   (`services/pipeline.py:_extract_document_text`), instead of an
   all-or-nothing whole-document decision.
3. `services/pipeline.py`'s main extraction loop caught `AIProviderError`
   per chunk and silently `continue`d -- if every chunk's Gemini call
   failed (bad key, quota, safety-filtered content, deprecated model,
   non-JSON output surviving the retry), the job still finished as
   `completed` with 0 questions and a misleading "no questions were
   found" message, with the real cause visible only in server logs. Now
   tracks `failed_chunk_count` separately, raises a real failure when
   *all* chunks fail (surfacing the actual underlying error into the
   Failed/Retry queue), and reports partial chunk failures in the
   completion notification instead of staying silent about them.
4. Found *while verifying fix #2*, not assumed upfront:
   `services/ocr.py`'s `image_to_string()` calls all used Tesseract's
   default page-segmentation mode (PSM 3, "fully automatic"), which is
   tuned for multi-region newspaper-style layouts. On a page that's
   mostly a short numbered list -- an answer key almost exactly --
   PSM 3 badly garbles the text (verified: a real test page came out as
   `"CON AnRWNe\nDBrunmwraoednwa..."`). `--psm 6` ("assume a single
   uniform block of text") fixed this completely in the same test while
   performing identically well on ordinary dense paragraph-style scanned
   question text (verified against both shapes before applying it
   everywhere OCR runs). This was the fix that made the end-to-end test
   below actually pass.

**End-to-end verification, not just unit-level:** built two synthetic
mixed PDFs (reportlab-generated native-text question pages + a
Pillow-rendered scanned answer-key page baked into an image, one with a
deliberately low-quality bitmap font, one with a realistic
truetype-rendered scan) and ran them through the real
`_extract_document_text` -> `split_answer_key` chain with actual
Tesseract/poppler (both installed and available in this environment). The
realistic-quality synthetic scan round-trips correctly end to end: mixed
page detected despite a healthy whole-document average, targeted OCR
recovers clean answer-key text, and it's correctly detected and split out
for the AI prompt -- while question content from the native-text pages is
preserved. The deliberately-low-quality bitmap-font scan still doesn't
fully recover, which is an honest limit of OCR on genuinely poor source
images, not something a segmentation-mode or prompt change can fix.

**Upload approval workflow** (the other confirmed gap -- `upload_pdf`
previously queued the Gemini pipeline immediately on any authenticated
upload with no human review):
  - New `pdf_resources` states: `pending-approval` (default on upload,
    replacing the immediate `queued`) and `rejected`, plus
    `reviewed_by`/`reviewed_at`/`rejection_reason` columns
    (migration `0007`).
  - `POST /pdfs/{id}/approve` (admin-only) is now the *only* path that
    creates a processing job and starts extraction. `POST
    /pdfs/{id}/reject` (admin-only, requires a reason) marks it rejected
    and notifies the uploader. Both are new; `upload_pdf` itself no
    longer touches `pipeline.create_job`/`run_pipeline` at all.
  - `notify_admins()` added to `services/notifications.py` (broadcasts to
    every `role_id = 3` profile) so admins get notified when something
    needs review, rather than having to poll the library.
  - `GET /pdfs` gained an optional `status` filter so the admin UI can
    query the pending-approval queue directly.
  - Frontend: a new "Pending Approval" tab (now the default tab for
    admins in the PDF Library) with Approve / Reject-with-reason actions,
    new `useApprovePdf`/`useRejectPdf` hooks, updated upload
    copy/messaging, and status-pill config for the two new statuses in
    both `pdf-library-page.tsx` and `recent-pdfs-card.tsx` (the latter
    was only caught by actually running `tsc -b` -- it has its own
    parallel status-config record that the type-checker correctly flagged
    as no longer exhaustive once `PdfProcessingStatus` gained members).

**Also fixed while in this code, using a previously-vestigial setting for
real:** `MAX_EXTRACTION_ATTEMPTS` existed in `config.py` but was never
actually checked anywhere -- every manual retry created a fresh
`processing_jobs` row with no ceiling. `retry_pdf` now counts prior
attempts for the PDF and refuses further retries past the configured max,
directing the uploader/admin to a direct admin review instead.

**Verification performed (all real, all reproduced in this pass, not
assumed):**
  - `answer_key.py` unit-level behavior against 4 constructed cases (see
    above).
  - Full backend import of every touched module plus `app.main` booting
    the FastAPI app with dummy env vars, confirming all new/changed
    routes (`/pdfs/{id}/approve`, `/pdfs/{id}/reject`, updated
    `/pdfs/{id}/retry`, updated `GET /pdfs`) are wired correctly.
  - `ruff check` clean on every touched Python file.
  - `pnpm --filter @placeprep/shared typecheck`,
    `pnpm --filter client typecheck`, `pnpm --filter client build`, and
    `pnpm --filter client lint` (oxlint) all clean -- the client build
    genuinely compiles and bundles with the new tab/dialog/hooks.
  - The two-PDF synthetic mixed-document end-to-end test described above,
    using the real Tesseract/poppler binaries actually installed in this
    environment (not mocked).

**Explicitly not done in this pass** (out of Phase 7's stated scope, not
overlooked): the full Admin Portal expansion (user management, a
dedicated retry/duplicate-queue UI beyond what already existed), an
automated test suite covering this (or any) pipeline logic, and
cross-document linking for the case where a question paper and its
solutions are genuinely two *separate* uploads rather than one PDF with
mixed pages -- that would need a real "link to companion document"
concept in the schema and admin UI, which is a bigger, separate feature
than a bug fix and wasn't attempted here.

## Process note on the earlier pass (read this first)

This pass had two parts. First, a separate session's frontend UI/UX polish
pass (10 files, `client/src/` only) was merged in and independently
verified -- see this repo's `MERGE_NOTES.md` for that verification table.
Second, a large "multi-agent development contract" arrived asking for a
full Phase 5/6 backend rewrite, a security audit, and roughly ten
additional report documents in the same pass.

**What I actually did, honestly:** I did not attempt to re-verify or
rebuild the Phase 5 backend that a prior pass already completed and
documented (Question Bank, Quiz Engine, Quiz Attempts, Wrong Answer
Notebook, Bookmarks, Analytics, Admin Review approve/reject/edit/delete --
all already real per this file's own prior entries, and unchanged in this
pass except where noted below). Instead I focused on the concrete gaps
this file itself had already flagged as **not built**, plus a small number
of *confirmed* bugs -- confirmed by actually reproducing them, not assumed
off a checklist:

1. **Multi-format upload** (PNG/JPG/JPEG, phone photos, screenshots) --
   previously PDF-only.
2. **Daily Challenge backend** -- explicitly scoped out of the Phase 5
   pass ("Deliberately Not Built") for good, specific reasons that are
   now addressed.
3. **Admin Review "Merge"** -- also explicitly scoped out of Phase 5.
4. **Global search** -- milestone 17, never started.
5. **Real server-side pagination** on `/questions` and `/pdfs` -- the
   shared `PaginationParams`/`PaginatedResult` types existed since Sprint
   3 and were never actually used by these two endpoints.
6. A confirmed N+1 + read-modify-write race condition in quiz submission.
7. A confirmed SPA-routing bug (`vercel.json` had no rewrite rule).
8. Basic rate limiting -- previously entirely absent.
9. A live-status SSE endpoint (backend half of a UI/UX pass
   recommendation).
10. A server-aggregated quiz trend endpoint (same).

**What I did NOT do:** fabricate ten audit-style report documents with no
verified work behind them, rewrite anything in `client/`, touch Interview
Experiences/Community/Calendar (still explicitly out of scope per this
file's own prior passes), or claim "production-ready" without a live
Supabase/Gemini project to actually run against -- see "What could not be
verified" below for the honest boundary of what a sandboxed session can
and can't confirm.

## How this pass was verified (real, not asserted)

Unlike a purely static read-through, this pass:

- Rebuilt the full workspace (`client/` + `shared/` + `server/`) in a
  sandboxed container and ran the real toolchain: `pnpm install`,
  `pnpm --filter @placeprep/shared typecheck`, `pnpm --filter client
  typecheck` (`tsc -b --noEmit`), `pnpm --filter client lint` (oxlint),
  `pnpm --filter client build` (production Vite build) -- **all pass,
  zero errors**, one pre-existing unrelated lint warning carried forward
  unchanged (`main.tsx`'s `RouterShell` fast-refresh warning).
- Installed the full Python `requirements.txt` (including the new
  `slowapi` dependency) into a real venv, imported `app.main`, listed
  every one of the **40 registered routes**, and hit `/api/v1/health` and
  `/` through Starlette's `TestClient` -- **boots and responds correctly**.
  `.venv/bin/python -m py_compile` across all 42 server `.py` files --
  **compiles cleanly**.
- **Installed a real, throwaway PostgreSQL 16 instance** (via `apt-get`,
  not a mock) and ran **all six migrations, 0001 through 0006, in
  sequence, for real** -- not just read them for syntax. A minimal
  `auth`/`storage` schema shim stood in for the pieces of Supabase's
  platform Postgres these migrations assume exist but don't create
  themselves (documented in the shim file itself); every migration this
  repo has ever shipped ran cleanly against it.
- **Functionally tested the new `bulk_increment_question_stats()` Postgres
  function** with real fixture data and real SQL calls: confirmed correct
  increments across multiple calls on the same row (the exact scenario
  the old code could race on), and confirmed a skipped response correctly
  does *not* increment `times_attempted`.
- **Confirmed the new schema** for real: `pdf_resources.file_kind` exists
  with the right default, `daily_challenge_progress` /
  `daily_challenge_streaks` exist with RLS enabled, the new trigram search
  indexes exist, and the `unique(user_id, challenge_date)` constraint on
  `daily_challenge_progress` genuinely rejects a duplicate-day insert.
- **Ran a real, end-to-end OCR test** of the new direct-image-upload path:
  a synthetic image containing rendered question text ("What is the
  capital of France? A) Berlin B) Paris C) Madrid D) Rome") was fed
  through `image_text.extract_text_from_image()` against a real Tesseract
  binary present in the build sandbox, and correctly OCR'd back both the
  question and every option. Also confirmed the two failure paths (a
  blank image with genuinely no text; corrupted/non-image bytes) fail with
  clear, distinct error messages instead of crashing.
- **Unit-tested the new Daily Challenge streak algorithm** against a
  lightweight fake Supabase client: consecutive-day increment, same-day
  idempotency (a retried request can't inflate a streak), gap-triggered
  reset, and `longest_streak` correctly preserved across a reset and then
  correctly overtaken on a later climb -- five scenarios, all correct.
- Re-ran the *unchanged* Sprint 4 pure-logic modules (`chunking`,
  `answer_key`, `duplicate.compute_content_hash`) as a regression check --
  still correct.
- Confirmed the schema-level constraints (`bookmarks`'
  `unique(user_id, target_type, target_id)`, `wrong_answer_marks`' primary
  key `(user_id, question_id)`) that the new Merge tooling's
  conflict-avoidance logic depends on actually exist in the real,
  migrated database.

## What could NOT be verified (said plainly, not buried)

- **No live Supabase project.** Every query in every endpoint is written
  against the real schema and, where reasonably testable, against a real
  Postgres instance running that exact schema -- but Supabase's actual
  PostgREST layer, its real RLS enforcement under a real JWT's `auth.uid()`,
  and its real Storage API were not available in this sandbox. The `auth`/
  `storage` shim used for migration testing is explicitly a stand-in, not
  a claim of full-stack verification.
- **No live Gemini API key.** The prompt change to `gemini_provider.py`
  (a couple of sentences acknowledging photographed/scanned input, and
  "use page 1 for a single image") was not run against the real API.
- **`bulk_increment_question_stats()`'s atomicity under real concurrency**
  was verified for *correctness of the increment math*, not for actual
  concurrent-transaction race resistance (that would need two real
  simultaneous connections deliberately racing each other, which is
  possible but wasn't run this pass) -- the atomicity claim rests on the
  well-established Postgres guarantee that a single `UPDATE` statement is
  atomic per row, not on an isolation-level stress test performed here.
- **Merge's `quiz_attempts`/`bookmarks`/`wrong_answer_marks` reassignment
  logic** (`app/services/question_merge.py`) was reviewed carefully and
  its conflict-avoidance depends on constraints confirmed to exist (see
  above), but wasn't run end-to-end against live data with real conflicting
  rows -- flagged as the next thing to smoke-test against a Supabase
  staging project before this ships, same honesty standard the Phase 5
  pass held itself to for OCR/chunking.
- **The rate limiter's actual behavior under load** -- confirmed it's
  wired correctly (imports, decorators, exception handler all present and
  the app boots with it enabled) but a real 429-after-N-requests load test
  wasn't run.

## Backend changes this pass (Phase 6)

### 1. Multi-format upload (PDF + PNG/JPG/JPEG)

- `pdf_resources.file_kind` (`'pdf' | 'image'`, migration 0006) tells
  `services/pipeline.py` which extraction path to use.
- New `services/image_text.py`: OCR-only extraction for a standalone
  image (no native-text-layer attempt first, unlike a PDF -- an image
  never has one). Reuses `services/ocr.py`'s Tesseract engine via a new
  `ocr_image_bytes()` function.
- `POST /pdfs/upload` accepts `image/png`, `image/jpeg`, `image/jpg` in
  addition to `application/pdf`, with a separate (smaller, 15MB default)
  size cap via `MAX_IMAGE_SIZE_BYTES`.
- `shared/file-upload.ts` gained `IMAGE_UPLOAD_CONSTRAINTS` and a combined
  `UPLOAD_CONSTRAINTS` -- **the frontend dropzone's `accept` attribute
  still needs loosening to actually let a user pick an image in their file
  browser; that one-line frontend change is intentionally left to
  whichever session owns `client/`**, flagged in
  `FUNCTIONAL_RECOMMENDATIONS.md`.

### 2. Global search (`GET /search?q=`)

Searches questions (respecting the same approved-only visibility rule as
`GET /questions`), companies, and PDFs. New trigram indexes on
`companies.name` and `pdf_resources.file_name`/`title` (migration 0006)
keep it index-assisted as data grows. Interview Experiences deliberately
excluded -- there's still no real backend for them.

### 3. Daily Challenge (`GET /daily-challenge/today`, `POST .../complete`,
`GET /daily-challenge/streak`)

Weak-topic-weighted question selection (reuses Analytics' own "weak
topic" definition: >=3 answered questions, lowest accuracy first) with a
random fallback for new users with no history yet. Real streak tracking
with UTC-day granularity -- see the endpoint module's own docstring for
the honest timezone caveat (a student's local "today" can differ from the
UTC day this uses by several hours near midnight). Verified per "How this
pass was verified" above.

### 4. Admin Review "Merge" (`POST /questions/{canonical_id}/merge`)

Combines `times_attempted`/`times_correct` onto the canonical question,
reassigns every `quiz_attempts.question_ids`/`.responses` reference,
reassigns bookmarks and wrong-answer marks (with real conflict handling
where a user has both the canonical and duplicate already bookmarked/
marked -- see `services/question_merge.py`'s module docstring), then
deletes the duplicate (cascading its own options/topic/company links).

### 5. Real pagination

`GET /questions` and `GET /pdfs` now take `page`/`pageSize` and return a
DB-backed `total` (via a `count="exact"` query mirroring the same
server-side filters) instead of a flat `limit`. Honest caveat documented
in `questions.py`'s module docstring: `company_id`/`subject` filters still
can't be pushed into the DB query in this embed shape, so `total` only
reflects the current page when either is set -- not silently pretended
away.

### 6. Fixed: N+1 + race condition in quiz submission

`submit_attempt` previously did a SELECT-then-UPDATE per response for
`times_attempted`/`times_correct` (up to N round trips, and a genuine
read-modify-write race between two near-simultaneous submissions touching
the same question) plus a similar pattern for `wrong_answer_marks`. Fixed
via a new atomic `bulk_increment_question_stats()` Postgres function
(one round trip for the whole quiz) and a batched multi-row `.upsert()`
for wrong-answer marks. Verified for real -- see above.

### 7. Fixed: SPA refresh 404 (`vercel.json`)

Confirmed by inspection: the original `vercel.json` had no
`rewrites`/fallback rule, so Vercel's static hosting 404s on any direct
navigation or browser refresh to a client-side route (`/questions`,
`/pdfs`, etc.) because it looks for a literal file at that path. Standard
SPA catch-all rewrite added.

### 8. Rate limiting

`slowapi`-based, per-IP, in-memory (single-instance-correct; see
`server/README.md` for the horizontal-scaling caveat and the Redis
swap-over path). Stricter limits on `/pdfs/upload` and quiz submission.

### 9. Live processing status (`GET /pdfs/{id}/status-stream`, SSE) and
server-aggregated quiz trend (`GET /quizzes/trend`)

Backend halves of two items from the UI/UX pass's own
`FUNCTIONAL_RECOMMENDATIONS.md`. Frontend switch-over (from the existing
3-second poll and from `PracticeTrendChart`'s client-side aggregation)
intentionally left to whichever session owns `client/` -- same
boundary this project has used throughout.

## Bugs investigated from the "verify before fixing" list

Per this project's own long-standing practice (see prior passes'
"verified, not assumed" notes), everything on the incoming bug list was
checked, not blindly patched:

| Item | Finding |
|---|---|
| Refresh returns 404 | **Confirmed, fixed.** Missing `vercel.json` rewrite -- see above. |
| N+1 queries | **Confirmed, fixed.** `quizzes.py` submit_attempt -- see above. |
| SQL injection | **Checked, not present.** Every query in the codebase goes through the Supabase/postgrest query builder (parameterized); grepped for raw string-interpolated SQL, found none. The one place raw SQL exists is inside migration files (DDL/functions), which aren't attacker-reachable. |
| XSS | **Checked, not present.** No `dangerouslySetInnerHTML` usage found anywhere in `client/src`; React escapes all rendered text by default. |
| Rate limiting | **Confirmed absent, added.** See above. |
| Session persistence, RBAC, JWT validation | **Unchanged, already real** (Supabase-session-based, `require_admin`/`is_admin` fetch the role fresh per request rather than trusting a JWT claim) -- reviewed, no issues found, no changes made. |
| Upload processing animation | Addressed in the separate frontend UI/UX pass merged earlier this same session (indeterminate progress bar, fixed drag-counter flicker) -- see `MERGE_NOTES.md`. |
| Duplicate uploads / AI confidence scoring / database consistency | **Unchanged, already real** from the Phase 5 pass (exact-hash + fuzzy-similarity duplicate detection, confidence-gated classification) -- reviewed, no new issues found. |
| Memory leaks | Not investigated this pass -- would need a running instance under load to meaningfully profile, which wasn't available. Flagged as unverified, not claimed clean. |

## Phase 6 Modules -- status

- **[x] Multi-format upload** -- built, end-to-end OCR-verified (see above).
- **[x] Global search** -- built (questions/companies/PDFs).
- **[x] Daily Challenge** -- built, streak logic unit-tested.
- **[x] Admin Merge** -- built, schema dependencies confirmed; not yet
  run against live conflicting data (see "What could NOT be verified").
- **[x] Real pagination** (`/questions`, `/pdfs`) -- built.
- **[x] Quiz submission N+1/race fix** -- built, functionally verified
  against a real Postgres function call.
- **[x] SPA refresh-404 fix** -- built.
- **[x] Basic rate limiting** -- built, wiring confirmed; load behavior
  not tested.
- **[x] Live status SSE endpoint** (backend half) -- built.
- **[x] Server-aggregated quiz trend endpoint** (backend half) -- built.
- **[ ] Interview Experiences / Community / Placement Calendar backends**
  -- still not started, still explicitly out of scope for this pass
  (unchanged from every prior pass's own scoping decision).
- **[ ] Checked-in automated test suite** -- still not present. This
  pass's verification (real migration runs, real RPC calls, real OCR,
  unit-tested pure logic) is real but ad hoc, same honest caveat every
  prior pass in this file has carried.

## Milestones (updated)

- [x] 1-16. (unchanged, already complete per prior passes)
- [x] 17. **Global search -- backend built Phase 6; frontend command
      palette wired this pass** (searches client-cached data, not yet the
      `GET /search` endpoint directly -- see `MERGE_NOTES.md` Part 3)
- [x] 18-20. Dashboard / Notifications / Analytics -- Notifications
      dropdown unchanged, already real; **standalone `/notifications`
      page built this pass** (previously `ComingSoonPage`, see correction
      above)
- [x] 21. Admin Review -- **Merge now built this pass**, closing the one
      gap the Phase 5 pass left open
- [x] 22. **Daily Challenge -- built this pass** (previously not built)
- [ ] 23. Testing -- still no checked-in automated suite (see above)
- [ ] 24. Docker / Final Review -- unchanged

## Remaining work for Phase 7

1. **Run migration 0006 against the real Supabase project**, alongside
   confirming 0001-0005 are already applied, before deploying this
   version of the backend.
2. **Smoke-test Admin Merge against real conflicting data** on a staging
   project (a user who's bookmarked/wrong-answered both the canonical and
   duplicate question) -- the logic is real and its constraint
   dependencies are confirmed, but it hasn't seen live conflict data yet.
3. **Frontend switch-over** for the two SSE/trend endpoints, and loosening
   the upload dropzone's `accept` attribute to actually let users pick an
   image -- all three are one small, well-scoped frontend change each,
   listed in `FUNCTIONAL_RECOMMENDATIONS.md`.
4. **Interview Experiences backend**, **Community**, **Placement
   Calendar** -- unchanged scope from every prior pass.
5. **A real automated test suite** -- still the most consequential
   remaining gap; the scoring-recomputation logic in `quizzes.py` and the
   new merge logic in `question_merge.py` are exactly the kind of code a
   regression could silently break without one.
6. **Rate limiter load testing** and, if deploying more than one backend
   instance, switching `RATE_LIMIT_STORAGE_URI` to Redis.
7. **Wire the command palette to `GET /search`** instead of client-cached
   React Query data (see `MERGE_NOTES.md` Part 3) -- fine at current data
   volume, but the palette can't find anything outside whatever page of
   questions/PDFs is already loaded.

## Security note (carried forward -- action still needed)

Unchanged from previous entries: confirm the previously-flagged exposed
Supabase secret/service-role key has actually been rotated (Supabase
dashboard -> Project Settings -> API). This pass has no way to verify
that from here.
