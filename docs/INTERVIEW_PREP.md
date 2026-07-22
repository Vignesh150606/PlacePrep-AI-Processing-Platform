# Talking About PlacePrep in Interviews

Reference material for explaining this project out loud -- not a script to
memorize, a set of true, specific things to reach for. Every claim here is
checkable against the actual code and `PROJECT_STATE.md`; don't say
anything from this doc you can't back up if asked to open the file.

## The 30-second pitch

"PlacePrep is a placement-prep platform I built for my college -- students
upload previous years' interview question papers (PDF or a phone photo),
an AI pipeline extracts and classifies the questions, and from there it's
quizzes, a wrong-answer notebook, bookmarks, a company/interview-experience
database, and a moderated community. It's a FastAPI + Supabase + React
stack, built in phases over [N] passes, and I ran a full release-engineering
audit on it -- found and fixed a real filter-injection vulnerability and a
rate-limiter that was silently not enforcing anything, among other things."

Adjust the specifics to what's true when you say it -- check
`PROJECT_STATE.md`'s most recent entry for the current phase count and
what's actually shipped.

## Architecture, in one breath

Client (React, TanStack Router/Query, Tailwind, installable PWA) talks to
a FastAPI backend over JWT-authenticated HTTPS; the backend is the only
thing that talks to Postgres, using Supabase's service-role client with
authorization enforced in Python, not Postgres RLS (RLS policies exist on
every table as defense-in-depth, in case something ever bypasses the API).
Auth is Supabase Auth (Google OAuth + email/password), verified via JWKS
with ES256 signatures -- the backend never trusts a role claim baked into
the token; it re-fetches the caller's role from the database on every
request. See `docs/architecture/ARCHITECTURE.md` for the diagrams.

**If asked "why not just use RLS for everything, it's less code":** RLS
alone can enforce row ownership, but a lot of this app's real authorization
logic doesn't reduce to a row-ownership check -- "only an admin can approve
a question, and only if it's currently pending, and the action needs to be
audit-logged" is application logic, not a policy predicate. Centralizing it
in Python keeps one consistent place to reason about "who can do what,"
with RLS as a second layer that fails closed if that first layer is ever
bypassed. That's a real trade-off (more code to review, RLS policies that
look permissive in isolation), and it's worth being able to say why it was
chosen rather than defend it as obviously correct.

## Real trade-offs you can defend (not just "it works")

- **Service-role + Python-enforced auth vs. pure RLS** -- above.
- **In-memory rate limiting, not Redis** -- `RATE_LIMIT_STORAGE_URI` is
  unset, meaning each backend instance tracks its own counters. Correct
  and simple for a single free-tier instance; would need to move to a
  shared Redis store before running more than one instance, because
  effective limits would otherwise multiply by instance count. The code
  is already written to make that swap a one-line config change --
  choosing not to add Redis now, for a project that runs on one instance,
  is itself a defensible decision, not a gap.
- **No background job queue for the AI extraction pipeline** -- upload
  processing runs synchronously/in-request rather than via a task queue
  (Celery, etc.). Reasonable at this scale (a college's worth of uploads,
  not a SaaS with thousands of concurrent uploads); the honest answer to
  "how would this scale" is "move extraction to a queue with a job-status
  table," and the `processing_job` status model already in the schema is
  most of the design work for that migration already done.
- **No automated test suite** -- see the SDET section below; this is the
  single most important thing to be upfront about rather than talk around.

## A true story worth telling: the security audit

This is real, checkable, and a much stronger answer than a rehearsed one:
asked to do a "release-candidate" audit, a systematic grep across the
codebase for `.or_()` filter calls turned up **five endpoints**
(resources, search, community, admin, alumni) that interpolated raw
user-supplied search text directly into a hand-built PostgREST filter
string. Verified -- by reading `postgrest-py`'s actual source, not just
assuming -- that `.or_()` passes its string straight through to
PostgREST's own parser, while the safer `.ilike(column, pattern)` form
binds a value to one named parameter and doesn't. That difference means a
comma or parenthesis in a search box could inject an *additional* filter
condition into the query -- the PostgREST-filter equivalent of SQL
injection. Fixed with one small, documented, shared helper
(`core/query_safety.py`) using a sanitizer `postgrest-py` already ships
internally (`sanitize_param`) but doesn't apply automatically to `.or_()`.
Also found, in the same pass, that a rate limiter had been fully
*configured* (a `Limiter` object, a default limit, an exception handler)
but never actually *enforced*, because the one line that registers the
enforcing middleware (`app.add_middleware(SlowAPIMiddleware)`) was never
added -- so every route except the five with an explicit decorator had no
rate limiting at all, silently, despite a code comment claiming otherwise.

