# Phase 1 Roadmap

Phase 1 delivers a student workflow from authentication to PDF upload, AI
question extraction, quiz attempts, wrong-answer review, bookmarks, company
pages, interview experiences, search, and dashboard insights.

Shipped so far (see `PROJECT_STATE.md` for the authoritative, currently
accurate status):

- Authentication (Google OAuth via Supabase) + protected routing
- Full database schema, RLS policies, and storage buckets
- PDF/image upload -> AI extraction -> validation -> duplicate detection ->
  classification -> storage -> cleanup -> notification pipeline
- Notifications (real backend + UI)
- Dashboard, Question Bank, Quiz, Companies, PDF Library UI
- Global search, Daily Challenge, Admin merge tooling (Phase 6 pass)

Milestones are tracked in `PROJECT_STATE.md`.
