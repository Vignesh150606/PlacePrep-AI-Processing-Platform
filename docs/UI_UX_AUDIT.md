# UI/UX Audit — PlacePrep frontend

This consolidates the UI audit, design-system documentation, accessibility
notes, and responsive-design findings into one document, organized by
section. It reflects what was actually read and tested in this pass, not
a generic checklist — see "Coverage" at the bottom for what wasn't
reached.

## Headline finding

The frontend is **not** a bare-bones app that needs a from-scratch
"premium SaaS" pass. `index.css` already carries a deliberate, documented
design direction:

> "a precise, exam-room-calm dev-tool aesthetic (Linear / Raycast /
> Vercel Dashboard register) rather than a generic SaaS palette... Accent
> is a single confident violet... Correct/incorrect states borrow directly
> from the product's own domain (graded answers), not from generic alert
> colors."

That direction is implemented consistently: Tailwind v4 CSS-variable
tokens, full light/dark parity, `prefers-reduced-motion` support, and a
real primitive layer (`empty-state`, `error-state`, `skeleton`,
`stat-card`) that most of the audited pages already use
correctly. `PROJECT_STATE.md` documents several real, verified prior
development passes (typecheck/lint/build actually executed, not just
claimed).

This pass therefore prioritized **finding and fixing genuine gaps** over
re-implementing things that already work — seven concrete, verified fixes
are in `MERGE_NOTES.md`.

## Design system reference

Token source of truth: `client/src/index.css`.

| Category | Values |
|---|---|
| Font | `--font-sans`: Geist / Inter fallback. `--font-mono`: Geist Mono. |
| Accent | `accent-50` → `accent-700`, single violet scale (`#7c5cf0` at 500). |
| Domain colors | `correct-500/600` (teal-green), `incorrect-500/600` (rose), `warning-500` (amber) — used for graded-answer states, not generic alerts. |
| Surface | `background`, `surface`, `surface-raised`, `border`, `border-subtle`, `muted`, `muted-foreground`, `ring` — all HSL CSS vars, redefined per `:root`/`.dark`. |
| Motion | `animate-fade-up`, `animate-fade-in`, and (added this pass) `animate-slide-in-left` — all defined as named `@theme` animations backed by `@keyframes` in the same file, all respecting `prefers-reduced-motion: reduce` via the global override at the bottom of the file. |
| Radius/spacing | Standard Tailwind scale, no custom overrides found — components consistently use `rounded-lg`/`rounded-xl` and the default spacing scale. |

Component primitives (`client/src/components/ui/`): `avatar`, `badge`,
`button`, `card`, `dialog`, `dropdown-menu`, `empty-state`, `error-state`,
`input`, `label`, `search-bar`, `skeleton`, `stat-card`,
`table`, `tabs`, `theme-toggle`. All built on Radix primitives
where interactive (`Dialog`, `DropdownMenu`, `Tabs`), which is
the right call for accessibility — Radix handles focus management, ARIA
roles, and keyboard interaction correctly out of the box. (`section-header`
and `tooltip` were removed in the Sprint 1A cleanup pass as unused —
neither had any remaining call sites.)

**Recommendation for future work:** this primitive list is solid but has
a couple of real gaps if the app grows — no `Select`/`Combobox` primitive
yet (`question-filters.tsx` was worth checking for how multi-select
filtering is currently handled if a native `<select>` is being used
in its place), and no toast primitive of its own (uses `sonner` directly,
which is fine but means toast styling lives outside the token system —
worth confirming `sonner`'s theme is wired to the CSS vars above rather
than its own defaults).

## Concrete findings — fixed this pass

Full detail and rationale for each is in `MERGE_NOTES.md`. Summary:

1. **Dashboard stat tiles had no loading state** — flashed `0` before real
   data arrived, inconsistent with every other card on the same page.
