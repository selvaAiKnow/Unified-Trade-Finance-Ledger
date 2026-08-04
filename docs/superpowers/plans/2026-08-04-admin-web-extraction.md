# Admin Web Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the admin panel's *frontend* out of `web/` into a new standalone `admin-web/` app — its own Vite+React+TypeScript project, own login page, own routing — while the backend stays exactly as it is today in `api` (the `/admin/*` routes, unchanged). `web/` reverts to being purely the business-user app it was before the admin panel existed.

**Architecture:** `admin-web` is a small, independent single-page app calling `api`'s existing endpoints directly (`POST /auth/login`, `GET /auth/me`, `GET/PATCH /admin/*`) — no new backend, no shared package, just duplicated copies of the handful of small utilities (`apiFetch`, `AuthStore`, `Badge`/`Panel`, status-tone helpers) that both apps need, matching how every other pairing of independent projects in this repo already works (no monorepo tooling, no shared `packages/` library — `packages/` is an empty placeholder). `web` loses every trace of `PLATFORM_ADMIN`-awareness it gained while the admin panel lived inside it.

**Tech Stack:** React + TypeScript + Vite + Vitest + Tailwind (both `web`, unchanged, and the new `admin-web`, matching its exact tooling versions).

## Global Constraints

- No backend changes in this plan. `api`'s `/admin/*` routes, `PLATFORM_ADMIN` role, and both migrations stay exactly as they are.
- `web` must end this plan with **zero** references to `PLATFORM_ADMIN`, `AdminShell`, `RoleGates`, `AdminOrganizationsPage`/`AdminUsersPage`/`AdminTradesPage`, or `api/admin.ts` — a full, clean revert to its pre-admin-panel shape, not just an unused leftover.
- If a platform admin's credentials are used on `web`'s login page by mistake, that is explicitly out of scope to guard against — `web` reverts to having no special handling for that case, same as before the admin panel existed.
- `admin-web` reuses `api`'s existing `VITE_API_BASE_URL` convention (default `http://localhost:8000`) — it talks to the same backend `web` does, just a different subset of routes.
- `admin-web`'s visual language (colors, fonts, `Badge`/`Panel` components) must match `web`'s exactly — same Tailwind theme tokens, same component APIs — since it's presenting the same product to the same kind of user.

---

### Task 1: Revert `web/` — remove all admin-panel code

