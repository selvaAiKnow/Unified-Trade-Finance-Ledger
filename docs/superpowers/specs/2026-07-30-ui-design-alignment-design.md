# Web UI Design-System Alignment — Design

## Purpose

The `web` portal's current UI (plain light sidebar, browser-default fonts,
a gold-toned "seal" accent) doesn't match the visual language of the
reference prototype (`prototypes/trade_finance_platform_app.html`) —
distinct typography (Roboto Slab / IBM Plex Sans / IBM Plex Mono), a dark
icon-driven sidebar with a breadcrumb topbar, a warmer paper/seal-green
palette, panel-card content grouping, and pill-shaped status badges.

This is a **visual restyle only**: every existing page keeps its current
data-fetching, routing, and business logic — only markup structure,
Tailwind tokens, and a handful of small new pure display-mapping functions
change. No new pages, no new backend endpoints. The prototype's
Document Verification (AI discrepancy checks) and Bank Rules Console
pages are **not** built here — they depict features with no backend
support today (no AI doc-check engine, no bank-rules storage) and are
explicitly out of scope, same as they were deferred in the
two-track-onboarding slice.

## Scope Decisions (from brainstorming)

- **Fonts:** adopt the prototype's Google Fonts (Roboto Slab, IBM Plex
  Sans, IBM Plex Mono) via `index.html`, wired into Tailwind's
  `font-serif`/`font-sans`/`font-mono` so every existing use of those
  classes picks the new fonts up automatically.
- **Palette:** adopt the prototype's palette exactly, replacing
  `tailwind.config.js` token values. Notably `seal` shifts from the
  current gold (#B8863A) to the prototype's green (#2F6E63) as the
  primary accent; `amber` becomes a distinct warning color; `block`
  (danger/red) and `ink`/`paper` are re-tuned to the prototype's exact
  hex values. Existing Tailwind class names (`bg-ink`, `text-seal`,
  `border-line`, etc.) are unchanged — only their underlying colors move.
- **Layout:** adopt the prototype's full shell structure — dark sidebar
  with icon nav grouped under section labels, an org chip + sign-out
  footer, and a sticky topbar showing a breadcrumb (section + page
  title). The sidebar's nav items themselves are unchanged (Dashboard,
  Transactions, New transaction [exporter-gated], Team) — only their
  presentation. No topbar action buttons (redundant with existing nav).
- **Dashboard stats:** exactly one `StatCard` ("Active transactions",
  `trades.length`) — a trivial client-side count of already-fetched data.
  No fabricated metrics requiring new data fetches (discrepancy counts,
  pending-onboarding counts, connected-institution counts) — those aren't
  computable from what Dashboard fetches today and adding the fetches
  would be new functionality, not restyling.

## Architecture

**Design tokens:**
- `web/index.html` — add the Google Fonts `<link>` tags for Roboto Slab,
  IBM Plex Sans, IBM Plex Mono.
- `web/tailwind.config.js` — update `theme.extend.colors` to the
  prototype's hex values (`ink`, `paper`, `seal`, `amber`, `block`,
  `slate`/`line`), and add `theme.extend.fontFamily` mapping
  `serif`/`sans`/`mono` to the new font stacks.

**New shared UI primitives** (`web/src/components/ui/`):
- `Panel.tsx` — bordered white card wrapper with optional title/description,
  used for all content grouping (replaces ad-hoc `border border-line
  rounded` divs).
- `Badge.tsx` — pill-shaped status indicator, `tone: 'positive' |
  'warning' | 'negative' | 'neutral'`.
- `StatCard.tsx` — numeric stat block (label + number), used once on
  Dashboard.
- `statusTones.ts` — pure mapping functions from each status enum
  (`TradeStatus`, `KybStatus`, `KybCheckStatus`, `SanctionsStatus`,
  `DocumentVerificationStatus`, `UserStatus`) to a `Badge` tone and
  display label, following the same pattern as `roleLabel` in
  `lib/roles.ts`.

**AppShell rebuild** (`web/src/components/AppShell.tsx`):
- Dark sidebar (`#152029`) with the existing nav items grouped under
  section labels ("Overview", "Trade Operations", "Account") with icons.
- Org chip (avatar initials, org name, `roleLabel(user.role)`) and
  sign-out in the sidebar footer.
- Sticky topbar with a breadcrumb derived from the current route via a
  static path-prefix → `[section, title]` lookup table inside `AppShell`
  — no per-page changes needed to support it.

**Page treatment** (uniform pattern applied to Dashboard, Transactions,
New Transaction, the 5 transaction-detail tabs, Team, Profile,
Organization Profile, Login, and the 3 signup pages):
- Content wrapped in `Panel`(s).
- Record lists/tables: mono font for reference/ID columns, `Badge` for
  status columns via the `statusTones` helpers.
- Key/value detail views (Profile, Organization Profile, transaction
  Overview): label/value row pattern matching the prototype's
  `review-line`.
- Forms (New Transaction, Team invite, Signup): prototype's field styling
  (uppercase small-caps labels, bordered inputs) via shared input/label
  classes.
- Login: prototype's centered card treatment (brand mark, serif title,
  styled fields, block primary button).
- Signup hub: existing two-card grid gets the prototype's `hub-card`
  treatment (eyebrow label, heading, description, button).
- Loading/error states keep their current text and logic, rendered inside
  the new Panel styling.

## Testing

The existing test suite queries by role/label text, not CSS classes, so it
should keep passing through a restyle largely unchanged — each task
re-runs the full suite as its regression check. The new `statusTones.ts`
mapping functions get unit tests covering every enum value (matching the
existing `roles.test.ts` convention for `roleLabel`). No other new test
cases are needed since no behavior changes.

## Global Constraint

No page's data-fetching, routing, role-gating, or business logic changes
in this slice — only JSX structure, Tailwind tokens/classNames, and the
new small pure display-mapping functions listed above.
