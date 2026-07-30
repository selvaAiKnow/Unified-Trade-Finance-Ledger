# Login Background, Sidebar Collapse, and Logout Icon — Design

## Purpose

Three small follow-up fixes to the web UI design-alignment work
(`docs/superpowers/specs/2026-07-30-ui-design-alignment-design.md`):

1. The login page dropped the prototype's subtle background texture during
   the restyle — restore it.
2. Add a collapse/expand toggle to the sidebar (a new capability, not
   present in the reference prototype — invented for this app since the
   prototype has no equivalent).
3. Replace the sidebar's "Log out" text link with an icon-only button,
   moved onto the org-chip row.

A fourth item — "is all left side menu there?" — required no code change:
the current nav (Dashboard, Transactions, New transaction, Team) already
covers every page the app actually has. The prototype's additional items
("Onboard a party", "Document Verification", "Bank Rules", "Settings")
were explicitly deferred in the original design-alignment spec since
there's no backend for them.

## Scope Decisions (from brainstorming)

- **Collapse style:** icon-only rail (~64px), not fully hidden. Labels and
  section headers disappear; icons remain.
- **Persistence:** collapsed/expanded state is stored in `localStorage`
  and restored on mount, defaulting to expanded.
- **Logout icon placement:** same row as the org chip, right-aligned when
  expanded; centered below the avatar when collapsed (a rail has no
  meaningful "right side"). The logout icon is always visible in both
  states — collapsing must never block signing out.

## Architecture

**LoginPage** (`web/src/pages/LoginPage.tsx`): add the prototype's
background — a top-fade linear gradient plus a diagonal repeating-line
texture — to the outer container's className/style. Pure presentational
change; no logic touched.

**AppShell** (`web/src/components/AppShell.tsx`):
- New local state `collapsed: boolean`, initialized by reading
  `localStorage.getItem('sidebar-collapsed') === 'true'` (default
  `false`), written back on every toggle.
- A toggle button rendered in the sidebar's brand header area, using a
  simple chevron/panel icon that flips direction with `collapsed`.
- Sidebar width becomes conditional: `w-[236px]` expanded, `w-16`
  collapsed.
- Nav labels and the two section-header `<div>`s render only when
  `!collapsed`; nav icons always render.
- Org-chip footer: expanded renders today's row (avatar + name/role) with
  the new icon-only logout button right-aligned in the same flex row;
  collapsed renders just the avatar (still linking to `/profile`) with the
  logout icon centered beneath it.
- No route, nav-destination, or role-gating logic changes — this is
  layout/presentation only, same as the rest of the design-alignment work.

## Testing

`AppShell.test.tsx`'s 4 existing tests (no "Compliance" text, user name
shown, name/role linked to `/profile`, "Superuser" label for admin roles)
must keep passing unchanged — none of them depend on the sidebar's width,
the logout control's markup, or collapse state.

New tests: toggling the collapse button hides/shows nav label text and
persists the choice to `localStorage`; the logout button is present (by
`aria-label`) and calls `auth.logout()` in both expanded and collapsed
states.

`LoginPage.test.tsx`'s 3 existing tests are unaffected (they don't assert
on background styling).

## Global Constraint

No behavior changes to routing, data-fetching, or role-gating anywhere in
this slice — only the three items above.