**Files:**
- Delete: `web/src/components/AdminShell.tsx`
- Delete: `web/src/components/AdminShell.test.tsx`
- Delete: `web/src/components/RoleGates.tsx`
- Delete: `web/src/components/RoleGates.test.tsx`
- Delete: `web/src/pages/AdminOrganizationsPage.tsx`
- Delete: `web/src/pages/AdminOrganizationsPage.test.tsx`
- Delete: `web/src/pages/AdminUsersPage.tsx`
- Delete: `web/src/pages/AdminUsersPage.test.tsx`
- Delete: `web/src/pages/AdminTradesPage.tsx`
- Delete: `web/src/pages/AdminTradesPage.test.tsx`
- Delete: `web/src/api/admin.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/LoginPage.tsx`
- Modify: `web/src/pages/LoginPage.test.tsx`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/lib/roles.ts`
- Modify: `web/src/pages/NewTransactionPage.tsx`
- Modify: `web/src/pages/ProfilePage.tsx`

**Interfaces:** None produced — this task is a pure subtraction. No later task in this plan depends on anything in `web`.

- [ ] **Step 1: Delete the admin-panel files**

```bash
git rm web/src/components/AdminShell.tsx web/src/components/AdminShell.test.tsx
git rm web/src/components/RoleGates.tsx web/src/components/RoleGates.test.tsx
git rm web/src/pages/AdminOrganizationsPage.tsx web/src/pages/AdminOrganizationsPage.test.tsx
git rm web/src/pages/AdminUsersPage.tsx web/src/pages/AdminUsersPage.test.tsx
git rm web/src/pages/AdminTradesPage.tsx web/src/pages/AdminTradesPage.test.tsx
git rm web/src/api/admin.ts
```

- [ ] **Step 2: Revert `App.tsx` to its pre-admin-panel route tree**

Replace the full contents of `web/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TransactionDetailLayout } from './components/TransactionDetailLayout';
import { BankSignupPage } from './pages/BankSignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { OrganizationProfilePage } from './pages/OrganizationProfilePage';
import { OrganizationSignupPage } from './pages/OrganizationSignupPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';
import { TeamPage } from './pages/TeamPage';
import { TransactionBankReviewPage } from './pages/TransactionBankReviewPage';
import { TransactionCompliancePage } from './pages/TransactionCompliancePage';
import { TransactionDocumentsPage } from './pages/TransactionDocumentsPage';
import { TransactionOverviewPage } from './pages/TransactionOverviewPage';
import { TransactionTimelinePage } from './pages/TransactionTimelinePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/organization" element={<OrganizationSignupPage />} />
          <Route path="/signup/banking" element={<BankSignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/transactions/new" element={<NewTransactionPage />} />
              <Route path="/transactions/:tradeId" element={<TransactionDetailLayout />}>
                <Route path="overview" element={<TransactionOverviewPage />} />
                <Route path="documents" element={<TransactionDocumentsPage />} />
                <Route path="compliance" element={<TransactionCompliancePage />} />
                <Route path="bank-review" element={<TransactionBankReviewPage />} />
                <Route path="timeline" element={<TransactionTimelinePage />} />
              </Route>
              <Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 3: Revert `App.test.tsx`**

Replace the full contents of `web/src/App.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it("redirects an unauthenticated user to the login page (unmatched here, so falls through to ProtectedRoute's redirect target once routed)", () => {
    render(<App />);
    // With no token in localStorage, ProtectedRoute redirects toward /login;
    // this test only proves App mounts without throwing given the real
    // AuthProvider/BrowserRouter tree.
    expect(document.getElementById('root') ?? document.body).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Revert the login redirect in `LoginPage.tsx`**

In `web/src/pages/LoginPage.tsx`, change line 31:

```tsx
      navigate('/dashboard');
```

- [ ] **Step 5: Revert `LoginPage.test.tsx`**

Replace the full contents of `web/src/pages/LoginPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { LoginPage } from './LoginPage';

function renderPage(store: AuthStore) {
  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('LoginPage', () => {
  it('submits email and password and stores the session on success', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' });

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(store.isAuthenticated).toBe(true));
    expect(store.token).toBe('tok-1');
  });

  it('shows an error message when login fails', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('Invalid email or password'));

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('shows a distinct message when login succeeds but loading the profile fails, without establishing a session', async () => {
    const store = new AuthStore();
    const setSessionSpy = vi.spyOn(store, 'setSession');
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new Error('network blip'));

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/couldn't load your profile/i)).toBeInTheDocument();
    expect(setSessionSpy).not.toHaveBeenCalled();
    expect(store.isAuthenticated).toBe(false);
  });

  it('links to the signup hub and the forgot-password page', () => {
    const store = new AuthStore();
    renderPage(store);

    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });
});
```

- [ ] **Step 6: Revert `types.ts`**

In `web/src/api/types.ts`, change line 3 and the `User` interface:

```ts
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER';
```

```ts
export interface User {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}
```

- [ ] **Step 7: Revert `roles.ts`**

In `web/src/lib/roles.ts`, remove the `PLATFORM_ADMIN` entry from `ROLE_LABELS`:

```ts
const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};
```

- [ ] **Step 8: Drop the now-unnecessary non-null assertions**

In `web/src/pages/NewTransactionPage.tsx`, change lines 128-129 (now that `User.org_id` is non-optional again, the assertion is a type error — plain access is correct):

```tsx
    setForm((prev) => ({ ...prev, [selfField]: user.org_id }));
    getOrganization(user.org_id).then((org) => setSelfOrgName(org.name));
```

In `web/src/pages/ProfilePage.tsx`, change lines 28-29:

```tsx
          getOrganization(user.org_id),
          listOrganizationKybChecks(user.org_id),
```

- [ ] **Step 9: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean. Confirm via `grep -rln "PLATFORM_ADMIN\|AdminShell\|RoleGates\|AdminOrganizationsPage\|AdminUsersPage\|AdminTradesPage" src` that nothing remains (expect zero output).

- [ ] **Step 10: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/pages/LoginPage.tsx web/src/pages/LoginPage.test.tsx web/src/api/types.ts web/src/lib/roles.ts web/src/pages/NewTransactionPage.tsx web/src/pages/ProfilePage.tsx
git commit -m "Revert web/ to its pre-admin-panel shape; admin UI is moving to its own app"
```

---

### Task 2: Scaffold `admin-web` — tooling and shared utilities

