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

The backend uses Python dependencies listed in `server/requirements.txt` —
see `server/README.md` for the full setup and deploy checklist (including
the CORS/Supabase redirect-URL gotchas that most commonly bite on first
deploy).
