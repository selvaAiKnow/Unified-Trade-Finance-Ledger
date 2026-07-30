# Web UI Design-System Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every existing page in `web/` to match the visual design system shown in `prototypes/trade_finance_platform_app.html` (fonts, color palette, dark sidebar shell, panel/badge/stat-card components) without changing any page's data-fetching, routing, or business logic.

**Architecture:** Retune `tailwind.config.js` color tokens to the prototype's palette and add its Google Fonts; build three small shared presentational primitives (`Panel`, `Badge`, `StatCard`) plus a `statusTones.ts` module of pure status→(tone,label) mapping functions; rebuild `AppShell` as a dark icon-nav sidebar with a breadcrumb topbar; then restyle each page in turn to use these primitives.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + React Testing Library (existing stack, unchanged).

## Global Constraints

- **No behavior changes.** No page's data-fetching, routing, role-gating, or business logic changes anywhere in this plan — only JSX structure, Tailwind classNames, and the new pure display-mapping functions in `statusTones.ts`.
- **Primary action buttons use `bg-seal text-white` (hover `bg-seal-dark`), not `bg-ink`.** This matches the prototype, where `--seal` (green) is the primary button color, not the dark ink/navy color. Apply this to every primary submit/CTA button touched by any task below.
- **Existing Tailwind class names stay the same** (`bg-ink`, `text-ink-soft`, `border-line`, `bg-paper-2`, etc.) — only their underlying hex values change in Task 1. Do not invent parallel token names for concepts the config already covers (e.g. reuse `verified`/`review`/`block` as the positive/warning/negative status tones — do not add a new `amber` token).
- **Every task ends by running `npx vitest run` and `npx tsc -b` from `web/`** and confirming the full suite is green and the build is clean before committing.
- All file paths below are relative to the repo root (`D:\projects\UTFL`); commands run from `web/` unless stated otherwise.

---

### Task 1: Design tokens and fonts

**Files:**
- Modify: `web/index.html`
- Modify: `web/tailwind.config.js`

**Interfaces:**
- Produces: retuned color tokens (`ink`, `ink-2`, `ink-soft`, `paper`, `paper-2`, `line`, `line-soft`, `line-strong`, `seal`, `seal-dark`, `seal-soft`, `verified`, `verified-soft`, `review`, `review-soft`, `block`, `block-soft`) and `fontFamily.serif/sans/mono`, consumed by every later task.

- [ ] **Step 1: Add Google Fonts to `web/index.html`**

Replace the file's contents with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <title>Trade Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Retune colors and add fonts in `web/tailwind.config.js`**