**Files:**
- Create: `admin-web/package.json`
- Create: `admin-web/vite.config.ts`
- Create: `admin-web/vitest.config.ts`
- Create: `admin-web/tsconfig.json`
- Create: `admin-web/tsconfig.node.json`
- Create: `admin-web/postcss.config.js`
- Create: `admin-web/tailwind.config.js`
- Create: `admin-web/index.html`
- Create: `admin-web/.env.example`
- Create: `admin-web/src/main.tsx`
- Create: `admin-web/src/index.css`
- Create: `admin-web/src/test-setup.ts`
- Create: `admin-web/src/App.tsx` (placeholder, replaced fully in Task 3)
- Create: `admin-web/src/App.test.tsx`
- Create: `admin-web/src/api/client.ts`
- Create: `admin-web/src/api/client.test.ts`
- Create: `admin-web/src/api/types.ts`
- Create: `admin-web/src/api/auth.ts`
- Create: `admin-web/src/api/admin.ts`
- Create: `admin-web/src/lib/roles.ts`
- Create: `admin-web/src/lib/statusTones.ts`
- Create: `admin-web/src/stores/AuthStore.ts`
- Create: `admin-web/src/stores/AuthContext.tsx`
- Create: `admin-web/src/components/ui/Badge.tsx`
- Create: `admin-web/src/components/ui/Panel.tsx`

**Interfaces:**
- Produces: `apiFetch` (`api/client.ts`), `AuthStore`/`AuthContext`/`useAuthStore`/`AuthProvider` (`stores/`), `Badge`/`Panel` (`components/ui/`), `roleLabel` (`lib/roles.ts`), `kybStatusInfo`/`tradeStatusInfo`/`userStatusInfo` (`lib/statusTones.ts`), `login`/`getMe` (`api/auth.ts`), `listAdminOrganizations`/`listAdminOrganizationKybChecks`/`updateOrganizationKybStatus`/`listAdminUsers`/`listAdminTrades` (`api/admin.ts`), the `Organization`/`User`/`Trade`/`KybCheck`/`UserRole`/`KybStatus`/`TradeStatus`/`UserStatus` types (`api/types.ts`). Task 3 imports all of these by these exact names.

- [ ] **Step 1: Create the Vite/TS/Tailwind tooling files**

Create `admin-web/package.json`:

```json
{
  "name": "utfl-admin-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "mobx": "^6.13.3",
    "mobx-react-lite": "^4.0.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^26.1.1",
    "@types/react": "^18.3.9",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

Create `admin-web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
});
```

Create `admin-web/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    globals: true,
  },
});
```

Create `admin-web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `admin-web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

Create `admin-web/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `admin-web/tailwind.config.js` — same theme tokens as `web`'s, so `Badge`/`Panel` render identically:

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
        review: { DEFAULT: '#8A6320', soft: '#F8EEDC' },
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

Create `admin-web/index.html`:

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
    <title>Trade Ledger — Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `admin-web/.env.example`:

```
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 2: Create the app entry point and global styles**

Create `admin-web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `admin-web/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-paper text-ink;
}
```

Create `admin-web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Create the API client**

Create `admin-web/src/api/client.ts` — identical to `web/src/api/client.ts` (same backend, same convention):

```ts
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

let authToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isFormData) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
```

Create `admin-web/src/api/client.test.ts` — identical to `web/src/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch, setAuthToken, setUnauthorizedHandler } from './client';

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    setAuthToken(null);
    setUnauthorizedHandler(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a GET request without an Authorization header when no token is set', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await apiFetch<{ ok: boolean }>('/health');

    expect(result).toEqual({ ok: true });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('attaches a Bearer Authorization header once a token is set', async () => {
    setAuthToken('test-token-123');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiFetch('/auth/me');

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('sends a JSON body and Content-Type header for a POST with a body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), { status: 201 }),
    );

    await apiFetch('/admin/organizations/o-1/kyb-status', { method: 'PATCH', body: { kyb_status: 'BLOCK' } });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ kyb_status: 'BLOCK' }));
  });

  it('throws ApiError with the response status on a non-2xx response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('not found', { status: 404 }),
    );

    await expect(apiFetch('/admin/organizations/unknown/kyb-checks')).rejects.toMatchObject({ status: 404 });
  });

  it('calls the registered unauthorized handler on a 401 response', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Create the types this app actually needs**

Create `admin-web/src/api/types.ts` — a trimmed-down copy of `web/src/api/types.ts`, keeping only what `admin-web` uses (no signup/document/sanctions/bank-review/password-reset types):

```ts
export type OrgType = 'EXPORTER' | 'BUYER' | 'BANK' | 'BOTH';
export type KybStatus = 'PENDING' | 'CLEAR' | 'REVIEW' | 'BLOCK';
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER' | 'PLATFORM_ADMIN';
export type UserStatus = 'ACTIVE' | 'INVITED';
export type TradeStatus = 'DRAFT' | 'DOCS_UNDER_REVIEW' | 'COMPLIANCE_CLEAR' | 'BANK_REVIEW' | 'ACCEPTED' | 'CLOSED';

export interface Organization {
  id: string;
  name: string;
  org_type: OrgType;
  country: string;
  industry: string;
  tax_id: string;
  kyb_status: KybStatus;
  created_at: string;
}

export interface KybCheck {
  id: string;
  org_id: string;
  check_type: string;
  status: string;
  detail: string | null;
  checked_at: string;
}

export interface User {
  id: string;
  org_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Trade {
  id: string;
  lc_reference: string;
  industry: string;
  instrument_type: string;
  exporter_org_id: string;
  buyer_org_id: string;
  issuing_bank_org_id: string;
  advising_bank_org_id: string;
  product_description: string;
  order_value: number;
  currency: string;
  incoterm: string;
  payment_term: string;
  shipment_deadline: string | null;
  status: TradeStatus;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Create the auth and admin API wrappers**

Create `admin-web/src/api/auth.ts` — only the two functions this app needs (no signup/forgot-password/OTP — admin accounts are bootstrapped, not self-service):

```ts
import { apiFetch } from './client';
import type { LoginRequest, LoginResponse, User } from './types';

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}
```

Create `admin-web/src/api/admin.ts` — identical to `web/src/api/admin.ts`:

```ts
import { apiFetch } from './client';
import type { KybCheck, KybStatus, Organization, Trade, User } from './types';