Why this is good material: it's a specific, verifiable finding (not "I
wrote secure code"), it shows source-level verification instead of
guessing, and it's exactly the kind of gap between "looks configured" and
"is actually enforced" that testing-focused roles care about.

## If the role is SDET / QA-focused: lead with this

The honest gap in this project is that verification has been rigorous but
manual: every pass runs `typecheck` + `lint` + `build` + `ruff check` +
a live Python import confirming route registration, and specific claims
(like the escaping behavior above) get spot-checked with real inputs
before being called done. What doesn't exist yet is a checked-in automated
test suite. A good, honest answer to "why not":

- Individual passes *have* added targeted unit tests where the logic was
  gnarly enough to need them (e.g. `lifecycle.py`'s soft-delete/restore
  state machine, tested against a mocked Supabase client) -- so testing
  discipline exists, just not as blanket coverage.
- If asked "what would you test first with more time": the scoring
  recomputation logic in `quizzes.py` and the question-merge logic in
  `question_merge.py` -- both have real state-machine-like behavior and
  no test currently protects them from a silent regression. After that,
  an integration-level suite hitting a real (test) Supabase project would
  catch the exact class of bug found in the security audit above -- a
  test asserting "searching for `a,b` returns zero results, not an error
  or unrelated rows" would have caught the filter-injection issue long
  before an audit did.
- For the frontend, there's no component/e2e test suite either; Playwright
  against the deployed Vercel preview would be the natural next step for
  the highest-traffic flows (auth, upload, quiz attempt).

Saying this clearly, unprompted, reads as stronger QA instinct than
claiming coverage that doesn't exist.

## Numbers worth having ready

Pull these fresh before an interview rather than trusting stale numbers
here -- they change every pass:

```bash
# Migration count
ls supabase/migrations/ | wc -l
# Backend route count
cd server && python -c "from app.main import app; print(len([r for r in app.routes if hasattr(r,'path')]))"
# Rough LOC
find client/src server/app shared/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" \) -exec cat {} + | wc -l
```

## Anticipated questions

**"Walk me through what happens when a student uploads a question paper."**
Use the pipeline diagram in `docs/architecture/ARCHITECTURE.md` --
validate -> extract (with an OCR fallback path for scans/photos) -> chunk
-> AI extraction -> duplicate check -> classify -> store -> notify. Be
ready to explain *why* chunking exists (large PDFs exceed a single AI call's
context) and why duplicate detection uses fuzzy matching (rapidfuzz, 0.87
threshold) rather than exact string match (OCR/AI extraction of the same
question from two different papers rarely produces byte-identical text).

**"How do you know this is actually secure?"** Don't claim it's fully
secure -- claim what was specifically checked: JWT verification (signature,
audience, issuer, expiry, via cached JWKS), file upload validation (MIME
allowlist, size limit, UUID-based storage paths so a filename can't cause
path traversal), the filter-injection class of bug above, and that RLS
exists as defense-in-depth even though it isn't the primary gate.

**"What would you do differently starting over?"** A real, defensible
answer: introduce the shared `lifecycle.py` framework (archive/soft-
delete/restore/bulk pattern) from the start, applied to every content type
uniformly, instead of building it for Questions and Resources first and
still needing to extend it to Interview Experiences/Community/Alumni later.
Retrofitting a shared abstraction after three implementations already
diverged is real, ongoing work -- naming it shows you understand technical
debt as a process issue, not just a code smell.

**"What's the biggest risk in this codebase right now?"** No automated
test suite, honestly -- see the SDET section. Second: this project has run
entirely against Supabase's service-role key server-side and there's a
carried-forward, unverified note in `PROJECT_STATE.md` about confirming an
earlier-exposed key was actually rotated. Naming a real, currently-open
item is more credible than claiming there isn't one.