Replace the file's contents with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1C2B39', 2: '#152029', soft: '#5B6670' },
        paper: { DEFAULT: '#F1EFE7', 2: '#FFFFFF' },
        line: { DEFAULT: '#DAD6C9', soft: '#EAE8DC', strong: '#C7C2B2' },
        seal: { DEFAULT: '#2F6E63', dark: '#234F47', soft: '#E6F0EE' },
        verified: { DEFAULT: '#2F6E63', soft: '#E6F0EE' },
        review: { DEFAULT: '#B8862E', soft: '#F8EEDC' },
        block: { DEFAULT: '#9C3B30', soft: '#F5E7E4' },
      },
      fontFamily: {
        serif: ['"Roboto Slab"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Verify**

This is a pure config/token change with no logic — there is no new failing test to write. Instead, run the existing suite to confirm nothing regressed:

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 72 existing tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/tailwind.config.js
git commit -m "Adopt prototype's design tokens: colors and fonts"
```

---

### Task 2: Shared UI primitives (Panel, Badge, StatCard, statusTones)

**Files:**
- Create: `web/src/components/ui/Panel.tsx`
- Create: `web/src/components/ui/Badge.tsx`
- Create: `web/src/components/ui/StatCard.tsx`
- Create: `web/src/lib/statusTones.ts`
- Test: `web/src/lib/statusTones.test.ts`

**Interfaces:**
- Consumes: color tokens from Task 1 (`verified`, `review`, `block`, `line-soft`, `ink-soft`, `seal`).
- Produces (consumed by every later task):
  - `Panel({ title?: string, description?: string, noPadding?: boolean, className?: string, children: ReactNode })` from `web/src/components/ui/Panel.tsx`.
  - `Badge({ tone: 'positive' | 'warning' | 'negative' | 'neutral', children: ReactNode })` and the exported `BadgeTone` type from `web/src/components/ui/Badge.tsx`.
  - `StatCard({ label: string, value: number | string })` from `web/src/components/ui/StatCard.tsx`.
  - `tradeStatusInfo`, `kybStatusInfo`, `kybCheckStatusInfo`, `sanctionsStatusInfo`, `userStatusInfo`, `bankReviewResultInfo` — each `(status) => { tone: BadgeTone; label: string }` — from `web/src/lib/statusTones.ts`.

- [ ] **Step 1: Write the failing test for `statusTones.ts`**

Create `web/src/lib/statusTones.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  bankReviewResultInfo,
  kybCheckStatusInfo,
  kybStatusInfo,
  sanctionsStatusInfo,
  tradeStatusInfo,
  userStatusInfo,
} from './statusTones';

describe('tradeStatusInfo', () => {
  it('maps every TradeStatus value to a tone and label', () => {
    expect(tradeStatusInfo('DRAFT')).toEqual({ tone: 'neutral', label: 'Draft' });
    expect(tradeStatusInfo('DOCS_UNDER_REVIEW')).toEqual({ tone: 'warning', label: 'Docs under review' });
    expect(tradeStatusInfo('COMPLIANCE_CLEAR')).toEqual({ tone: 'positive', label: 'Compliance clear' });
    expect(tradeStatusInfo('BANK_REVIEW')).toEqual({ tone: 'warning', label: 'Bank review' });
    expect(tradeStatusInfo('ACCEPTED')).toEqual({ tone: 'positive', label: 'Accepted' });
    expect(tradeStatusInfo('CLOSED')).toEqual({ tone: 'neutral', label: 'Closed' });
  });
});

describe('kybStatusInfo', () => {
  it('maps every KybStatus value to a tone and label', () => {
    expect(kybStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybStatusInfo('CLEAR')).toEqual({ tone: 'positive', label: 'Clear' });
    expect(kybStatusInfo('REVIEW')).toEqual({ tone: 'warning', label: 'Review' });
    expect(kybStatusInfo('BLOCK')).toEqual({ tone: 'negative', label: 'Blocked' });
  });
});

describe('kybCheckStatusInfo', () => {
  it('maps every KybCheckStatus value to a tone and label', () => {
    expect(kybCheckStatusInfo('PASSED')).toEqual({ tone: 'positive', label: 'Passed' });
    expect(kybCheckStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybCheckStatusInfo('FAILED')).toEqual({ tone: 'negative', label: 'Failed' });
  });
});

describe('sanctionsStatusInfo', () => {
  it('maps every SanctionsStatus value to a tone and label', () => {
    expect(sanctionsStatusInfo('CLEAR')).toEqual({ tone: 'positive', label: 'Clear' });
    expect(sanctionsStatusInfo('REVIEW')).toEqual({ tone: 'warning', label: 'Review' });
    expect(sanctionsStatusInfo('BLOCK')).toEqual({ tone: 'negative', label: 'Blocked' });
  });
});

describe('userStatusInfo', () => {
  it('maps every UserStatus value to a tone and label', () => {
    expect(userStatusInfo('ACTIVE')).toEqual({ tone: 'positive', label: 'Active' });
    expect(userStatusInfo('INVITED')).toEqual({ tone: 'warning', label: 'Invited' });
  });
});

describe('bankReviewResultInfo', () => {
  it('maps every BankReviewResult value to a tone and label', () => {
    expect(bankReviewResultInfo('MATCHES_LC')).toEqual({ tone: 'positive', label: 'Matches LC' });
    expect(bankReviewResultInfo('DISCREPANCY')).toEqual({ tone: 'negative', label: 'Discrepancy' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/statusTones.test.ts`
Expected: FAIL — `statusTones.ts` does not exist yet.

- [ ] **Step 3: Implement `statusTones.ts`**

Create `web/src/lib/statusTones.ts`:

```ts
import type {
  BankReviewResult,
  KybCheckStatus,
  KybStatus,
  SanctionsStatus,
  TradeStatus,
  UserStatus,
} from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';

interface StatusInfo {
  tone: BadgeTone;
  label: string;
}

export function tradeStatusInfo(status: TradeStatus): StatusInfo {
  const map: Record<TradeStatus, StatusInfo> = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    DOCS_UNDER_REVIEW: { tone: 'warning', label: 'Docs under review' },
    COMPLIANCE_CLEAR: { tone: 'positive', label: 'Compliance clear' },
    BANK_REVIEW: { tone: 'warning', label: 'Bank review' },
    ACCEPTED: { tone: 'positive', label: 'Accepted' },
    CLOSED: { tone: 'neutral', label: 'Closed' },
  };
  return map[status];
}

export function kybStatusInfo(status: KybStatus): StatusInfo {
  const map: Record<KybStatus, StatusInfo> = {
    PENDING: { tone: 'warning', label: 'Pending' },
    CLEAR: { tone: 'positive', label: 'Clear' },
    REVIEW: { tone: 'warning', label: 'Review' },
    BLOCK: { tone: 'negative', label: 'Blocked' },
  };
  return map[status];
}

export function kybCheckStatusInfo(status: KybCheckStatus): StatusInfo {
  const map: Record<KybCheckStatus, StatusInfo> = {
    PASSED: { tone: 'positive', label: 'Passed' },
    PENDING: { tone: 'warning', label: 'Pending' },
    FAILED: { tone: 'negative', label: 'Failed' },
  };
  return map[status];
}

export function sanctionsStatusInfo(status: SanctionsStatus): StatusInfo {
  const map: Record<SanctionsStatus, StatusInfo> = {
    CLEAR: { tone: 'positive', label: 'Clear' },
    REVIEW: { tone: 'warning', label: 'Review' },
    BLOCK: { tone: 'negative', label: 'Blocked' },
  };
  return map[status];
}

export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
  };
  return map[status];
}

export function bankReviewResultInfo(result: BankReviewResult): StatusInfo {
  const map: Record<BankReviewResult, StatusInfo> = {
    MATCHES_LC: { tone: 'positive', label: 'Matches LC' },
    DISCREPANCY: { tone: 'negative', label: 'Discrepancy' },
  };
  return map[result];
}
```

- [ ] **Step 4: Implement `Badge.tsx`**

Create `web/src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from 'react';

export type BadgeTone = 'positive' | 'warning' | 'negative' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: 'bg-verified-soft text-verified',
  warning: 'bg-review-soft text-review',
  negative: 'bg-block-soft text-block',
  neutral: 'bg-line-soft text-ink-soft',
};

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Implement `Panel.tsx`**

Create `web/src/components/ui/Panel.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  description?: string;
  noPadding?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, description, noPadding = false, className = '', children }: PanelProps) {
  return (
    <div className={`bg-paper-2 border border-line rounded mb-5 ${className}`}>
      {(title || description) && (
        <div className="px-6 pt-6 pb-1">
          {title && <div className="text-[15px] font-semibold mb-1">{title}</div>}
          {description && <p className="text-ink-soft text-[13px]">{description}</p>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `StatCard.tsx`**

Create `web/src/components/ui/StatCard.tsx`:

```tsx
export interface StatCardProps {
  label: string;
  value: number | string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-paper-2 border border-line rounded px-5 py-4">
      <div className="font-mono text-2xl font-semibold text-seal">{value}</div>
      <div className="text-xs text-ink-soft uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/statusTones.test.ts`
Expected: PASS (6 describe blocks, 6 tests)

- [ ] **Step 8: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all tests pass (72 existing + 6 new = 78), `tsc -b` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ui/Panel.tsx web/src/components/ui/Badge.tsx web/src/components/ui/StatCard.tsx web/src/lib/statusTones.ts web/src/lib/statusTones.test.ts
git commit -m "Add shared Panel/Badge/StatCard primitives and status tone mappings"
```

---

### Task 3: AppShell rebuild (dark sidebar + breadcrumb topbar)

**Files:**
- Modify: `web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `roleLabel` from `web/src/lib/roles.ts` (existing), `isExporterRole` (existing), color tokens from Task 1.
- No new exports — `AppShell` itself is already consumed by `web/src/App.tsx` (unchanged).

- [ ] **Step 1: Replace `web/src/components/AppShell.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { isExporterRole, roleLabel } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function NewTransactionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
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

export const AppShell = observer(function AppShell() {
  const auth = useAuthStore();
  const location = useLocation();
  const user = auth.user!;
  const isExporter = isExporterRole(user.role);
  const breadcrumb = getBreadcrumb(location.pathname);
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="w-[236px] shrink-0 bg-ink-2 text-[#CBD3D8] flex flex-col sticky top-0 h-screen">
        <div className="px-[22px] pt-[22px] pb-[18px] border-b border-white/10">
          <div className="font-serif font-bold text-white text-[16.5px]">Trade Ledger</div>
        </div>
        <nav className="flex-1 px-3 py-3.5 flex flex-col gap-0.5">
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-2.5 pb-1.5">Overview</div>
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <DashboardIcon />
            Dashboard
          </Link>
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">
            Trade Operations
          </div>
          <Link
            to="/transactions"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <TransactionsIcon />
            Transactions
          </Link>
          {isExporter && (
            <Link
              to="/transactions/new"
              className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
            >
              <NewTransactionIcon />
              New transaction
            </Link>
          )}
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">Account</div>
          <Link
            to="/team"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <TeamIcon />
            Team
          </Link>
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <Link to="/profile" className="flex items-center gap-2.5 hover:opacity-90">
            <div className="w-[30px] h-[30px] rounded-full bg-seal text-white font-serif font-bold text-[12.5px] flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-white">{user.name}</div>
              <div className="text-[11px] text-[#8C9BA6]">{roleLabel(user.role)}</div>
            </div>
          </Link>
          <button onClick={() => auth.logout()} className="mt-3 text-xs text-[#8C9BA6] underline hover:text-white">
            Log out
          </button>
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

This keeps every nav destination, the exporter gate on "New transaction", the profile link, and `roleLabel`/logout behavior exactly as before — only the markup/classes change. `AppShell.test.tsx`'s existing assertions (`queryByText('Compliance')` absent, user name shown, name/role block linked to `/profile`, "Superuser" label shown for admin roles) all still hold since none of that text or the `/profile` link changed.

- [ ] **Step 2: Run the existing AppShell tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/components/AppShell.test.tsx`
Expected: PASS (4 tests, no changes needed to the test file)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/AppShell.tsx
git commit -m "Rebuild AppShell as a dark icon-nav sidebar with breadcrumb topbar"
```

---

### Task 4: LoginPage restyle

**Files:**
- Modify: `web/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: color tokens from Task 1. No new primitives needed (single standalone card, not part of the app shell's Panel system).

- [ ] **Step 1: Replace `web/src/pages/LoginPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { getMe, login } from '../api/auth';
import { setAuthToken } from '../api/client';
import { useAuthStore } from '../stores/AuthContext';

export function LoginPage() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let access_token: string;
    try {
      ({ access_token } = await login({ email, password }));
    } catch {
      setError('Invalid email or password');
      return;
    }

    try {
      setAuthToken(access_token);
      auth.setSession(access_token, await getMe());
      navigate('/dashboard');
    } catch {
      setAuthToken(auth.token);
      setError("Signed in, but couldn't load your profile. Please try again.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm bg-paper-2 border border-line p-10">
        <div className="font-serif font-bold text-xs tracking-[3.5px] text-seal uppercase mb-1.5">Trade Ledger</div>
        <h2 className="font-serif text-2xl font-medium mb-1.5">Sign in to your workspace</h2>
        <p className="text-ink-soft text-sm mb-7">Cross-border trade finance in one place.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Work email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {error && <p className="text-block text-sm">{error}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
```

Every label, input `id`, and button text is unchanged, so `LoginPage.test.tsx`'s three existing tests (submit success, invalid credentials, profile-load failure) all still pass.

- [ ] **Step 2: Run the existing LoginPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LoginPage.tsx
git commit -m "Restyle LoginPage to match the prototype's login card"
```

---

### Task 5: Signup hub and SignupForm restyle

**Files:**
- Modify: `web/src/pages/SignupPage.tsx`
- Modify: `web/src/components/SignupForm.tsx`

**Interfaces:**
- Consumes: `Badge` and `kybStatusInfo` from Task 2; color tokens from Task 1.
- `web/src/pages/OrganizationSignupPage.tsx` and `web/src/pages/BankSignupPage.tsx` are **not modified** — they only pass props into `SignupForm`, so this task's `SignupForm` restyle covers them automatically.

- [ ] **Step 1: Replace `web/src/pages/SignupPage.tsx`**

```tsx
import { Link } from 'react-router-dom';

export function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-2xl">
        <h1 className="font-serif text-2xl text-center mb-2">Onboard a party</h1>
        <p className="text-ink-soft text-sm text-center mb-8">
          Choose who you're bringing onto the platform. Trade entities and financial institutions follow different
          verification paths.
        </p>
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-paper-2 border border-line rounded p-6">
            <div className="font-mono text-[11px] text-seal uppercase tracking-wide mb-2.5">
              Import / export house
            </div>
            <h2 className="font-serif text-lg mb-2">Organization</h2>
            <p className="text-ink-soft text-sm mb-4">
              Exporters and importers who will create and manage trade transactions.
            </p>
            <Link
              to="/signup/organization"
              className="inline-block bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark"
            >
              Start organization onboarding
            </Link>
          </div>
          <div className="bg-paper-2 border border-line rounded p-6">
            <div className="font-mono text-[11px] text-seal uppercase tracking-wide mb-2.5">Bank / financier</div>
            <h2 className="font-serif text-lg mb-2">Banking</h2>
            <p className="text-ink-soft text-sm mb-4">Banks and financiers joining as a participant institution.</p>
            <Link
              to="/signup/banking"
              className="inline-block bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark"
            >
              Start banking onboarding
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `web/src/components/SignupForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType, SignupResponse } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from './ui/Badge';

export interface SignupFormProps {
  heading: string;
  subheading: string;
  orgTypeOptions: Array<{ value: OrgType; label: string }>;
  orgNameLabel?: string;
  successHeading?: string;
  errorMessage?: string;
}

export function SignupForm({
  heading,
  subheading,
  orgTypeOptions,
  orgNameLabel = 'Organization name',
  successHeading = 'Organization verified',
  errorMessage = 'Could not create your organization. Please check your details and try again.',
}: SignupFormProps) {
  const [step, setStep] = useState<'account' | 'verify'>('account');
  const [form, setForm] = useState({
    orgName: '',
    orgType: orgTypeOptions[0].value,
    country: '',
    industry: '',
    taxId: '',
    adminName: '',
    adminEmail: '',
    password: '',
  });
  const [result, setResult] = useState<SignupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccountSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await signup({
        organization: {
          name: form.orgName,
          org_type: form.orgType,
          country: form.country,
          industry: form.industry,
          tax_id: form.taxId,
        },
        admin_user: {
          name: form.adminName,
          email: form.adminEmail,
          password: form.password,
        },
      });
      setResult(response);
      setStep('verify');
    } catch {
      setError(errorMessage);
    }
  }

  if (step === 'verify' && result) {
    const kyb = kybStatusInfo(result.organization.kyb_status);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
        <div className="w-full max-w-md bg-paper-2 border border-line p-8 text-center">
          <h2 className="font-serif text-xl mb-2">{successHeading}</h2>
          <p className="text-ink-soft mb-4">{result.organization.name}</p>
          <div className="flex justify-center mb-5">
            <Badge tone={kyb.tone}>KYB status: {kyb.label}</Badge>
          </div>
          <Link to="/login" className="inline-block bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark">
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper py-10">
      <div className="w-full max-w-lg bg-paper-2 border border-line p-8">
        <h2 className="font-serif text-xl mb-1">{heading}</h2>
        <p className="text-ink-soft text-sm mb-4">{subheading}</p>
        <form onSubmit={handleAccountSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              {orgNameLabel}
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {orgTypeOptions.length > 1 && (
            <div>
              <label htmlFor="orgType" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Organization type
              </label>
              <select
                id="orgType"
                value={form.orgType}
                onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                {orgTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="country" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Country
            </label>
            <input
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="industry" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Industry
            </label>
            <input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Tax / business ID
            </label>
            <input
              id="taxId"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="adminName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin name
            </label>
            <input
              id="adminName"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
```

All field `id`s/labels and button text are unchanged. The success screen still renders `successHeading` and the organization name; the KYB status text (`result.organization.kyb_status`) is now shown via `Badge`/`kybStatusInfo` instead of raw `<strong>` text — `kybStatusInfo('CLEAR').label` is `'Clear'`, which still matches the existing case-insensitive `findByText(/clear/i)` assertions in `OrganizationSignupPage.test.tsx` and `BankSignupPage.test.tsx`.

- [ ] **Step 3: Run the existing signup-related tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/SignupPage.test.tsx src/pages/OrganizationSignupPage.test.tsx src/pages/BankSignupPage.test.tsx`
Expected: PASS (1 + 2 + 1 = 4 tests)

- [ ] **Step 4: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/SignupPage.tsx web/src/components/SignupForm.tsx
git commit -m "Restyle signup hub and SignupForm to match the prototype"
```

---

### Task 6: DashboardPage restyle

**Files:**
- Modify: `web/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge`, `StatCard` (Task 2), `tradeStatusInfo` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/DashboardPage.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { isExporterRole } from '../lib/roles';
import { tradeStatusInfo } from '../lib/statusTones';
import { useAuthStore } from '../stores/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { StatCard } from '../components/ui/StatCard';

export const DashboardPage = observer(function DashboardPage() {
  const auth = useAuthStore();
  const user = auth.user!;
  const isExporter = isExporterRole(user.role);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load transactions. Please try again."));
  }, []);

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Welcome back, {firstName}</h1>
        {isExporter && (
          <Link
            to="/transactions/new"
            className="bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark"
          >
            + New transaction
          </Link>
        )}
      </div>
      {error ? (
        <p className="text-block text-sm">{error}</p>
      ) : trades === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3.5 mb-6">
            <StatCard label="Active transactions" value={trades.length} />
          </div>
          <Panel title="Recent activity" description="Latest updates across your transaction pipeline." noPadding>
            {trades.length === 0 ? (
              <p className="text-ink-soft p-6">No active transactions.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                    <th className="py-2.5 px-6">Reference</th>
                    <th className="py-2.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const status = tradeStatusInfo(trade.status);
                    return (
                      <tr key={trade.id} className="border-b border-line last:border-b-0">
                        <td className="py-3 px-6">
                          <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                            {trade.lc_reference}
                          </Link>
                        </td>
                        <td className="py-3 px-6">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
});
```

The "Active transactions" stat is `trades.length` — a trivial client-side count of data already fetched by this page, not a new data source. The greeting text, the exporter-gated "New transaction" link (same href, same accessible name), and the error/loading text are all unchanged.

- [ ] **Step 2: Run the existing DashboardPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/DashboardPage.tsx
git commit -m "Restyle DashboardPage with a stat card and badge-driven activity table"
```

---

### Task 7: TransactionsPage restyle

**Files:**
- Modify: `web/src/pages/TransactionsPage.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `tradeStatusInfo` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/TransactionsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function TransactionsPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load transactions. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Transactions</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No transactions yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">LC / Ref</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">Value</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const status = tradeStatusInfo(trade.status);
                return (
                  <tr key={trade.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">
                      <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                        {trade.lc_reference}
                      </Link>
                    </td>
                    <td className="py-3 px-6">{trade.industry}</td>
                    <td className="py-3 px-6 font-mono">
                      {trade.currency} {trade.order_value.toLocaleString()}
                    </td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing TransactionsPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/TransactionsPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TransactionsPage.tsx
git commit -m "Restyle TransactionsPage with a Panel-wrapped, badge-driven table"
```

---

### Task 8: NewTransactionPage restyle

**Files:**
- Modify: `web/src/pages/NewTransactionPage.tsx`

**Interfaces:**
- Consumes: `Panel` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/NewTransactionPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createTrade } from '../api/trades';
import type { TradeCreate } from '../api/types';
import { Panel } from '../components/ui/Panel';

const emptyForm: TradeCreate = {
  lc_reference: '',
  industry: '',
  instrument_type: '',
  exporter_org_id: '',
  buyer_org_id: '',
  issuing_bank_org_id: '',
  advising_bank_org_id: '',
  product_description: '',
  order_value: 0,
  currency: '',
  incoterm: '',
  payment_term: '',
};

const fieldLabels: Array<{ key: keyof TradeCreate; label: string; type?: string }> = [
  { key: 'lc_reference', label: 'LC reference' },
  { key: 'industry', label: 'Industry' },
  { key: 'instrument_type', label: 'Instrument type' },
  { key: 'exporter_org_id', label: 'Exporter org ID' },
  { key: 'buyer_org_id', label: 'Buyer org ID' },
  { key: 'issuing_bank_org_id', label: 'Issuing bank org ID' },
  { key: 'advising_bank_org_id', label: 'Advising bank org ID' },
  { key: 'product_description', label: 'Product description' },
  { key: 'order_value', label: 'Order value', type: 'number' },
  { key: 'currency', label: 'Currency' },
  { key: 'incoterm', label: 'Incoterm' },
  { key: 'payment_term', label: 'Payment term' },
];

export function NewTransactionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TradeCreate>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof TradeCreate, value: string) {
    setForm((prev) => ({ ...prev, [key]: key === 'order_value' ? Number(value) : value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const trade = await createTrade(form);
      navigate(`/transactions/${trade.id}/overview`);
    } catch {
      setError('Could not create the transaction. Please check the details and try again.');
    }
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Start a new transaction</h1>
      <Panel className="max-w-2xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          {fieldLabels.map(({ key, label, type }) => (
            <div key={key}>
              <label htmlFor={key} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                {label}
              </label>
              <input
                id={key}
                type={type ?? 'text'}
                value={form[key] as string | number}
                onChange={(e) => updateField(key, e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            </div>
          ))}
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Create transaction
          </button>
        </form>
      </Panel>
    </div>
  );
}
```

All field `id`s/labels and the submit button's accessible name are unchanged.

- [ ] **Step 2: Run the existing NewTransactionPage test to confirm it still passes unchanged**

Run: `cd web && npx vitest run src/pages/NewTransactionPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/NewTransactionPage.tsx
git commit -m "Restyle NewTransactionPage form inside a Panel"
```

---

### Task 9: TransactionTabs restyle

**Files:**
- Modify: `web/src/components/TransactionTabs.tsx`

**Interfaces:**
- Consumes: color tokens from Task 1. `web/src/components/TransactionDetailLayout.tsx` needs no changes — it only composes `TransactionTabs` and `Outlet` with no styling of its own.

- [ ] **Step 1: Replace `web/src/components/TransactionTabs.tsx`**

```tsx
import { NavLink } from 'react-router-dom';

const TABS = [
  { segment: 'overview', label: 'Overview' },
  { segment: 'documents', label: 'Documents' },
  { segment: 'compliance', label: 'Compliance' },
  { segment: 'bank-review', label: 'Bank Review' },
  { segment: 'timeline', label: 'Timeline' },
] as const;

function tabClassName({ isActive }: { isActive: boolean }) {
  return `px-3.5 py-2.5 text-[13.5px] font-semibold border-b-2 ${
    isActive ? 'border-seal text-seal' : 'border-transparent text-ink-soft hover:text-ink'
  }`;
}

export function TransactionTabs({ tradeId }: { tradeId: string }) {
  return (
    <nav className="flex gap-1 border-b border-line mb-6" aria-label="Transaction sections">
      {TABS.map((tab) => (
        <NavLink key={tab.segment} to={`/transactions/${tradeId}/${tab.segment}`} className={tabClassName}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

`NavLink` sets `aria-current="page"` on the active tab automatically regardless of `className` content, so the existing active/inactive assertions in both `TransactionTabs.test.tsx` and `TransactionDetailLayout.test.tsx` are unaffected.

- [ ] **Step 2: Run the existing tab tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/components/TransactionTabs.test.tsx src/components/TransactionDetailLayout.test.tsx`
Expected: PASS (2 + 1 = 3 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/TransactionTabs.tsx
git commit -m "Restyle TransactionTabs to match the prototype's tab treatment"
```

---

### Task 10: TransactionOverviewPage restyle

**Files:**
- Modify: `web/src/pages/TransactionOverviewPage.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `tradeStatusInfo` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/TransactionOverviewPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getTrade } from '../api/trades';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function TransactionOverviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tradeId) {
      setError(null);
      getTrade(tradeId)
        .then((fetchedTrade) => {
          setTrade(fetchedTrade);
          setError(null);
        })
        .catch(() => setError("Couldn't load the transaction. Please try again."));
    }
  }, [tradeId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = tradeStatusInfo(trade.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">
        {trade.industry} · {trade.currency} {trade.order_value.toLocaleString()}
      </p>
      <div className="grid grid-cols-2 gap-5">
        <Panel title="Terms">
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Incoterm</dt>
              <dd className="font-semibold">{trade.incoterm}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Payment term</dt>
              <dd className="font-semibold">{trade.payment_term}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Order value</dt>
              <dd className="font-mono font-semibold">
                {trade.currency} {trade.order_value.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Status</dt>
              <dd>
                <Badge tone={status.tone}>{status.label}</Badge>
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Product">
          <p className="text-sm">{trade.product_description}</p>
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the existing TransactionOverviewPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/TransactionOverviewPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TransactionOverviewPage.tsx
git commit -m "Restyle TransactionOverviewPage with Panel/Badge terms display"
```

---

### Task 11: TransactionDocumentsPage restyle

**Files:**
- Modify: `web/src/pages/TransactionDocumentsPage.tsx`

**Interfaces:**
- Consumes: `Panel` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/TransactionDocumentsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { listDocumentRegistry } from '../api/documentRegistry';
import { listDocuments, uploadDocument } from '../api/documents';
import { getTrade } from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';
import { Panel } from '../components/ui/Panel';

export function TransactionDocumentsPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [registry, setRegistry] = useState<DocumentRegistryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const fetchedTrade = await getTrade(tradeId as string);
        const [registryEntries, fetchedDocuments] = await Promise.all([
          listDocumentRegistry(fetchedTrade.industry, fetchedTrade.instrument_type),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setTrade(fetchedTrade);
        setRegistry(registryEntries);
        setDocuments(fetchedDocuments);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the transaction. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function handleUpload(entry: DocumentRegistryEntry, file: File) {
    if (!tradeId) return;
    setUploadError(null);
    try {
      await uploadDocument(tradeId, entry.category, entry.document_type, file);
      setDocuments(await listDocuments(tradeId));
    } catch {
      setUploadError("Couldn't upload the document. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">Document checklist for {trade.industry}</p>
      {uploadError && <p className="text-block text-sm mb-4">{uploadError}</p>}
      <Panel noPadding>
        <div className="divide-y divide-line">
          {registry.map((entry) => {
            const uploaded = documents.find((doc) => doc.document_type === entry.document_type);
            return (
              <div key={entry.id} className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <div className="font-medium text-sm">{entry.document_type}</div>
                  <div className="text-xs text-ink-soft">{entry.mandatory ? 'Mandatory' : 'Optional'}</div>
                </div>
                {uploaded ? (
                  <span className="text-verified text-sm font-semibold">Uploaded</span>
                ) : (
                  <label className="text-seal-dark text-sm font-semibold cursor-pointer">
                    Upload
                    <input
                      type="file"
                      className="hidden"
                      aria-label={`Upload ${entry.document_type}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(entry, file);
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Run the existing TransactionDocumentsPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/TransactionDocumentsPage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TransactionDocumentsPage.tsx
git commit -m "Restyle TransactionDocumentsPage checklist inside a Panel"
```

---

### Task 12: TransactionCompliancePage restyle

**Files:**
- Modify: `web/src/pages/TransactionCompliancePage.tsx`
- Modify: `web/src/pages/TransactionCompliancePage.test.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `sanctionsStatusInfo` (Task 2).

This page currently renders `screening.status` as raw enum text (`'CLEAR'`), and one existing test asserts on that exact raw string. Since `sanctionsStatusInfo('CLEAR').label` is the humanized `'Clear'`, that one assertion must be updated alongside the restyle — this is the same kind of display-text update the `roleLabel`/"Superuser" work made to `ProfilePage.test.tsx` earlier in this project.

- [ ] **Step 1: Update the exact-text assertion in `web/src/pages/TransactionCompliancePage.test.tsx`**

Change line 36 from:

```ts
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
```

to:

```ts
    expect(screen.getByText('Clear')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/TransactionCompliancePage.test.tsx`
Expected: FAIL on the "lists past sanctions screenings" test — the page still renders raw `'CLEAR'`, not `'Clear'`.

- [ ] **Step 3: Replace `web/src/pages/TransactionCompliancePage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { listSanctionsScreenings, triggerSanctionsScreening } from '../api/sanctionsScreening';
import type { SanctionsScreening } from '../api/types';
import { sanctionsStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function TransactionCompliancePage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [screenings, setScreenings] = useState<SanctionsScreening[] | null>(null);
  const [partyScreened, setPartyScreened] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refresh() {
    if (!tradeId) return;
    setError(null);
    try {
      setScreenings(await listSanctionsScreenings(tradeId));
      setError(null);
    } catch {
      setError("Couldn't load the sanctions screenings. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !partyScreened) return;
    setSubmitError(null);
    try {
      await triggerSanctionsScreening(tradeId, { party_screened: partyScreened });
      setPartyScreened('');
      await refresh();
    } catch {
      setSubmitError("Couldn't run the screening. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (screenings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Compliance</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-5 max-w-md">
        <div className="flex-1">
          <label htmlFor="partyScreened" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
            Party to screen
          </label>
          <input
            id="partyScreened"
            value={partyScreened}
            onChange={(e) => setPartyScreened(e.target.value)}
            className="w-full px-3 py-2.5 border border-line-strong rounded"
            required
          />
        </div>
        <button
          type="submit"
          className="self-end bg-seal text-white rounded px-4 py-2.5 font-semibold h-fit hover:bg-seal-dark"
        >
          Run screening
        </button>
      </form>
      {submitError && <p className="text-block text-sm mb-4">{submitError}</p>}
      {screenings.length === 0 ? (
        <p className="text-ink-soft">No screenings yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Party</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {screenings.map((screening) => {
                const status = sanctionsStatusInfo(screening.status);
                return (
                  <tr key={screening.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{screening.party_screened}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/TransactionCompliancePage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/TransactionCompliancePage.tsx web/src/pages/TransactionCompliancePage.test.tsx
git commit -m "Restyle TransactionCompliancePage with badge-driven screening status"
```

---

### Task 13: TransactionBankReviewPage restyle

**Files:**
- Modify: `web/src/pages/TransactionBankReviewPage.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `bankReviewResultInfo` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/TransactionBankReviewPage.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { createBankReviewFinding, listBankReviewFindings } from '../api/bankReview';
import { listDocuments } from '../api/documents';
import type { BankReviewFinding, BankReviewResult, Document } from '../api/types';
import { isBankReviewerRole } from '../lib/roles';
import { bankReviewResultInfo } from '../lib/statusTones';
import { useAuthStore } from '../stores/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export const TransactionBankReviewPage = observer(function TransactionBankReviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const auth = useAuthStore();
  const isBankReviewer = auth.user ? isBankReviewerRole(auth.user.role) : false;

  const [findings, setFindings] = useState<BankReviewFinding[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [result, setResult] = useState<BankReviewResult>('MATCHES_LC');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refreshFindings() {
    if (!tradeId) return;
    setError(null);
    try {
      setFindings(await listBankReviewFindings(tradeId));
      setError(null);
    } catch {
      setError("Couldn't load the bank review findings. Please try again.");
    }
  }

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedFindings, fetchedDocuments] = await Promise.all([
          listBankReviewFindings(tradeId as string),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setFindings(fetchedFindings);
        setDocuments(fetchedDocuments);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the bank review data. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !documentId) return;
    setSubmitError(null);
    try {
      await createBankReviewFinding(tradeId, { document_id: documentId, result, note: note || null });
      setNote('');
      await refreshFindings();
    } catch {
      setSubmitError("Couldn't record the finding. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (findings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Bank Review</h1>
      {isBankReviewer && (
        <Panel className="max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="documentId" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Document
              </label>
              <select
                id="documentId"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              >
                <option value="">Select a document</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.document_type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="result" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Result
              </label>
              <select
                id="result"
                value={result}
                onChange={(e) => setResult(e.target.value as BankReviewResult)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                <option value="MATCHES_LC">Matches LC</option>
                <option value="DISCREPANCY">Discrepancy</option>
              </select>
            </div>
            <div>
              <label htmlFor="note" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Note
              </label>
              <input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              />
            </div>
            {submitError && <p className="text-block text-sm">{submitError}</p>}
            <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
              Record finding
            </button>
          </form>
        </Panel>
      )}
      {findings.length === 0 ? (
        <p className="text-ink-soft">No findings yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((finding) => {
            const info = bankReviewResultInfo(finding.result);
            return (
              <li key={finding.id} className="border border-line rounded p-3.5 flex items-center gap-3">
                <Badge tone={info.tone}>{info.label}</Badge>
                {finding.note && <span className="text-sm">{finding.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Run the existing TransactionBankReviewPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/TransactionBankReviewPage.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TransactionBankReviewPage.tsx
git commit -m "Restyle TransactionBankReviewPage with badge-driven findings"
```

---

### Task 14: TransactionTimelinePage restyle

**Files:**
- Modify: `web/src/pages/TransactionTimelinePage.tsx`

**Interfaces:**
- Consumes: `Panel` (Task 2).

- [ ] **Step 1: Replace `web/src/pages/TransactionTimelinePage.tsx`**

```tsx
import { Panel } from '../components/ui/Panel';

const milestones = ['LC Issued', 'Regulatory Clear', 'Shipped', 'Docs Accepted', 'Settled', 'Closed'];

export function TransactionTimelinePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">Timeline</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Placeholder milestone view — not yet connected to a blockchain layer.
      </p>
      <Panel>
        <div className="flex justify-between relative">
          <div className="absolute top-[14px] left-0 right-0 h-[2px] bg-line" />
          {milestones.map((label, index) => (
            <div key={label} className="relative z-10 flex flex-col items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full bg-paper-2 border-2 border-line-strong flex items-center justify-center text-xs font-mono text-ink-soft">
                {index + 1}
              </div>
              <div className="text-xs text-ink-soft text-center max-w-[90px]">{label}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Run the existing TransactionTimelinePage test to confirm it still passes unchanged**

Run: `cd web && npx vitest run src/pages/TransactionTimelinePage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TransactionTimelinePage.tsx
git commit -m "Restyle TransactionTimelinePage milestone rail inside a Panel"
```

---

### Task 15: TeamPage restyle

**Files:**
- Modify: `web/src/pages/TeamPage.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `userStatusInfo` (Task 2), `roleLabel` (existing, unchanged).

- [ ] **Step 1: Replace `web/src/pages/TeamPage.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';

import { inviteUser, listUsers } from '../api/users';
import type { User, UserRole } from '../api/types';
import { canInviteTeamMembers, roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { useAuthStore } from '../stores/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export const TeamPage = observer(function TeamPage() {
  const auth = useAuthStore();
  const canInvite = auth.user ? canInviteTeamMembers(auth.user.role) : false;

  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const fetchedUsers = await listUsers();
      setUsers(fetchedUsers);
      setError(null);
    } catch {
      setError("Couldn't load the team. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await inviteUser({ name, email, role });
      setName('');
      setEmail('');
      await refresh();
    } catch {
      setSubmitError("Couldn't send the invite. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Team</h1>
      {canInvite && (
        <Panel className="max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            </div>
            <div>
              <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                <option value="DOCS_COMPLIANCE">Docs & Compliance</option>
                <option value="FINANCE">Finance</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>
            {submitError && <p className="text-block text-sm">{submitError}</p>}
            <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
              + Invite
            </button>
          </form>
        </Panel>
      )}
      {users.length === 0 ? (
        <p className="text-ink-soft">No team members yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Email</th>
                <th className="py-2.5 px-6">Role</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = userStatusInfo(user.status);
                return (
                  <tr key={user.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{user.name}</td>
                    <td className="py-3 px-6 font-mono">{user.email}</td>
                    <td className="py-3 px-6">{roleLabel(user.role)}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Run the existing TeamPage tests to confirm they still pass unchanged**

Run: `cd web && npx vitest run src/pages/TeamPage.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TeamPage.tsx
git commit -m "Restyle TeamPage with a badge-driven member table"
```

---

### Task 16: ProfilePage and OrganizationProfilePage restyle

**Files:**
- Modify: `web/src/pages/ProfilePage.tsx`
- Modify: `web/src/pages/OrganizationProfilePage.tsx`
- Modify: `web/src/pages/OrganizationProfilePage.test.tsx`

**Interfaces:**
- Consumes: `Panel`, `Badge` (Task 2), `kybStatusInfo`, `kybCheckStatusInfo` (Task 2), `roleLabel` (existing, unchanged).

This page currently renders `org.kyb_status` as raw enum text (`'CLEAR'`), and one existing test asserts on that exact raw string. `check_type` (e.g. `'SANCTIONS_SCREENING'`) is a category label, not a status, and stays as plain text — only the check's `status` field (`'PASSED'`) gets the Badge treatment, so the existing `getByText('SANCTIONS_SCREENING')` assertion is untouched.

- [ ] **Step 1: Update the exact-text assertion in `web/src/pages/OrganizationProfilePage.test.tsx`**

Change line 42 from:

```ts
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
```

to:

```ts
    expect(screen.getByText('Clear')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/OrganizationProfilePage.test.tsx`
Expected: FAIL on the "renders the organization profile and KYB checks" test — the page still renders raw `'CLEAR'`, not `'Clear'`.

- [ ] **Step 3: Replace `web/src/pages/ProfilePage.tsx`**

```tsx
import { observer } from 'mobx-react-lite';

import { roleLabel } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';
import { Panel } from '../components/ui/Panel';

export const ProfilePage = observer(function ProfilePage() {
  const auth = useAuthStore();
  const user = auth.user!;

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Your profile</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Name</span>
            <span className="font-semibold">{user.name}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Email</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Role</span>
            <span className="font-semibold">{roleLabel(user.role)}</span>
          </div>
        </div>
        <button onClick={() => auth.logout()} className="mt-4 text-block text-sm font-semibold hover:underline">
          Log out
        </button>
      </Panel>
    </div>
  );
});
```

- [ ] **Step 4: Replace `web/src/pages/OrganizationProfilePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function OrganizationProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedOrg, fetchedKybChecks] = await Promise.all([
          getOrganization(orgId as string),
          listOrganizationKybChecks(orgId as string),
        ]);
        if (cancelled) return;
        setOrg(fetchedOrg);
        setKybChecks(fetchedKybChecks);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the organization. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!org) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const kyb = kybStatusInfo(org.kyb_status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{org.name}</h1>
      <p className="text-ink-soft mb-6 flex items-center gap-2">
        {org.industry} · {org.country} · KYB status: <Badge tone={kyb.tone}>{kyb.label}</Badge>
      </p>
      <Panel noPadding>
        <div className="divide-y divide-line">
          {kybChecks.map((check) => {
            const status = kybCheckStatusInfo(check.status);
            return (
              <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm">{check.check_type}</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/ProfilePage.test.tsx src/pages/OrganizationProfilePage.test.tsx`
Expected: PASS (1 + 3 = 4 tests)

- [ ] **Step 6: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 78 tests pass, `tsc -b` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ProfilePage.tsx web/src/pages/OrganizationProfilePage.tsx web/src/pages/OrganizationProfilePage.test.tsx
git commit -m "Restyle ProfilePage and OrganizationProfilePage with Panel/Badge"
```

---

## Final Verification

After all 16 tasks are complete:

- [ ] Run `cd web && npx vitest run` — expect 78/78 tests passing (72 existing + 6 new `statusTones` tests; 2 pre-existing assertions updated in Tasks 12 and 16, no tests removed or skipped).
- [ ] Run `cd web && npx tsc -b` — expect a clean build with no output.
- [ ] Start the dev server (`npm run dev`) and manually click through: login, both signup tracks, dashboard, transactions list, new transaction, all five transaction-detail tabs, team, profile, and an organization profile — confirm every page renders the dark sidebar/breadcrumb shell, panel cards, and badge-styled statuses with no layout breakage.