export function listAdminOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/admin/organizations');
}

export function listAdminOrganizationKybChecks(orgId: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/admin/organizations/${orgId}/kyb-checks`);
}

export function updateOrganizationKybStatus(orgId: string, kybStatus: KybStatus): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}/kyb-status`, {
    method: 'PATCH',
    body: { kyb_status: kybStatus },
  });
}

export function listAdminUsers(): Promise<User[]> {
  return apiFetch<User[]>('/admin/users');
}

export function listAdminTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/admin/trades');
}
```

- [ ] **Step 6: Create the label/status-tone helpers**

Create `admin-web/src/lib/roles.ts` — only `roleLabel` (this app never checks `canCreateTransaction`/`canInviteTeamMembers`/`isBankReviewerRole`, those are business-app concepts):

```ts
import type { UserRole } from '../api/types';

const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
  PLATFORM_ADMIN: 'Platform Admin',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
```

Create `admin-web/src/lib/statusTones.ts` — only the three status-info functions the three admin pages use:

```ts
import type { KybStatus, TradeStatus, UserStatus } from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';

interface StatusInfo {
  tone: BadgeTone;
  label: string;
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

export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
  };
  return map[status];
}
```

- [ ] **Step 7: Create the auth store**

Create `admin-web/src/stores/AuthStore.ts` — identical to `web/src/stores/AuthStore.ts`:

```ts
import { makeAutoObservable, runInAction } from 'mobx';

import { getMe } from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';

export class AuthStore {
  token: string | null = null;
  user: User | null = null;
  isHydrating = true;

  constructor() {
    makeAutoObservable(this);
    this.token = localStorage.getItem('token');
    setAuthToken(this.token);
    setUnauthorizedHandler(() => this.logout());
  }

  get isAuthenticated(): boolean {
    return this.token !== null && this.user !== null;
  }

  async hydrate(): Promise<void> {
    if (!this.token) {
      this.isHydrating = false;
      return;
    }
    try {
      const user = await getMe();
      runInAction(() => {
        this.user = user;
        this.isHydrating = false;
      });
    } catch {
      this.logout();
      runInAction(() => {
        this.isHydrating = false;
      });
    }
  }

  setSession(token: string, user: User): void {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    setAuthToken(token);
  }

  logout(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    setAuthToken(null);
  }
}
```

Create `admin-web/src/stores/AuthContext.tsx` — identical to `web/src/stores/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AuthStore } from './AuthStore';

export const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AuthStore());

  useEffect(() => {
    store.hydrate();
  }, [store]);

  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuthStore(): AuthStore {
  const store = useContext(AuthContext);
  if (!store) {
    throw new Error('useAuthStore must be used within an AuthProvider');
  }
  return store;
}
```

- [ ] **Step 8: Create the shared UI primitives**

Create `admin-web/src/components/ui/Badge.tsx` — identical to `web/src/components/ui/Badge.tsx`:

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

Create `admin-web/src/components/ui/Panel.tsx` — identical to `web/src/components/ui/Panel.tsx`:

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
          {title && <h2 className="text-[15px] font-semibold mb-1">{title}</h2>}
          {description && <p className="text-ink-soft text-[13px]">{description}</p>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 9: Create a placeholder `App.tsx` to prove the toolchain works**

Create `admin-web/src/App.tsx` (Task 3 replaces this with real routing):

```tsx
function App() {
  return <div className="p-8 text-ink">Trade Ledger — Admin</div>;
}

