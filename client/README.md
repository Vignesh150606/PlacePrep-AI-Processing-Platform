# PlacePrep — Client

React 19 + Vite + TanStack Router/Query frontend for PlacePrep.

## Development

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill in your Supabase project URL,
publishable key, and the backend's base URL before running.

## Scripts

- `pnpm dev` — start the Vite dev server (http://localhost:5173)
- `pnpm build` — typecheck (`tsc -b`) then production build
- `pnpm typecheck` — `tsc -b --noEmit`
- `pnpm lint` — oxlint

## Structure

See `src/components`, `src/pages`, `src/hooks`, `src/providers`, and
`src/lib` — routing is centralized in `src/router.tsx`, and every real
(non-mock) API call goes through `src/lib/api-client.ts`, which attaches
the current Supabase session's JWT as a Bearer token automatically.

## Deploying (Vercel, or similar)

`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`
must be set in your hosting provider's **production** environment variables
(not just a local `.env.local`) and the app **rebuilt** afterward — Vite
bakes `VITE_*` vars into the build at build time, so adding them without
triggering a new deploy has no effect.