2. **Mobile nav drawer lacked dialog semantics** — no `role="dialog"`, no
   Escape-to-close, no focus trap/restore, no body scroll lock, no
   `aria-current` (desktop sidebar had this, mobile didn't).
3. **Quiz had no keyboard shortcuts** — an explicit brief requirement,
   entirely absent. Added number/letter select, arrow navigation, mark,
   submit.
4. **Login page bypassed the design system** — hand-rolled button with a
   one-off height not on the Button component's scale.
5. **Upload dropzone had a real drag-and-drop bug** — `onDragLeave` fired
   on every child-element boundary crossing, flickering the drag-active
   state. Also lacked any progress indication or distinct success state,
   both explicitly requested in the brief for this page specifically.
6. **Two charts hardcoded a duplicate of the accent color** as a literal
   hex instead of referencing the actual token — would silently drift if
   the token ever changes.
7. **Quiz result screen had no entrance moment** — the score revealed
   instantly with no transition, unlike other loading/complete states in
   the app which do use the existing `fade-up` token.

## Accessibility notes

- Icon-only buttons checked (`theme-toggle`, `mobile-nav` triggers,
  `notification-center`, `question-card`'s bookmark button) all correctly
  have `aria-label`. This is a good sign the rest of the codebase follows
  the same discipline.
- Focus-visible styling is global (`:focus-visible` in `index.css`), so
  it applies consistently without needing to be repeated per component.
- `QuizRunner`'s answer options correctly use `role="radio"` /
  `aria-checked` within a `role="radiogroup"` container.
- The one real gap found (mobile nav drawer) is fixed — see above.
- **Not verified in this pass:** actual screen-reader walkthrough (NVDA/
  VoiceOver), and color-contrast ratios weren't measured against WCAG AA
  numerically — the palette *looks* like it clears AA comfortably (dark
  text on light surfaces, light text on dark surfaces, no low-contrast
  pastel-on-white patterns observed), but this should be run through an
  actual contrast checker before calling it verified.

## Responsive design notes

- `Sidebar` is `hidden ... lg:flex` and `MobileNav` is `lg:hidden` — a
  clean breakpoint split with no overlap observed.
- Grid layouts consistently step from `grid-cols-1` → `sm:grid-cols-2` →
  `lg:grid-cols-3/4` across Dashboard, Question Bank, Companies — this
  pattern is uniform, which is exactly what "no random component styling"
  should look like.
- `QuizRunner`'s two-column layout (`lg:grid-cols-[1fr_240px]`) collapses
  to a single column below `lg`, which means the question palette
  currently renders *below* the question rather than being reachable
  without scrolling on mobile/tablet. This wasn't fixed in this pass
  (higher-risk restructuring of an already-complex, well-tested
  component) but is worth a follow-up: a collapsible palette sheet
  (similar pattern to `mobile-nav`'s drawer, now that it's accessible)
  would fix this without touching quiz logic.
- No horizontal-overflow issues found in the pages actually read (tables
  in `PdfLibraryTab`/`ProcessingDashboardTab` use the shared `Table`
  primitive, which should handle overflow — worth confirming on an actual
  narrow viewport since this wasn't tested in a real browser this pass,
  only read as source).

## Coverage — what this pass did and didn't reach

**Read in detail:** Dashboard + its 5 cards, Question Bank page + filters
+ card, Companies page + card, PDF Library page (both tabs), Login,
Coming Soon, Quiz Runner, Quiz Result, Sidebar, Mobile Nav, Button, Stat
Card, Tooltip, index.css (full token system).

**Not deeply read this pass** (grep-checked for obvious issues like
missing `aria-label`s and hardcoded colors, but not read line-by-line):
Admin Review page, Analytics page (beyond the one chart fix), Bookmarks
page, Wrong Answer Notebook page, Company Detail page, Quiz Config form,
Notification Center, Profile Menu, Breadcrumbs, Error Boundary.

Given how consistent the patterns were across everything that *was* fully
read, the honest expectation is that these follow the same conventions —
but that's an inference, not a verified finding, and they'd be the right
starting point for a follow-up pass rather than assumed clean.