export default App;
```

Create `admin-web/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Trade Ledger — Admin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Install dependencies and run the suite**

```bash
cd admin-web
npm install
npx tsc -b
npx vitest run
```

Expected: typecheck clean, all tests pass (`App.test.tsx`'s 1 test + `client.test.ts`'s 5 tests = 6 tests).

- [ ] **Step 11: Add `.gitignore` entries**

`node_modules/` and `dist/` are almost certainly already covered by patterns in the repo-root `.gitignore` used for `web/` — check first (`git check-ignore admin-web/node_modules admin-web/dist`). If either is NOT already ignored, add `admin-web/node_modules/` and/or `admin-web/dist/` to the repo-root `.gitignore`.

- [ ] **Step 12: Commit**

```bash
git add admin-web/
git commit -m "Scaffold admin-web: tooling and shared utilities (client, auth, ui, types)"
```

---

### Task 3: `admin-web` — login, routing, and the three admin pages

**Files:**
- Create: `admin-web/src/components/RequireAdmin.tsx`
- Create: `admin-web/src/components/RequireAdmin.test.tsx`
- Create: `admin-web/src/components/AdminShell.tsx`
- Create: `admin-web/src/components/AdminShell.test.tsx`
- Create: `admin-web/src/pages/LoginPage.tsx`
- Create: `admin-web/src/pages/LoginPage.test.tsx`
- Create: `admin-web/src/pages/AdminOrganizationsPage.tsx`
- Create: `admin-web/src/pages/AdminOrganizationsPage.test.tsx`
- Create: `admin-web/src/pages/AdminUsersPage.tsx`
- Create: `admin-web/src/pages/AdminUsersPage.test.tsx`
- Create: `admin-web/src/pages/AdminTradesPage.tsx`
- Create: `admin-web/src/pages/AdminTradesPage.test.tsx`
- Modify: `admin-web/src/App.tsx`
- Modify: `admin-web/src/App.test.tsx`

**Interfaces:**
- Consumes (from Task 2): `AuthProvider`/`AuthContext`/`useAuthStore`/`AuthStore` (`stores/`), `login`/`getMe` (`api/auth.ts`), `listAdminOrganizations`/`listAdminOrganizationKybChecks`/`updateOrganizationKybStatus`/`listAdminUsers`/`listAdminTrades` (`api/admin.ts`), `Badge`/`Panel` (`components/ui/`), `roleLabel` (`lib/roles.ts`), `kybStatusInfo`/`tradeStatusInfo`/`userStatusInfo` (`lib/statusTones.ts`), `setAuthToken` (`api/client.ts`).
- Produces: the final `App` — no later task depends on it further.

- [ ] **Step 1: Write the failing route-guard test**

Create `admin-web/src/components/RequireAdmin.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { RequireAdmin } from './RequireAdmin';

function renderWithSession(role: string | null) {
  const store = new AuthStore();
  store.isHydrating = false;
  if (role) {
    store.setSession('tok', { id: 'u-1', org_id: null, name: 'Test', email: 'test@example.com', role: role as never, status: 'ACTIVE' });
  }

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/" element={<div>Admin area</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAdmin', () => {
  it('renders the protected route for a PLATFORM_ADMIN session', () => {
    renderWithSession('PLATFORM_ADMIN');
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });

  it('redirects to /login when there is no session', () => {
    renderWithSession(null);
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects to /login when the session is not a platform admin', () => {
    renderWithSession('VIEWER');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin-web && npx vitest run src/components/RequireAdmin.test.tsx`
Expected: FAIL — `./RequireAdmin` doesn't exist yet.

- [ ] **Step 3: Write the route guard**

Create `admin-web/src/components/RequireAdmin.tsx` — this app has exactly one class of protected route, so the "must be authenticated" check (`ProtectedRoute` in `web`) and the "must be an admin" check (`RequireAdmin` in `web`) collapse into one component here:

```tsx
import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const RequireAdmin = observer(function RequireAdmin() {
  const auth = useAuthStore();

  if (auth.isHydrating) {
    return <div className="p-6 text-ink-soft">Loading…</div>;
  }

  if (!auth.isAuthenticated || auth.user?.role !== 'PLATFORM_ADMIN') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin-web && npx vitest run src/components/RequireAdmin.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing shell test**

Create `admin-web/src/components/AdminShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { AdminShell } from './AdminShell';

