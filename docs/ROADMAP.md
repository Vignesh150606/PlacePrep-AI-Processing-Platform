# Phase 1 Roadmap

Phase 1 delivers a student workflow from authentication to PDF upload, AI
question extraction, quiz attempts, wrong-answer review, bookmarks, company
pages, interview experiences, search, and dashboard insights.

Shipped so far (see `PROJECT_STATE.md` for the authoritative, currently
accurate status):

- Authentication (Google OAuth via Supabase) + protected routing
- Full database schema, RLS policies, and storage buckets
- PDF upload -> AI extraction -> validation -> duplicate detection ->
  classification -> storage -> cleanup -> notification pipeline
- Notifications (real backend + UI)
- Dashboard, Question Bank, Quiz, Companies, PDF Library UI (some still on
  mock data pending their own wiring sprint — tracked as known debt in
  `PROJECT_STATE.md`, not silently forgotten)

Not yet started: standalone Bookmarks page, Wrong Answer Notebook, global
search, Interview Experiences backend, Community.

Milestones are tracked in `PROJECT_STATE.md`.
