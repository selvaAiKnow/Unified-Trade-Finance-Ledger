# Login Background & Sidebar Collapse/Logout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the login page's background texture (dropped during the earlier restyle), add a collapsible icon-rail sidebar with persisted state, and replace the sidebar's text-based logout with an always-visible icon button.

**Architecture:** `LoginPage.tsx` gets an inline `style` background (Tailwind utilities can't express a multi-layer `repeating-linear-gradient`). `AppShell.tsx` gets a `collapsed` boolean state (backed by `localStorage`), a toggle button, conditional nav-label rendering (with `aria-label` fallback so links keep an accessible name when collapsed), and a restructured footer with an icon-only logout button.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + React Testing Library (existing stack, unchanged).

## Global Constraints

- No routing, data-fetching, or role-gating logic changes anywhere in this plan — presentation and one small piece of new client-only state (collapse toggle) only.
- Every task ends with `npx vitest run` and `npx tsc -b` both clean, run from `web/`.
- Nav items, their `to` targets, and the exporter gate on "New transaction" stay exactly as they are today.

---

### Task 1: Restore the login page's background texture

**Files:**
- Modify: `web/src/pages/LoginPage.tsx`

**Interfaces:**
- No new exports. Pure presentational change to the page's root `<div>`.

- [ ] **Step 1: Add the background style to `web/src/pages/LoginPage.tsx`**

Change the outer `<div>` from:

```tsx
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4">
```

to:

```tsx
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(28,43,57,0.04), rgba(28,43,57,0)), ' +
          'repeating-linear-gradient(135deg, rgba(28,43,57,0.025) 0 2px, transparent 2px 26px), ' +
          '#F1EFE7',
      }}
    >
```

`#F1EFE7` is the exact value of the `paper` Tailwind token (`web/tailwind.config.js`), so the base color is unchanged — only the gradient/texture layers on top are new. No other line in the file changes.

- [ ] **Step 2: Run the existing LoginPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (3 tests) — none of them assert on background styling.

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LoginPage.tsx
git commit -m "Restore the login page's background texture from the prototype"
```

---

### Task 2: Sidebar collapse toggle and icon-only logout

**Files:**
- Modify: `web/src/components/AppShell.tsx`
- Modify: `web/src/components/AppShell.test.tsx`

**Interfaces:**
- No new exports outside the file — `CollapseIcon`/`LogoutIcon` are local to `AppShell.tsx`, matching the existing local `DashboardIcon`/`TransactionsIcon`/`NewTransactionIcon`/`TeamIcon` pattern.
- New `localStorage` key: `'sidebar-collapsed'` (string `'true'`/`'false'`).

- [ ] **Step 1: Write the two new failing tests in `web/src/components/AppShell.test.tsx`**

Add `userEvent` and a `beforeEach` localStorage reset to the top of the file. The file currently starts:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { AppShell } from './AppShell';
```

Change it to:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { AppShell } from './AppShell';
```

Add this right after the `renderShell` helper function and before the `describe('AppShell', ...)` block:

```tsx
beforeEach(() => {
  window.localStorage.clear();
});
```

Add these two tests inside the existing `describe('AppShell', () => { ... })` block, after the last existing test:

```tsx
  it('collapses the sidebar to an icon-only rail and persists the choice', async () => {
    renderShell('VIEWER');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it('shows an icon-only logout button that signs the user out', async () => {
    const store = new AuthStore();
    store.isHydrating = false;
    store.setSession('tok', { id: '1', org_id: '2', name: 'Priya Shah', email: 'priya@example.com', role: 'VIEWER', status: 'ACTIVE' });
    const logoutSpy = vi.spyOn(store, 'logout');

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/components/AppShell.test.tsx`
Expected: FAIL — no "Collapse sidebar" button exists yet, and the current logout control is a text link with no accessible name matching `/log out/i` as a `button` role with icon-only content (it exists as a button today, so the second test may actually pass already since the current logout button's accessible name is "Log out" from its text content — that's fine, TDD doesn't require every new test to fail, only the collapse-related assertions need to be red here). Confirm the collapse test fails with "Unable to find role='button' with name /collapse sidebar/i".

- [ ] **Step 3: Replace `web/src/components/AppShell.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { isExporterRole, roleLabel } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function NewTransactionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`w-4 h-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

interface BreadcrumbMeta {
  section: string;
  title: string;
}

const BREADCRUMBS: Array<{ test: (path: string) => boolean } & BreadcrumbMeta> = [
  { test: (p) => p === '/dashboard', section: 'Overview', title: 'Dashboard' },
  { test: (p) => p === '/transactions/new', section: 'Trade Operations', title: 'New transaction' },
  { test: (p) => p === '/transactions', section: 'Trade Operations', title: 'Transactions' },
  { test: (p) => p.startsWith('/transactions/'), section: 'Trade Operations', title: 'Transaction detail' },
  { test: (p) => p === '/team', section: 'Account', title: 'Team' },
  { test: (p) => p === '/profile', section: 'Account', title: 'Profile' },
  { test: (p) => p.startsWith('/organizations/'), section: 'Account', title: 'Organization' },
];

function getBreadcrumb(pathname: string): BreadcrumbMeta {
  return BREADCRUMBS.find((entry) => entry.test(pathname)) ?? { section: '', title: '' };
}

function navLinkClassName(collapsed: boolean) {
  return function ({ isActive }: { isActive: boolean }) {
    return `flex items-center rounded text-[13.5px] font-medium ${
      collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2'
    } ${isActive ? 'bg-seal text-white' : 'text-[#B7C1C9] hover:bg-white/5 hover:text-white'}`;
  };
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

export const AppShell = observer(function AppShell() {
  const auth = useAuthStore();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  if (!auth.user) {
    return null;
  }
  const user = auth.user;
  const isExporter = isExporterRole(user.role);
  const breadcrumb = getBreadcrumb(location.pathname);
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const linkClassName = navLinkClassName(collapsed);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`${collapsed ? 'w-16' : 'w-[236px]'} shrink-0 bg-ink-2 text-[#CBD3D8] flex flex-col sticky top-0 h-screen transition-[width]`}
      >
        <div
          className={`flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-[22px]'} pt-[22px] pb-[18px] border-b border-white/10`}
        >
          {!collapsed && <div className="font-serif font-bold text-white text-[16.5px]">Trade Ledger</div>}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="text-[#8C9BA6] hover:text-white p-1"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-3.5 flex flex-col gap-0.5">
          {!collapsed && (
            <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-2.5 pb-1.5">Overview</div>
          )}
          <NavLink to="/dashboard" className={linkClassName} aria-label={collapsed ? 'Dashboard' : undefined}>
            <DashboardIcon />
            {!collapsed && 'Dashboard'}
          </NavLink>
          {!collapsed && (
            <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">
              Trade Operations
            </div>
          )}
          <NavLink to="/transactions" end className={linkClassName} aria-label={collapsed ? 'Transactions' : undefined}>
            <TransactionsIcon />
            {!collapsed && 'Transactions'}
          </NavLink>
          {isExporter && (
            <NavLink
              to="/transactions/new"
              className={linkClassName}
              aria-label={collapsed ? 'New transaction' : undefined}
            >
              <NewTransactionIcon />
              {!collapsed && 'New transaction'}
            </NavLink>
          )}
          {!collapsed && (
            <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">Account</div>
          )}
          <NavLink to="/team" className={linkClassName} aria-label={collapsed ? 'Team' : undefined}>
            <TeamIcon />
            {!collapsed && 'Team'}
          </NavLink>
        </nav>
        <div className={`${collapsed ? 'px-3' : 'px-5'} py-4 border-t border-white/10`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-3">
              <Link to="/profile" className="hover:opacity-90" aria-label={user.name}>
                <div className="w-[30px] h-[30px] rounded-full bg-seal text-white font-serif font-bold text-[12.5px] flex items-center justify-center">
                  {initials}
                </div>
              </Link>
              <button
                onClick={() => auth.logout()}
                aria-label="Log out"
                className="text-[#8C9BA6] hover:text-white p-1.5"
              >
                <LogoutIcon />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <Link to="/profile" className="flex items-center gap-2.5 hover:opacity-90 min-w-0">
                <div className="w-[30px] h-[30px] rounded-full bg-seal text-white font-serif font-bold text-[12.5px] flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white truncate">{user.name}</div>
                  <div className="text-[11px] text-[#8C9BA6]">{roleLabel(user.role)}</div>
                </div>
              </Link>
              <button
                onClick={() => auth.logout()}
                aria-label="Log out"
                className="text-[#8C9BA6] hover:text-white p-1.5 shrink-0"
              >
                <LogoutIcon />
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="h-[60px] border-b border-line bg-paper-2 flex items-center justify-between px-7 sticky top-0 z-10">
          <div>
            <div className="text-[12.5px] uppercase tracking-wide text-ink-soft">{breadcrumb.section}</div>
            <div className="font-serif text-[16.5px]">{breadcrumb.title}</div>
          </div>
        </div>
        <div className="px-8 py-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
});
```

Notes on why this preserves the 4 pre-existing tests:
- Default state is expanded (`collapsed` starts `false` since the tests' `jsdom` `localStorage` is empty), so `screen.getByText('Priya Shah')` and its `.closest('a')` → `/profile`, and the "Superuser" label via `roleLabel(user.role)`, all render exactly as before.
- No "Compliance" text is introduced anywhere.
- Nav `to` targets and the `isExporter &&` gate are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/components/AppShell.test.tsx`
Expected: PASS (6 tests: the 4 pre-existing + the 2 new ones)

- [ ] **Step 5: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 80 tests pass (78 existing + 2 new in this task), `tsc -b` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/AppShell.tsx web/src/components/AppShell.test.tsx
git commit -m "Add sidebar collapse toggle and icon-only logout button"
```

---

## Final Verification

- [ ] Run `cd web && npx vitest run` — expect 80/80 tests passing.
- [ ] Run `cd web && npx tsc -b` — expect a clean build with no output.
- [ ] Start the dev server and manually check: the login page shows the diagonal texture; the sidebar collapse toggle shrinks it to an icon rail and back, survives a page reload; the logout icon signs out from both expanded and collapsed states.