function renderShell() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: '1', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN' as never, status: 'ACTIVE' });

  return {
    store,
    ...render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <AdminShell />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
  };
}

describe('AdminShell', () => {
  it('shows links to Organizations, Users, and Trades', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trades' })).toBeInTheDocument();
  });

  it('logs out when the log out button is clicked', async () => {
    const { store } = renderShell();
    const logoutSpy = vi.spyOn(store, 'logout');

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd admin-web && npx vitest run src/components/AdminShell.test.tsx`
Expected: FAIL — `./AdminShell` doesn't exist yet.

- [ ] **Step 7: Write the shell**

Create `admin-web/src/components/AdminShell.tsx` — same top-nav layout as `web`'s former `AdminShell`, with routes at the app root instead of under `/admin`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'text-seal font-semibold' : 'text-ink-soft hover:text-ink';
}

export function AdminShell() {
  const auth = useAuthStore();

  return (
    <div className="min-h-screen bg-paper">
      <div className="h-[60px] border-b border-line bg-paper-2 flex items-center justify-between px-7">
        <div className="font-serif font-bold text-[16.5px]">Trade Ledger — Admin</div>
        <nav className="flex items-center gap-5 text-[13.5px] font-medium">
          <NavLink to="/" end className={navLinkClassName}>
            Organizations
          </NavLink>
          <NavLink to="/users" className={navLinkClassName}>
            Users
          </NavLink>
          <NavLink to="/trades" className={navLinkClassName}>
            Trades
          </NavLink>
          <button onClick={() => auth.logout()} className="text-ink-soft hover:text-ink font-semibold">
            Log out
          </button>
        </nav>
      </div>
      <div className="px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd admin-web && npx vitest run src/components/AdminShell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing login test**

Create `admin-web/src/pages/LoginPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { LoginPage } from './LoginPage';

function renderPage(store: AuthStore) {
  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Admin home stub</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('LoginPage', () => {
  it('signs in and navigates to the admin home on success for a platform admin', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: '1',
      org_id: null,
      name: 'Ops Admin',
      email: 'admin@utfl.example',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    });

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@utfl.example');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Admin home stub')).toBeInTheDocument();
    expect(store.isAuthenticated).toBe(true);
  });

  it('rejects a successful login for a non-platform-admin account without establishing a session', async () => {
    const store = new AuthStore();
    const setSessionSpy = vi.spyOn(store, 'setSession');
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: '2',
      org_id: 'o-1',
      name: 'Business User',
      email: 'business@example.com',
      role: 'VIEWER',
      status: 'ACTIVE',
    });

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'business@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/not a platform admin/i)).toBeInTheDocument();
    expect(setSessionSpy).not.toHaveBeenCalled();
    expect(store.isAuthenticated).toBe(false);
  });

  it('shows an error message when login fails', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('Invalid email or password'));

    renderPage(store);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@utfl.example');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `cd admin-web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL — `./LoginPage` doesn't exist yet.

- [ ] **Step 11: Write the login page**

Create `admin-web/src/pages/LoginPage.tsx`:

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
      const me = await getMe();
      if (me.role !== 'PLATFORM_ADMIN') {
        setAuthToken(auth.token);
        setError('This account is not a platform admin.');
        return;
      }
      auth.setSession(access_token, me);
      navigate('/');
    } catch {
      setAuthToken(auth.token);
      setError("Signed in, but couldn't load your profile. Please try again.");
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(28,43,57,0.04), rgba(28,43,57,0)), ' +
          'repeating-linear-gradient(135deg, rgba(28,43,57,0.025) 0 2px, transparent 2px 26px), ' +
          '#F1EFE7',
      }}
    >
      <div className="w-full max-w-sm bg-paper-2 border border-line p-10">
        <div className="font-serif font-bold text-xs tracking-[3.5px] text-seal uppercase mb-1.5">Trade Ledger</div>
        <h2 className="font-serif text-2xl font-medium mb-1.5">Admin sign in</h2>
        <p className="text-ink-soft text-sm mb-7">Platform administration.</p>
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
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
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

- [ ] **Step 12: Run the test to verify it passes**

Run: `cd admin-web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 13: Write the failing organizations-page test**

Create `admin-web/src/pages/AdminOrganizationsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AdminOrganizationsPage } from './AdminOrganizationsPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Sakura Textiles K.K.', org_type: 'BUYER', country: 'Japan', industry: 'Textiles & Apparel', tax_id: 'TAX-2', kyb_status: 'REVIEW', created_at: '2026-01-01T00:00:00Z' },
];

describe('AdminOrganizationsPage', () => {
  it('renders every organization platform-wide with its KYB status', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Sakura Textiles K.K.')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockRejectedValue(new Error('boom'));

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText(/couldn't load organizations/i)).toBeInTheDocument();
  });

  it("lets an admin change an organization's KYB status", async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    const updateSpy = vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockResolvedValue({ ...orgs[0], kyb_status: 'BLOCK' });

    render(<AdminOrganizationsPage />);
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(updateSpy).toHaveBeenCalledWith('o-1', 'BLOCK');
    expect((screen.getByLabelText(/change kyb status for indus exports/i) as HTMLSelectElement).value).toBe('BLOCK');
  });

  it('reverts the status and shows an error if the update fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockRejectedValue(new Error('boom'));

    render(<AdminOrganizationsPage />);
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(await screen.findByText(/couldn't update the kyb status/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/change kyb status for indus exports/i) as HTMLSelectElement).value).toBe('CLEAR');
  });
});
```

- [ ] **Step 14: Run the test to verify it fails**

Run: `cd admin-web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: FAIL — `./AdminOrganizationsPage` doesn't exist yet.

- [ ] **Step 15: Write the organizations page**

Create `admin-web/src/pages/AdminOrganizationsPage.tsx` — identical to `web`'s former `AdminOrganizationsPage.tsx` (already includes the KYB status editor and the stale-error-banner fix from that page's own review history):

```tsx
import { useEffect, useState } from 'react';

import { listAdminOrganizations, updateOrganizationKybStatus } from '../api/admin';
import type { KybStatus, Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

const KYB_STATUS_OPTIONS: KybStatus[] = ['PENDING', 'CLEAR', 'REVIEW', 'BLOCK'];

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleStatusChange(orgId: string, kybStatus: KybStatus) {
    setError(null);
    const previous = organizations;
    setOrganizations((orgs) => orgs?.map((org) => (org.id === orgId ? { ...org, kyb_status: kybStatus } : org)) ?? orgs);
    try {
      await updateOrganizationKybStatus(orgId, kybStatus);
    } catch {
      setOrganizations(previous);
      setError("Couldn't update the KYB status. Please try again.");
    }
  }

  if (organizations === null) {
    if (error) {
      return <p className="text-block text-sm">{error}</p>;
    }
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      {error && <p className="text-block text-sm">{error}</p>}
      <h1 className="font-serif text-2xl mb-4">Organizations</h1>
      {organizations.length === 0 ? (
        <p className="text-ink-soft">No organizations yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Type</th>
                <th className="py-2.5 px-6">Country</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">KYB status</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const status = kybStatusInfo(org.kyb_status);
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{org.name}</td>
                    <td className="py-3 px-6">{org.org_type}</td>
                    <td className="py-3 px-6">{org.country}</td>
                    <td className="py-3 px-6">{org.industry}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <select
                          aria-label={`Change KYB status for ${org.name}`}
                          value={org.kyb_status}
                          onChange={(e) => handleStatusChange(org.id, e.target.value as KybStatus)}
                          className="text-xs border border-line-strong rounded px-1.5 py-1"
                        >
                          {KYB_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {kybStatusInfo(option).label}
                            </option>
                          ))}
                        </select>
                      </div>
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

- [ ] **Step 16: Run the test to verify it passes**

Run: `cd admin-web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 17: Write the failing users-page and trades-page tests**

Create `admin-web/src/pages/AdminUsersPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { AdminUsersPage } from './AdminUsersPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
  { id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
];

describe('AdminUsersPage', () => {
  it('renders every user platform-wide, resolving org_id to the correct organization name', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.queryByText('Global Imports Co.')).not.toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument();
  });
});
```

Create `admin-web/src/pages/AdminTradesPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Trade } from '../api/types';
import { AdminTradesPage } from './AdminTradesPage';

const trades: Trade[] = [
  {
    id: 't-1',
    lc_reference: 'MUFGJP2026LC1187',
    industry: 'Pharmaceuticals',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-1',
    buyer_org_id: 'o-2',
    issuing_bank_org_id: 'o-3',
    advising_bank_org_id: 'o-4',
    product_description: 'Paracetamol Tablets 500mg',
    order_value: 80000,
    currency: 'USD',
    incoterm: 'CIF Osaka',
    payment_term: 'Usance LC, 60 days',
    shipment_deadline: '2026-09-15',
    status: 'DOCS_UNDER_REVIEW',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 't-2',
    lc_reference: 'SGDIN2026LC2491',
    industry: 'Electronics',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-5',
    buyer_org_id: 'o-6',
    issuing_bank_org_id: 'o-7',
    advising_bank_org_id: 'o-8',
    product_description: 'Circuit boards',
    order_value: 42000,
    currency: 'SGD',
    incoterm: 'FOB Singapore',
    payment_term: 'Sight LC',
    shipment_deadline: '2026-10-20',
    status: 'ACCEPTED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('AdminTradesPage', () => {
  it('renders every trade platform-wide', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockResolvedValue(trades);

    render(<AdminTradesPage />);

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15')).toBeInTheDocument();
    expect(screen.getByText('SGDIN2026LC2491')).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockRejectedValue(new Error('boom'));

    render(<AdminTradesPage />);

    expect(await screen.findByText(/couldn't load trades/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 18: Run the tests to verify they fail**

Run: `cd admin-web && npx vitest run src/pages/AdminUsersPage.test.tsx src/pages/AdminTradesPage.test.tsx`
Expected: FAIL — neither page exists yet.

- [ ] **Step 19: Write the users and trades pages**

Create `admin-web/src/pages/AdminUsersPage.tsx` — identical to `web`'s former `AdminUsersPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminOrganizations, listAdminUsers } from '../api/admin';
import type { Organization, User } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAdminUsers(), listAdminOrganizations()])
      .then(([fetchedUsers, fetchedOrganizations]) => {
        setUsers(fetchedUsers);
        setOrganizations(fetchedOrganizations);
      })
      .catch(() => setError("Couldn't load users. Please try again."));
  }, []);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Users</h1>
      {users.length === 0 ? (
        <p className="text-ink-soft">No users yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Email</th>
                <th className="py-2.5 px-6">Organization</th>
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
                    <td className="py-3 px-6">{orgName(user.org_id)}</td>
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
}
```

Create `admin-web/src/pages/AdminTradesPage.tsx` — identical to `web`'s former `AdminTradesPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminTrades } from '../api/admin';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminTradesPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load trades. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Trades</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No trades yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">LC reference</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">Order value</th>
                <th className="py-2.5 px-6">Shipment deadline</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const status = tradeStatusInfo(trade.status);
                return (
                  <tr key={trade.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{trade.lc_reference}</td>
                    <td className="py-3 px-6">{trade.industry}</td>
                    <td className="py-3 px-6 font-mono">
                      {trade.currency} {trade.order_value.toLocaleString()}
                    </td>
                    <td className="py-3 px-6">{trade.shipment_deadline ?? '—'}</td>
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

- [ ] **Step 20: Run the tests to verify they pass**

Run: `cd admin-web && npx vitest run src/pages/AdminUsersPage.test.tsx src/pages/AdminTradesPage.test.tsx`
Expected: PASS (2 tests + 2 tests).

- [ ] **Step 21: Wire it all into `App.tsx`**

Replace the full contents of `admin-web/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminShell } from './components/AdminShell';
import { RequireAdmin } from './components/RequireAdmin';
import { LoginPage } from './pages/LoginPage';
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { AdminTradesPage } from './pages/AdminTradesPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/" element={<AdminOrganizationsPage />} />
              <Route path="/users" element={<AdminUsersPage />} />
              <Route path="/trades" element={<AdminTradesPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 22: Replace the placeholder `App.test.tsx` with a real end-to-end route test**

Replace the full contents of `admin-web/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as adminApi from './api/admin';
import * as authApi from './api/auth';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('redirects an unauthenticated visitor to the login page', async () => {
    render(<App />);

    expect(await screen.findByText(/admin sign in/i)).toBeInTheDocument();
  });

  it('routes a platform admin session through to the real organizations page', async () => {
    localStorage.setItem('token', 'tok-admin');
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: 'u-admin',
      org_id: null,
      name: 'Ops Admin',
      email: 'admin@utfl.example',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    });
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trades' })).toBeInTheDocument();
  });

  it('redirects a non-admin session back to the login page', async () => {
    localStorage.setItem('token', 'tok-business');
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: 'u-business',
      org_id: 'o-1',
      name: 'Priya Shah',
      email: 'priya@example.com',
      role: 'VIEWER',
      status: 'ACTIVE',
    });

    render(<App />);

    expect(await screen.findByText(/admin sign in/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 23: Typecheck and run the full suite**

Run: `cd admin-web && npx tsc -b && npx vitest run`
Expected: both clean.

- [ ] **Step 24: Commit**

```bash
git add admin-web/
git commit -m "Add login, routing, and the three admin pages to admin-web"
```
