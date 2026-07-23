# Web Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `web/` React portal — the third and final Phase 1 sub-project — consuming the already-merged `api` service's real endpoints, as specified in `docs/superpowers/specs/2026-07-23-web-portal-design.md`.

**Architecture:** A Vite + React 18 + TypeScript SPA. A typed API client (`src/api/`) wraps every `api` endpoint with auth-header injection and 401 handling. A single MobX `AuthStore` holds session state; every page owns its own local fetch/loading/error state. React Router drives navigation; an `AppShell` layout (topnav + role-aware sidebar) wraps every authenticated page behind a `ProtectedRoute`. No SSE — pages fetch on mount and refetch after mutations.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, MobX + mobx-react-lite, React Router v6, Vitest + React Testing Library + jsdom.

## Global Constraints

- All source lives under `web/src/`; all tests are co-located as `*.test.tsx`/`*.test.ts` next to the file they test; run via `npm test` (Vitest) from the `web/` directory.
- The API client's base URL comes from `import.meta.env.VITE_API_BASE_URL`, defaulting to `http://localhost:8000` if unset.
- JWT is stored in `localStorage` under the key `"token"`. No refresh-token flow — `api` issues 24h tokens with no refresh endpoint, matching what's already built.
- On any `401` response, the API client's registered "unauthorized" handler runs (set by `AuthStore` to clear the session) — every API call site relies on this, none should hand-roll their own 401 handling.
- TypeScript types for every `api` response/request shape must match the actual Pydantic schemas exactly (field names, optionality, enum value sets) — copied verbatim from `api/app/schemas/*.py` and `api/app/models/enums.py` as they exist today. Do not invent fields that don't exist on the backend.
- Role-based UI visibility (nav items, forms) mirrors `api`'s own role gates exactly (`ADMIN_ROLES = EXPORTER_ADMIN, BANK_REVIEWER, BUYER` for team invite; `BANK_REVIEWER` only for recording bank-review verdicts) — this is a UX convenience, not a security boundary; `api` independently enforces these regardless of what the UI shows.
- No new backend code in this plan — `web/` only consumes `api`, never modifies it.
- Tests mock the API client / `fetch` — no real network calls to a live `api` instance in this plan's test suite.
- Frequent commits: one commit per task, after its tests pass.

---

## File Structure

```
web/package.json
web/vite.config.ts
web/vitest.config.ts
web/tsconfig.json
web/tsconfig.node.json
web/tailwind.config.js
web/postcss.config.js
web/index.html
web/.env.example
web/src/main.tsx
web/src/App.tsx
web/src/App.test.tsx
web/src/index.css
web/src/test-setup.ts
web/src/api/client.ts
web/src/api/client.test.ts
web/src/api/types.ts
web/src/api/auth.ts
web/src/api/auth.test.ts
web/src/api/organizations.ts
web/src/api/users.ts
web/src/api/documentRegistry.ts
web/src/api/trades.ts
web/src/api/documents.ts
web/src/api/sanctionsScreening.ts
web/src/api/bankReview.ts
web/src/stores/AuthStore.ts
web/src/stores/AuthStore.test.ts
web/src/stores/AuthContext.tsx
web/src/components/ProtectedRoute.tsx
web/src/components/ProtectedRoute.test.tsx
web/src/components/AppShell.tsx
web/src/components/AppShell.test.tsx
web/src/pages/LoginPage.tsx
web/src/pages/LoginPage.test.tsx
web/src/pages/SignupPage.tsx
web/src/pages/SignupPage.test.tsx
web/src/pages/DashboardPage.tsx
web/src/pages/DashboardPage.test.tsx
web/src/pages/TransactionsPage.tsx
web/src/pages/TransactionsPage.test.tsx
web/src/pages/NewTransactionPage.tsx
web/src/pages/NewTransactionPage.test.tsx
web/src/pages/TransactionOverviewPage.tsx
web/src/pages/TransactionOverviewPage.test.tsx
web/src/pages/TransactionDocumentsPage.tsx
web/src/pages/TransactionDocumentsPage.test.tsx
web/src/pages/TransactionCompliancePage.tsx
web/src/pages/TransactionCompliancePage.test.tsx
web/src/pages/TransactionBankReviewPage.tsx
web/src/pages/TransactionBankReviewPage.test.tsx
web/src/pages/TransactionTimelinePage.tsx
web/src/pages/TransactionTimelinePage.test.tsx
web/src/pages/OrganizationProfilePage.tsx
web/src/pages/OrganizationProfilePage.test.tsx
web/src/pages/TeamPage.tsx
web/src/pages/TeamPage.test.tsx
web/src/pages/ProfilePage.tsx
web/src/pages/ProfilePage.test.tsx
```

---

### Task 1: Project scaffold (Vite, TypeScript, Tailwind, Vitest)

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/.env.example`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/index.css`, `web/src/test-setup.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a running Vite dev server, a Tailwind-configured stylesheet with the prototype's color palette as named theme colors, and a working Vitest + React Testing Library setup — the foundation every later task builds on.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "utfl-web-portal",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "mobx": "^6.13.3",
    "mobx-react-lite": "^4.0.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
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

- [ ] **Step 2: Install dependencies**

```bash
cd web
npm install
```

- [ ] **Step 3: Write `web/tsconfig.json`**

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

- [ ] **Step 4: Write `web/tsconfig.node.json`**

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

- [ ] **Step 5: Write `web/vite.config.ts`**

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 6: Write `web/vitest.config.ts`**

```typescript
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

- [ ] **Step 7: Write `web/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Write `web/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14213D', 2: '#20305A', soft: '#5B6472' },
        paper: { DEFAULT: '#F3F4EF', 2: '#FFFFFF' },
        line: { DEFAULT: '#DEDCD0', soft: '#EAE8DC' },
        seal: { DEFAULT: '#B8863A', dark: '#8C6427', soft: '#F1E4CC' },
        verified: { DEFAULT: '#1F6E52', soft: '#DEEEE6' },
        review: { DEFAULT: '#A66A1E', soft: '#F3E6D2' },
        block: { DEFAULT: '#A63A3A', soft: '#F3DEDE' },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 9: Write `web/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 10: Write `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Trade Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 11: Write `web/.env.example`**

```
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 12: Write `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-paper text-ink;
}
```

- [ ] **Step 13: Write the failing test `web/src/App.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText(/trade ledger/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Run the test to verify it fails**

Run (from `web/`): `npm test -- App.test.tsx`
Expected: FAIL — `./App` doesn't exist yet.

- [ ] **Step 15: Write `web/src/App.tsx`**

```typescript
function App() {
  return <div className="p-6 text-2xl font-semibold">Trade Ledger</div>;
}

export default App;
```

- [ ] **Step 16: Write `web/src/main.tsx`**

```typescript
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

- [ ] **Step 17: Run the test to verify it passes**

Run: `npm test -- App.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 18: Commit**

```bash
git add package.json vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js index.html .env.example src/main.tsx src/App.tsx src/App.test.tsx src/index.css src/test-setup.ts
git commit -m "Scaffold web portal (Vite, TypeScript, Tailwind, Vitest)"
```

Note: `package-lock.json` is created by `npm install` and should also be committed if not already covered by the above — run `git status` and add it too if present.

---

### Task 2: API client and shared types

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`
- Test: `web/src/api/client.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T>`, `ApiError` (class, has `.status`), `setAuthToken(token: string | null): void`, `setUnauthorizedHandler(handler: () => void): void` (all in `client.ts`) — consumed by every `api/*.ts` module in Tasks 3+. All TypeScript interfaces in `types.ts` (`Organization`, `KybCheck`, `User`, `SignupRequest`, `SignupResponse`, `LoginRequest`, `LoginResponse`, `InviteUserRequest`, `DocumentRegistryEntry`, `Trade`, `TradeCreate`, `Document`, `SanctionsScreening`, `SanctionsScreeningTrigger`, `BankReviewFinding`, `BankReviewFindingCreate`, plus the enum union types) — consumed by every later task.

- [ ] **Step 1: Write `web/src/api/types.ts`**

```typescript
export type OrgType = 'EXPORTER' | 'BUYER' | 'BANK';
export type KybStatus = 'PENDING' | 'CLEAR' | 'REVIEW' | 'BLOCK';
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER';
export type UserStatus = 'ACTIVE' | 'INVITED';
export type KybCheckType = 'BUSINESS_REGISTRATION' | 'SANCTIONS_SCREENING' | 'BANK_ACCOUNT';
export type KybCheckStatus = 'PASSED' | 'PENDING' | 'FAILED';
export type TradeStatus = 'DRAFT' | 'DOCS_UNDER_REVIEW' | 'COMPLIANCE_CLEAR' | 'BANK_REVIEW' | 'ACCEPTED' | 'CLOSED';
export type DocumentVerificationStatus = 'UPLOADED' | 'PENDING' | 'VERIFIED';
export type SanctionsStatus = 'CLEAR' | 'REVIEW' | 'BLOCK';
export type BankReviewResult = 'MATCHES_LC' | 'DISCREPANCY';

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
  check_type: KybCheckType;
  status: KybCheckStatus;
  detail: string | null;
  checked_at: string;
}

export interface User {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface SignupRequest {
  organization: {
    name: string;
    org_type: OrgType;
    country: string;
    industry: string;
    tax_id: string;
  };
  admin_user: {
    name: string;
    email: string;
    password: string;
  };
}

export interface SignupResponse {
  organization: Organization;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface InviteUserRequest {
  name: string;
  email: string;
  role: UserRole;
}

export interface DocumentRegistryEntry {
  id: string;
  industry: string;
  instrument_type: string;
  document_type: string;
  category: string;
  mandatory: boolean;
  lc_required: boolean;
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
  status: TradeStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeCreate {
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
}

export interface Document {
  id: string;
  trade_id: string;
  category: string;
  document_type: string;
  uploaded_by: string;
  submitted_to: string;
  off_chain_storage_ref: string;
  on_chain_hash: string;
  verification_status: DocumentVerificationStatus;
  created_at: string;
}

export interface SanctionsScreeningTrigger {
  party_screened: string;
}

export interface SanctionsScreening {
  id: string;
  trade_id: string;
  party_screened: string;
  status: SanctionsStatus;
  raw_response: Record<string, unknown>;
  checked_at: string;
}

export interface BankReviewFindingCreate {
  document_id: string;
  result: BankReviewResult;
  note: string | null;
}

export interface BankReviewFinding {
  id: string;
  trade_id: string;
  document_id: string;
  result: BankReviewResult;
  note: string | null;
  reviewed_by: string;
  reviewed_at: string;
}
```

- [ ] **Step 2: Write the failing test `web/src/api/client.test.ts`**

```typescript
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

    await apiFetch('/trades', { method: 'POST', body: { lc_reference: 'LC-1' } });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ lc_reference: 'LC-1' }));
  });

  it('throws ApiError with the response status on a non-2xx response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('not found', { status: 404 }),
    );

    await expect(apiFetch('/trades/unknown')).rejects.toMatchObject({ status: 404 });
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

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `./client` doesn't exist yet.

- [ ] **Step 4: Write `web/src/api/client.ts`**

```typescript
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "Add API client and shared types"
```

---

### Task 3: AuthStore and auth API module

**Files:**
- Create: `web/src/api/auth.ts`, `web/src/stores/AuthStore.ts`, `web/src/stores/AuthContext.tsx`
- Test: `web/src/api/auth.test.ts`, `web/src/stores/AuthStore.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `setAuthToken`, `setUnauthorizedHandler` (Task 2), `SignupRequest`/`SignupResponse`/`LoginRequest`/`LoginResponse`/`User` (Task 2)
- Produces: `signup(payload: SignupRequest): Promise<SignupResponse>`, `login(payload: LoginRequest): Promise<LoginResponse>`, `getMe(): Promise<User>` (`api/auth.ts`); `AuthStore` class with `token`, `user`, `isHydrating` observables, `hydrate()`, `setSession(token, user)`, `logout()`, `get isAuthenticated()` (`stores/AuthStore.ts`); `AuthContext`/`AuthProvider`/`useAuthStore()` (`stores/AuthContext.tsx`) — consumed by every page from Task 4 onward.

- [ ] **Step 1: Write the failing test `web/src/api/auth.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMe, login, signup } from './auth';

describe('auth API module', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signup posts to /auth/signup and returns the parsed response', async () => {
    const responseBody = {
      organization: { id: '1', name: 'Org', org_type: 'EXPORTER', country: 'IN', industry: 'Pharma', tax_id: 'TAX', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'User', email: 'user@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 201 }));

    const result = await signup({
      organization: { name: 'Org', org_type: 'EXPORTER', country: 'IN', industry: 'Pharma', tax_id: 'TAX' },
      admin_user: { name: 'User', email: 'user@example.com', password: 'secret' },
    });

    expect(result).toEqual(responseBody);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/signup');
    expect(init.method).toBe('POST');
  });

  it('login posts to /auth/login and returns the token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer' }), { status: 200 }),
    );

    const result = await login({ email: 'user@example.com', password: 'secret' });

    expect(result.access_token).toBe('tok');
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(init.method).toBe('POST');
  });

  it('getMe fetches /auth/me', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' }), { status: 200 }),
    );

    const result = await getMe();

    expect(result.email).toBe('a@example.com');
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/me');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.test.ts`
Expected: FAIL — `./auth` doesn't exist yet.

- [ ] **Step 3: Write `web/src/api/auth.ts`**

```typescript
import { apiFetch } from './client';
import type { LoginRequest, LoginResponse, SignupRequest, SignupResponse, User } from './types';

export function signup(payload: SignupRequest): Promise<SignupResponse> {
  return apiFetch<SignupResponse>('/auth/signup', { method: 'POST', body: payload });
}

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test `web/src/stores/AuthStore.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import type { User } from '../api/types';
import { AuthStore } from './AuthStore';

const testUser: User = { id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' };

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no token and no user when localStorage is empty', () => {
    const store = new AuthStore();
    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('setSession stores the token in localStorage and marks authenticated', () => {
    const store = new AuthStore();
    store.setSession('tok-123', testUser);

    expect(store.token).toBe('tok-123');
    expect(store.user).toEqual(testUser);
    expect(store.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe('tok-123');
  });

  it('logout clears the token, user, and localStorage', () => {
    const store = new AuthStore();
    store.setSession('tok-123', testUser);

    store.logout();

    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('hydrate resolves isHydrating to false immediately when there is no stored token', async () => {
    const store = new AuthStore();
    await store.hydrate();
    expect(store.isHydrating).toBe(false);
  });

  it('hydrate loads the current user via getMe when a token is stored', async () => {
    localStorage.setItem('token', 'stored-token');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(testUser);

    const store = new AuthStore();
    await store.hydrate();

    expect(store.user).toEqual(testUser);
    expect(store.isHydrating).toBe(false);
  });

  it('hydrate logs out if getMe fails (e.g. expired token)', async () => {
    localStorage.setItem('token', 'stale-token');
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new Error('401'));

    const store = new AuthStore();
    await store.hydrate();

    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isHydrating).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- AuthStore.test.ts`
Expected: FAIL — `./AuthStore` doesn't exist yet.

- [ ] **Step 7: Write `web/src/stores/AuthStore.ts`**

```typescript
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

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- AuthStore.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Write `web/src/stores/AuthContext.tsx`** (no test — this is a thin React context wrapper; its behavior is exercised indirectly by every page test from Task 4 onward)

`AuthProvider` must call `store.hydrate()` once on mount — without this, `isHydrating` (which starts `true`) would never flip to `false` in the real running app, and `ProtectedRoute` (Task 4) would show its loading state forever on every page load. Test suites construct `AuthStore` directly and set `isHydrating`/session state manually, so they never exercise this effect, which is exactly why it's easy to omit — call it out explicitly here so it isn't missed:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AuthStore } from './AuthStore';

const AuthContext = createContext<AuthStore | null>(null);

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

- [ ] **Step 10: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: all tests from Tasks 1-3 PASS.

- [ ] **Step 11: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts src/stores/AuthStore.ts src/stores/AuthStore.test.ts src/stores/AuthContext.tsx
git commit -m "Add AuthStore and auth API module"
```

---

### Task 4: Routing skeleton, AppShell layout, and ProtectedRoute

**Files:**
- Create: `web/src/components/ProtectedRoute.tsx`, `web/src/components/AppShell.tsx`
- Test: `web/src/components/ProtectedRoute.test.tsx`, `web/src/components/AppShell.test.tsx`
- Modify: `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/main.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `AuthProvider` (Task 3)
- Produces: `<ProtectedRoute>` (redirects to `/login` if not authenticated, shows a loading state while `isHydrating`), `<AppShell>` (topnav + role-aware sidebar wrapper, renders `<Outlet />` for the active page) — every page from Task 5 onward renders inside `AppShell` via `ProtectedRoute`.

- [ ] **Step 1: Write the failing test `web/src/components/ProtectedRoute.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

function renderWithAuth(store: AuthStore, initialPath = '/dashboard') {
  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading state while the auth store is hydrating', () => {
    const store = new AuthStore();
    store.isHydrating = true;
    renderWithAuth(store);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    const store = new AuthStore();
    store.isHydrating = false;
    renderWithAuth(store);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders the nested route when authenticated', () => {
    const store = new AuthStore();
    store.isHydrating = false;
    store.setSession('tok', { id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' });
    renderWithAuth(store);
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ProtectedRoute.test.tsx`
Expected: FAIL — `./ProtectedRoute` and the exported `AuthContext` don't exist yet.

- [ ] **Step 3: Export `AuthContext` from `web/src/stores/AuthContext.tsx`**

Change `const AuthContext = createContext<AuthStore | null>(null);` to `export const AuthContext = createContext<AuthStore | null>(null);` — this is the only change to this file; everything else stays as Task 3 left it.

- [ ] **Step 4: Write `web/src/components/ProtectedRoute.tsx`**

```typescript
import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const ProtectedRoute = observer(function ProtectedRoute() {
  const auth = useAuthStore();

  if (auth.isHydrating) {
    return <div className="p-6 text-ink-soft">Loading…</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ProtectedRoute.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test `web/src/components/AppShell.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { AppShell } from './AppShell';

function renderShell(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: '1', org_id: '2', name: 'Priya Shah', email: 'priya@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AppShell', () => {
  it('shows the Compliance nav item for a bank reviewer', () => {
    renderShell('BANK_REVIEWER');
    expect(screen.getByText('Compliance')).toBeInTheDocument();
  });

  it('hides the Compliance nav item for an exporter admin', () => {
    renderShell('EXPORTER_ADMIN');
    expect(screen.queryByText('Compliance')).not.toBeInTheDocument();
  });

  it('shows the signed-in user name', () => {
    renderShell('VIEWER');
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- AppShell.test.tsx`
Expected: FAIL — `./AppShell` doesn't exist yet.

- [ ] **Step 8: Write `web/src/components/AppShell.tsx`**

```typescript
import { observer } from 'mobx-react-lite';
import { Link, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const AppShell = observer(function AppShell() {
  const auth = useAuthStore();
  const user = auth.user!;
  const isBankReviewer = user.role === 'BANK_REVIEWER';
  const isExporter = ['EXPORTER_ADMIN', 'DOCS_COMPLIANCE', 'FINANCE', 'VIEWER'].includes(user.role);

  return (
    <div>
      <div className="h-[60px] bg-ink flex items-center px-6 gap-5 text-paper-2">
        <Link to="/dashboard" className="font-serif text-lg">
          Trade Ledger
        </Link>
      </div>
      <div className="flex">
        <div className="w-[222px] shrink-0 bg-paper-2 border-r border-line-soft min-h-screen p-4">
          <nav className="flex flex-col gap-1">
            <Link to="/dashboard" className="px-2 py-2 rounded hover:bg-line-soft">
              Dashboard
            </Link>
            <Link to="/transactions" className="px-2 py-2 rounded hover:bg-line-soft">
              Transactions
            </Link>
            {isExporter && (
              <Link to="/transactions/new" className="px-2 py-2 rounded hover:bg-line-soft">
                New transaction
              </Link>
            )}
            {isBankReviewer && (
              <Link to="/compliance" className="px-2 py-2 rounded hover:bg-line-soft">
                Compliance
              </Link>
            )}
            <Link to="/team" className="px-2 py-2 rounded hover:bg-line-soft">
              Team
            </Link>
          </nav>
          <div className="mt-8 pt-4 border-t border-line-soft flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-ink-soft">{user.role}</div>
            </div>
            <button onClick={() => auth.logout()} className="text-xs text-ink-soft hover:text-block">
              Log out
            </button>
          </div>
        </div>
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- AppShell.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 10: Replace `web/src/App.tsx`**

```typescript
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard placeholder</div>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 11: Replace `web/src/App.test.tsx`** (the Task 1 smoke test's exact assertion no longer applies now that `App` requires routing/auth context; replace it with a test that fits the new shape)

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('redirects an unauthenticated user to the login page (unmatched here, so falls through to ProtectedRoute\'s redirect target once routed)', () => {
    render(<App />);
    // With no token in localStorage, ProtectedRoute redirects toward /login;
    // /login isn't defined until Task 5, so at this point the router has no
    // matching route and renders nothing crash-free — this test only proves
    // App mounts without throwing given the real AuthProvider/BrowserRouter tree.
    expect(document.getElementById('root') ?? document.body).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: all tests PASS (App.test.tsx's single test now checks a weaker but still-meaningful property, since `App` now requires a browser router and real auth context to render at all).

- [ ] **Step 13: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/components/ProtectedRoute.test.tsx src/components/AppShell.tsx src/components/AppShell.test.tsx src/App.tsx src/App.test.tsx src/stores/AuthContext.tsx
git commit -m "Add routing skeleton, AppShell layout, and ProtectedRoute"
```

---

### Task 5: Login and Signup pages

**Files:**
- Create: `web/src/pages/LoginPage.tsx`, `web/src/pages/SignupPage.tsx`
- Test: `web/src/pages/LoginPage.test.tsx`, `web/src/pages/SignupPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `login`, `signup` (Task 3's `api/auth.ts`), `useAuthStore` (Task 3)
- Produces: `/login` and `/signup` routes — the first real user-facing flows.

- [ ] **Step 1: Write the failing test `web/src/pages/LoginPage.test.tsx`**

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LoginPage.test.tsx`
Expected: FAIL — `./LoginPage` doesn't exist yet.

- [ ] **Step 3: Write `web/src/pages/LoginPage.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { getMe, login } from '../api/auth';
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
    try {
      const { access_token } = await login({ email, password });
      auth.setSession(access_token, await getMe());
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
      <div className="w-full max-w-sm bg-paper-2 border border-line rounded-xl p-8">
        <h2 className="font-serif text-xl text-center mb-4">Sign in</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink-soft mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink-soft mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          {error && <p className="text-block text-sm">{error}</p>}
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LoginPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test `web/src/pages/SignupPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { SignupPage } from './SignupPage';

describe('SignupPage', () => {
  it('submits the account step and shows the immediate KYB verify result', async () => {
    vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'MedCure Pharma Exports', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
    });

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.type(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- SignupPage.test.tsx`
Expected: FAIL — `./SignupPage` doesn't exist yet.

- [ ] **Step 7: Write `web/src/pages/SignupPage.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType, SignupResponse } from '../api/types';

export function SignupPage() {
  const [step, setStep] = useState<'account' | 'verify'>('account');
  const [form, setForm] = useState({
    orgName: '',
    orgType: 'EXPORTER' as OrgType,
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
      setError('Could not create your organization. Please check your details and try again.');
    }
  }

  if (step === 'verify' && result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
        <div className="w-full max-w-md bg-paper-2 border border-line rounded-xl p-8 text-center">
          <h2 className="font-serif text-xl mb-2">Organization verified</h2>
          <p className="text-ink-soft mb-4">
            {result.organization.name} — KYB status: <strong>{result.organization.kyb_status}</strong>
          </p>
          <Link to="/login" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
      <div className="w-full max-w-lg bg-paper-2 border border-line rounded-xl p-8">
        <h2 className="font-serif text-xl mb-4">Create your organization account</h2>
        <form onSubmit={handleAccountSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold text-ink-soft mb-1">
              Organization name
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="orgType" className="block text-xs font-semibold text-ink-soft mb-1">
              Organization type
            </label>
            <select
              id="orgType"
              value={form.orgType}
              onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}
              className="w-full px-3 py-2 border border-line rounded"
            >
              <option value="EXPORTER">Exporter</option>
              <option value="BUYER">Buyer / Importer</option>
              <option value="BANK">Bank</option>
            </select>
          </div>
          <div>
            <label htmlFor="country" className="block text-xs font-semibold text-ink-soft mb-1">
              Country
            </label>
            <input
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="industry" className="block text-xs font-semibold text-ink-soft mb-1">
              Industry
            </label>
            <input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold text-ink-soft mb-1">
              Tax / business ID
            </label>
            <input
              id="taxId"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="adminName" className="block text-xs font-semibold text-ink-soft mb-1">
              Admin name
            </label>
            <input
              id="adminName"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-semibold text-ink-soft mb-1">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink-soft mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-ink text-paper-2 rounded py-2 font-semibold">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- SignupPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Wire both routes into `web/src/App.tsx`**

Add these imports: `import { LoginPage } from './pages/LoginPage';` and `import { SignupPage } from './pages/SignupPage';`. Add these two routes as siblings of the root `/` route, outside the `ProtectedRoute` element (before it in the `<Routes>` block):

```typescript
<Route path="/login" element={<LoginPage />} />
<Route path="/signup" element={<SignupPage />} />
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-5 PASS.

- [ ] **Step 11: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx src/pages/SignupPage.tsx src/pages/SignupPage.test.tsx src/App.tsx
git commit -m "Add Login and Signup pages"
```

---

### Task 6: Dashboard and Transactions list pages

**Files:**
- Create: `web/src/api/trades.ts`, `web/src/pages/DashboardPage.tsx`, `web/src/pages/TransactionsPage.tsx`
- Test: `web/src/pages/DashboardPage.test.tsx`, `web/src/pages/TransactionsPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `Trade`/`TradeCreate` (Task 2)
- Produces: `listTrades(): Promise<Trade[]>`, `getTrade(id: string): Promise<Trade>`, `createTrade(payload: TradeCreate): Promise<Trade>` (`api/trades.ts`) — consumed by every trade-related page from here on. `/dashboard` and `/transactions` routes.

- [ ] **Step 1: Write `web/src/api/trades.ts`**

```typescript
import { apiFetch } from './client';
import type { Trade, TradeCreate } from './types';

export function listTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/trades');
}

export function getTrade(id: string): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${id}`);
}

export function createTrade(payload: TradeCreate): Promise<Trade> {
  return apiFetch<Trade>('/trades', { method: 'POST', body: payload });
}
```

No dedicated test file for this module — like every other thin CRUD wrapper added in later tasks (`documents.ts`, `sanctionsScreening.ts`, `bankReview.ts`, `organizations.ts`, `users.ts`), its functions are exercised indirectly through the page tests that mock them, not with their own unit test file. This is a deliberate, consistent choice: only the foundational modules with real logic (`client.ts`'s header/error handling, `auth.ts`'s session-critical calls) get dedicated tests from Tasks 2-3.

- [ ] **Step 2: Write the failing test `web/src/pages/TransactionsPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { TransactionsPage } from './TransactionsPage';

const sampleTrade: Trade = {
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
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('TransactionsPage', () => {
  it('renders the list of trades returned by the API', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([sampleTrade]);

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
  });

  it('shows an empty state when there are no trades', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no transactions/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- TransactionsPage.test.tsx`
Expected: FAIL — `./TransactionsPage` doesn't exist yet.

- [ ] **Step 4: Write `web/src/pages/TransactionsPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';

export function TransactionsPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    listTrades().then(setTrades);
  }, []);

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Transactions</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No transactions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">LC / Ref</th>
              <th className="py-2">Industry</th>
              <th className="py-2">Value</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className="border-b border-line-soft">
                <td className="py-2">
                  <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                    {trade.lc_reference}
                  </Link>
                </td>
                <td className="py-2">{trade.industry}</td>
                <td className="py-2">
                  {trade.currency} {trade.order_value.toLocaleString()}
                </td>
                <td className="py-2">{trade.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TransactionsPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test `web/src/pages/DashboardPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { DashboardPage } from './DashboardPage';

const sampleTrade: Trade = {
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
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderWithRole(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: '1', org_id: '2', name: 'Priya Shah', email: 'p@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('DashboardPage', () => {
  it('greets the signed-in user by first name', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([sampleTrade]);
    renderWithRole('EXPORTER_ADMIN');
    expect(await screen.findByText(/welcome back, priya/i)).toBeInTheDocument();
  });

  it('shows the New transaction action for an exporter role', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([]);
    renderWithRole('EXPORTER_ADMIN');
    expect(await screen.findByRole('link', { name: /new transaction/i })).toBeInTheDocument();
  });

  it('hides the New transaction action for a bank reviewer', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([]);
    renderWithRole('BANK_REVIEWER');
    await screen.findByText(/welcome back/i);
    expect(screen.queryByRole('link', { name: /new transaction/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- DashboardPage.test.tsx`
Expected: FAIL — `./DashboardPage` doesn't exist yet.

- [ ] **Step 8: Write `web/src/pages/DashboardPage.tsx`**

```typescript
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { useAuthStore } from '../stores/AuthContext';

export const DashboardPage = observer(function DashboardPage() {
  const auth = useAuthStore();
  const user = auth.user!;
  const isExporter = ['EXPORTER_ADMIN', 'DOCS_COMPLIANCE', 'FINANCE', 'VIEWER'].includes(user.role);
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    listTrades().then(setTrades);
  }, []);

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Welcome back, {firstName}</h1>
        {isExporter && (
          <Link to="/transactions/new" className="bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
            + New transaction
          </Link>
        )}
      </div>
      {trades === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="text-ink-soft">No active transactions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((trade) => (
            <li key={trade.id} className="border border-line rounded p-3">
              <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                {trade.lc_reference}
              </Link>{' '}
              — {trade.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- DashboardPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 10: Wire both routes into `web/src/App.tsx`**

Add imports `import { DashboardPage } from './pages/DashboardPage';` and `import { TransactionsPage } from './pages/TransactionsPage';`. Replace the placeholder `<Route path="/dashboard" element={<div>Dashboard placeholder</div>} />` with `<Route path="/dashboard" element={<DashboardPage />} />`, and add `<Route path="/transactions" element={<TransactionsPage />} />` as a sibling inside the same nested `AppShell` route.

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-6 PASS.

- [ ] **Step 12: Commit**

```bash
git add src/api/trades.ts src/pages/DashboardPage.tsx src/pages/DashboardPage.test.tsx src/pages/TransactionsPage.tsx src/pages/TransactionsPage.test.tsx src/App.tsx
git commit -m "Add Dashboard and Transactions list pages"
```

---

### Task 7: New Transaction page

**Files:**
- Create: `web/src/api/documentRegistry.ts`, `web/src/pages/NewTransactionPage.tsx`
- Test: `web/src/pages/NewTransactionPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `DocumentRegistryEntry` (Task 2), `createTrade` (Task 6)
- Produces: `listDocumentRegistry(industry: string, instrumentType: string): Promise<DocumentRegistryEntry[]>` (`api/documentRegistry.ts`) — consumed here and by Task 8's Documents tab. `/transactions/new` route.

- [ ] **Step 1: Write `web/src/api/documentRegistry.ts`**

```typescript
import { apiFetch } from './client';
import type { DocumentRegistryEntry } from './types';

export function listDocumentRegistry(industry: string, instrumentType: string): Promise<DocumentRegistryEntry[]> {
  const params = new URLSearchParams({ industry, instrument_type: instrumentType });
  return apiFetch<DocumentRegistryEntry[]>(`/document-registry?${params.toString()}`);
}
```

- [ ] **Step 2: Write the failing test `web/src/pages/NewTransactionPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { NewTransactionPage } from './NewTransactionPage';

describe('NewTransactionPage', () => {
  it('submits the form and creates a trade', async () => {
    const created: Trade = {
      id: 't-new',
      lc_reference: 'LC-NEW-1',
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
      status: 'DRAFT',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const createTradeSpy = vi.spyOn(tradesApi, 'createTrade').mockResolvedValue(created);

    render(
      <MemoryRouter>
        <NewTransactionPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/lc reference/i), 'LC-NEW-1');
    await userEvent.type(screen.getByLabelText(/^industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/instrument type/i), 'Letter of Credit');
    await userEvent.type(screen.getByLabelText(/exporter org id/i), 'o-1');
    await userEvent.type(screen.getByLabelText(/buyer org id/i), 'o-2');
    await userEvent.type(screen.getByLabelText(/issuing bank org id/i), 'o-3');
    await userEvent.type(screen.getByLabelText(/advising bank org id/i), 'o-4');
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/currency/i), 'USD');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(createTradeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lc_reference: 'LC-NEW-1', order_value: 80000 }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- NewTransactionPage.test.tsx`
Expected: FAIL — `./NewTransactionPage` doesn't exist yet.

- [ ] **Step 4: Write `web/src/pages/NewTransactionPage.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createTrade } from '../api/trades';
import type { TradeCreate } from '../api/types';

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
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 max-w-2xl">
        {fieldLabels.map(({ key, label, type }) => (
          <div key={key}>
            <label htmlFor={key} className="block text-xs font-semibold text-ink-soft mb-1">
              {label}
            </label>
            <input
              id={key}
              type={type ?? 'text'}
              value={form[key] as string | number}
              onChange={(e) => updateField(key, e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
        ))}
        {error && <p className="col-span-2 text-block text-sm">{error}</p>}
        <button type="submit" className="col-span-2 bg-ink text-paper-2 rounded py-2 font-semibold">
          Create transaction
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- NewTransactionPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Wire the route into `web/src/App.tsx`**

Add `import { NewTransactionPage } from './pages/NewTransactionPage';` and `<Route path="/transactions/new" element={<NewTransactionPage />} />` as a sibling of `/transactions` inside the `AppShell` route.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-7 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/documentRegistry.ts src/pages/NewTransactionPage.tsx src/pages/NewTransactionPage.test.tsx src/App.tsx
git commit -m "Add New Transaction page"
```

---

### Task 8: Transaction Overview and Documents tabs

**Files:**
- Create: `web/src/api/documents.ts`, `web/src/pages/TransactionOverviewPage.tsx`, `web/src/pages/TransactionDocumentsPage.tsx`
- Test: `web/src/pages/TransactionOverviewPage.test.tsx`, `web/src/pages/TransactionDocumentsPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `Document` (Task 2), `getTrade` (Task 6), `listDocumentRegistry` (Task 7)
- Produces: `listDocuments(tradeId: string): Promise<Document[]>`, `uploadDocument(tradeId: string, category: string, documentType: string, file: File): Promise<Document>` (`api/documents.ts`) — consumed here and by Task 9's Bank Review tab (to reference uploaded documents). `/transactions/:id/overview` and `/transactions/:id/documents` routes.

- [ ] **Step 1: Write `web/src/api/documents.ts`**

```typescript
import { apiFetch } from './client';
import type { Document } from './types';

export function listDocuments(tradeId: string): Promise<Document[]> {
  return apiFetch<Document[]>(`/trades/${tradeId}/documents`);
}

export function uploadDocument(
  tradeId: string,
  category: string,
  documentType: string,
  file: File,
): Promise<Document> {
  const formData = new FormData();
  formData.append('category', category);
  formData.append('document_type', documentType);
  formData.append('file', file);
  return apiFetch<Document>(`/trades/${tradeId}/documents`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
}
```

- [ ] **Step 2: Write the failing test `web/src/pages/TransactionOverviewPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { TransactionOverviewPage } from './TransactionOverviewPage';

const sampleTrade: Trade = {
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
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('TransactionOverviewPage', () => {
  it('renders the trade terms fetched by ID from the route', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/overview']}>
        <Routes>
          <Route path="/transactions/:tradeId/overview" element={<TransactionOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('CIF Osaka')).toBeInTheDocument();
    expect(tradesApi.getTrade).toHaveBeenCalledWith('t-1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- TransactionOverviewPage.test.tsx`
Expected: FAIL — `./TransactionOverviewPage` doesn't exist yet.

- [ ] **Step 4: Write `web/src/pages/TransactionOverviewPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getTrade } from '../api/trades';
import type { Trade } from '../api/types';

export function TransactionOverviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);

  useEffect(() => {
    if (tradeId) {
      getTrade(tradeId).then(setTrade);
    }
  }, [tradeId]);

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">
        {trade.industry} · {trade.currency} {trade.order_value.toLocaleString()}
      </p>
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-line rounded-lg p-5">
          <h3 className="font-serif text-lg mb-3">Terms</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Incoterm</dt>
              <dd>{trade.incoterm}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Payment term</dt>
              <dd>{trade.payment_term}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Order value</dt>
              <dd>
                {trade.currency} {trade.order_value.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Status</dt>
              <dd>{trade.status}</dd>
            </div>
          </dl>
        </div>
        <div className="border border-line rounded-lg p-5">
          <h3 className="font-serif text-lg mb-3">Product</h3>
          <p className="text-sm">{trade.product_description}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TransactionOverviewPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Write the failing test `web/src/pages/TransactionDocumentsPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as documentRegistryApi from '../api/documentRegistry';
import * as documentsApi from '../api/documents';
import * as tradesApi from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';
import { TransactionDocumentsPage } from './TransactionDocumentsPage';

const sampleTrade: Trade = {
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
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const registryEntry: DocumentRegistryEntry = {
  id: 'r-1',
  industry: 'Pharmaceuticals',
  instrument_type: 'Letter of Credit',
  document_type: 'Certificate of Analysis (CoA)',
  category: 'Regulatory / Compliance',
  mandatory: true,
  lc_required: true,
};

const uploadedDoc: Document = {
  id: 'd-1',
  trade_id: 't-1',
  category: 'Regulatory / Compliance',
  document_type: 'Certificate of Analysis (CoA)',
  uploaded_by: 'u-1',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'UPLOADED',
  created_at: '2026-01-01T00:00:00Z',
};

describe('TransactionDocumentsPage', () => {
  it('shows registry document types marked as uploaded when already present', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([uploadedDoc]);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/documents']}>
        <Routes>
          <Route path="/transactions/:tradeId/documents" element={<TransactionDocumentsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Certificate of Analysis (CoA)')).toBeInTheDocument();
    expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
  });

  it('shows an upload control for registry document types not yet uploaded', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/documents']}>
        <Routes>
          <Route path="/transactions/:tradeId/documents" element={<TransactionDocumentsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/upload certificate of analysis/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- TransactionDocumentsPage.test.tsx`
Expected: FAIL — `./TransactionDocumentsPage` doesn't exist yet.

- [ ] **Step 8: Write `web/src/pages/TransactionDocumentsPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { listDocumentRegistry } from '../api/documentRegistry';
import { listDocuments, uploadDocument } from '../api/documents';
import { getTrade } from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';

export function TransactionDocumentsPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [registry, setRegistry] = useState<DocumentRegistryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  async function refreshDocuments() {
    if (tradeId) {
      setDocuments(await listDocuments(tradeId));
    }
  }

  useEffect(() => {
    if (!tradeId) return;
    getTrade(tradeId).then((fetchedTrade) => {
      setTrade(fetchedTrade);
      listDocumentRegistry(fetchedTrade.industry, fetchedTrade.instrument_type).then(setRegistry);
    });
    refreshDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function handleUpload(entry: DocumentRegistryEntry, file: File) {
    if (!tradeId) return;
    await uploadDocument(tradeId, entry.category, entry.document_type, file);
    await refreshDocuments();
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">Document checklist for {trade.industry}</p>
      <div className="border border-line rounded-lg divide-y divide-line-soft">
        {registry.map((entry) => {
          const uploaded = documents.find((doc) => doc.document_type === entry.document_type);
          return (
            <div key={entry.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{entry.document_type}</div>
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
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- TransactionDocumentsPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 10: Wire both routes into `web/src/App.tsx`**

Add imports `import { TransactionOverviewPage } from './pages/TransactionOverviewPage';` and `import { TransactionDocumentsPage } from './pages/TransactionDocumentsPage';`, then add both as siblings inside the `AppShell` route:

```typescript
<Route path="/transactions/:tradeId/overview" element={<TransactionOverviewPage />} />
<Route path="/transactions/:tradeId/documents" element={<TransactionDocumentsPage />} />
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-8 PASS.

- [ ] **Step 12: Commit**

```bash
git add src/api/documents.ts src/pages/TransactionOverviewPage.tsx src/pages/TransactionOverviewPage.test.tsx src/pages/TransactionDocumentsPage.tsx src/pages/TransactionDocumentsPage.test.tsx src/App.tsx
git commit -m "Add Transaction Overview and Documents tabs"
```

---

### Task 9: Transaction Compliance and Bank Review tabs

**Files:**
- Create: `web/src/api/sanctionsScreening.ts`, `web/src/api/bankReview.ts`, `web/src/pages/TransactionCompliancePage.tsx`, `web/src/pages/TransactionBankReviewPage.tsx`
- Test: `web/src/pages/TransactionCompliancePage.test.tsx`, `web/src/pages/TransactionBankReviewPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `SanctionsScreening`/`SanctionsScreeningTrigger`/`BankReviewFinding`/`BankReviewFindingCreate` (Task 2), `listDocuments` (Task 8), `useAuthStore` (Task 3)
- Produces: `listSanctionsScreenings(tradeId: string): Promise<SanctionsScreening[]>`, `triggerSanctionsScreening(tradeId: string, payload: SanctionsScreeningTrigger): Promise<SanctionsScreening>` (`api/sanctionsScreening.ts`); `listBankReviewFindings(tradeId: string): Promise<BankReviewFinding[]>`, `createBankReviewFinding(tradeId: string, payload: BankReviewFindingCreate): Promise<BankReviewFinding>` (`api/bankReview.ts`). `/transactions/:id/compliance` and `/transactions/:id/bank-review` routes.

- [ ] **Step 1: Write `web/src/api/sanctionsScreening.ts`**

```typescript
import { apiFetch } from './client';
import type { SanctionsScreening, SanctionsScreeningTrigger } from './types';

export function listSanctionsScreenings(tradeId: string): Promise<SanctionsScreening[]> {
  return apiFetch<SanctionsScreening[]>(`/trades/${tradeId}/sanctions-screening`);
}

export function triggerSanctionsScreening(
  tradeId: string,
  payload: SanctionsScreeningTrigger,
): Promise<SanctionsScreening> {
  return apiFetch<SanctionsScreening>(`/trades/${tradeId}/sanctions-screening`, {
    method: 'POST',
    body: payload,
  });
}
```

- [ ] **Step 2: Write `web/src/api/bankReview.ts`**

```typescript
import { apiFetch } from './client';
import type { BankReviewFinding, BankReviewFindingCreate } from './types';

export function listBankReviewFindings(tradeId: string): Promise<BankReviewFinding[]> {
  return apiFetch<BankReviewFinding[]>(`/trades/${tradeId}/bank-review`);
}

export function createBankReviewFinding(
  tradeId: string,
  payload: BankReviewFindingCreate,
): Promise<BankReviewFinding> {
  return apiFetch<BankReviewFinding>(`/trades/${tradeId}/bank-review`, {
    method: 'POST',
    body: payload,
  });
}
```

- [ ] **Step 3: Write the failing test `web/src/pages/TransactionCompliancePage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as sanctionsApi from '../api/sanctionsScreening';
import type { SanctionsScreening } from '../api/types';
import { TransactionCompliancePage } from './TransactionCompliancePage';

const screening: SanctionsScreening = {
  id: 's-1',
  trade_id: 't-1',
  party_screened: 'Osaka Pharma Distribution K.K.',
  status: 'CLEAR',
  raw_response: {},
  checked_at: '2026-01-01T00:00:00Z',
};

describe('TransactionCompliancePage', () => {
  it('lists past sanctions screenings for the trade', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockResolvedValue([screening]);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/compliance']}>
        <Routes>
          <Route path="/transactions/:tradeId/compliance" element={<TransactionCompliancePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Osaka Pharma Distribution K.K.')).toBeInTheDocument();
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
  });

  it('triggers a new screening from the form', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockResolvedValue([]);
    const triggerSpy = vi.spyOn(sanctionsApi, 'triggerSanctionsScreening').mockResolvedValue(screening);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/compliance']}>
        <Routes>
          <Route path="/transactions/:tradeId/compliance" element={<TransactionCompliancePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/no screenings yet/i);
    await userEvent.type(screen.getByLabelText(/party to screen/i), 'Osaka Pharma Distribution K.K.');
    await userEvent.click(screen.getByRole('button', { name: /run screening/i }));

    expect(triggerSpy).toHaveBeenCalledWith('t-1', { party_screened: 'Osaka Pharma Distribution K.K.' });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- TransactionCompliancePage.test.tsx`
Expected: FAIL — `./TransactionCompliancePage` doesn't exist yet.

- [ ] **Step 5: Write `web/src/pages/TransactionCompliancePage.tsx`**

```typescript
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { listSanctionsScreenings, triggerSanctionsScreening } from '../api/sanctionsScreening';
import type { SanctionsScreening } from '../api/types';

export function TransactionCompliancePage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [screenings, setScreenings] = useState<SanctionsScreening[] | null>(null);
  const [partyScreened, setPartyScreened] = useState('');

  async function refresh() {
    if (tradeId) {
      setScreenings(await listSanctionsScreenings(tradeId));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !partyScreened) return;
    await triggerSanctionsScreening(tradeId, { party_screened: partyScreened });
    setPartyScreened('');
    await refresh();
  }

  if (screenings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Compliance</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6 max-w-md">
        <div className="flex-1">
          <label htmlFor="partyScreened" className="block text-xs font-semibold text-ink-soft mb-1">
            Party to screen
          </label>
          <input
            id="partyScreened"
            value={partyScreened}
            onChange={(e) => setPartyScreened(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded"
            required
          />
        </div>
        <button type="submit" className="self-end bg-ink text-paper-2 rounded px-4 py-2 font-semibold h-fit">
          Run screening
        </button>
      </form>
      {screenings.length === 0 ? (
        <p className="text-ink-soft">No screenings yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">Party</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {screenings.map((screening) => (
              <tr key={screening.id} className="border-b border-line-soft">
                <td className="py-2">{screening.party_screened}</td>
                <td className="py-2">{screening.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- TransactionCompliancePage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Write the failing test `web/src/pages/TransactionBankReviewPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as bankReviewApi from '../api/bankReview';
import * as documentsApi from '../api/documents';
import type { BankReviewFinding, Document } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { TransactionBankReviewPage } from './TransactionBankReviewPage';

const finding: BankReviewFinding = {
  id: 'f-1',
  trade_id: 't-1',
  document_id: 'd-1',
  result: 'DISCREPANCY',
  note: 'Tenor mismatch',
  reviewed_by: 'u-1',
  reviewed_at: '2026-01-01T00:00:00Z',
};

const document: Document = {
  id: 'd-1',
  trade_id: 't-1',
  category: 'Banking / LC',
  document_type: 'Bill of Exchange',
  uploaded_by: 'u-2',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'UPLOADED',
  created_at: '2026-01-01T00:00:00Z',
};

function renderWithRole(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Sana Iyer', email: 's@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/transactions/t-1/bank-review']}>
        <Routes>
          <Route path="/transactions/:tradeId/bank-review" element={<TransactionBankReviewPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('TransactionBankReviewPage', () => {
  it('lists existing findings for any role', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([finding]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('EXPORTER_ADMIN');

    expect(await screen.findByText('Tenor mismatch')).toBeInTheDocument();
  });

  it('shows the record-verdict form only for a bank reviewer', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('BANK_REVIEWER');

    expect(await screen.findByRole('button', { name: /record finding/i })).toBeInTheDocument();
  });

  it('hides the record-verdict form for a non-bank-reviewer', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('EXPORTER_ADMIN');

    await screen.findByText(/no findings yet/i);
    expect(screen.queryByRole('button', { name: /record finding/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- TransactionBankReviewPage.test.tsx`
Expected: FAIL — `./TransactionBankReviewPage` doesn't exist yet.

- [ ] **Step 9: Write `web/src/pages/TransactionBankReviewPage.tsx`**

```typescript
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { createBankReviewFinding, listBankReviewFindings } from '../api/bankReview';
import { listDocuments } from '../api/documents';
import type { BankReviewFinding, BankReviewResult, Document } from '../api/types';
import { useAuthStore } from '../stores/AuthContext';

export const TransactionBankReviewPage = observer(function TransactionBankReviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const auth = useAuthStore();
  const isBankReviewer = auth.user?.role === 'BANK_REVIEWER';

  const [findings, setFindings] = useState<BankReviewFinding[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [result, setResult] = useState<BankReviewResult>('MATCHES_LC');
  const [note, setNote] = useState('');

  async function refreshFindings() {
    if (tradeId) {
      setFindings(await listBankReviewFindings(tradeId));
    }
  }

  useEffect(() => {
    if (!tradeId) return;
    refreshFindings();
    listDocuments(tradeId).then(setDocuments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !documentId) return;
    await createBankReviewFinding(tradeId, { document_id: documentId, result, note: note || null });
    setNote('');
    await refreshFindings();
  }

  if (findings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Bank Review</h1>
      {isBankReviewer && (
        <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 mb-6 max-w-lg flex flex-col gap-3">
          <div>
            <label htmlFor="documentId" className="block text-xs font-semibold text-ink-soft mb-1">
              Document
            </label>
            <select
              id="documentId"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
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
            <label htmlFor="result" className="block text-xs font-semibold text-ink-soft mb-1">
              Result
            </label>
            <select
              id="result"
              value={result}
              onChange={(e) => setResult(e.target.value as BankReviewResult)}
              className="w-full px-3 py-2 border border-line rounded"
            >
              <option value="MATCHES_LC">Matches LC</option>
              <option value="DISCREPANCY">Discrepancy</option>
            </select>
          </div>
          <div>
            <label htmlFor="note" className="block text-xs font-semibold text-ink-soft mb-1">
              Note
            </label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
            />
          </div>
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            Record finding
          </button>
        </form>
      )}
      {findings.length === 0 ? (
        <p className="text-ink-soft">No findings yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((finding) => (
            <li key={finding.id} className="border border-line rounded p-3">
              <span className="font-semibold">{finding.result}</span>
              {finding.note && <span> — {finding.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- TransactionBankReviewPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 11: Wire both routes into `web/src/App.tsx`**

Add imports `import { TransactionCompliancePage } from './pages/TransactionCompliancePage';` and `import { TransactionBankReviewPage } from './pages/TransactionBankReviewPage';`, then add both as siblings inside the `AppShell` route:

```typescript
<Route path="/transactions/:tradeId/compliance" element={<TransactionCompliancePage />} />
<Route path="/transactions/:tradeId/bank-review" element={<TransactionBankReviewPage />} />
```

- [ ] **Step 12: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-9 PASS.

- [ ] **Step 13: Commit**

```bash
git add src/api/sanctionsScreening.ts src/api/bankReview.ts src/pages/TransactionCompliancePage.tsx src/pages/TransactionCompliancePage.test.tsx src/pages/TransactionBankReviewPage.tsx src/pages/TransactionBankReviewPage.test.tsx src/App.tsx
git commit -m "Add Transaction Compliance and Bank Review tabs"
```

---

### Task 10: Transaction Timeline tab and Organization profile page

**Files:**
- Create: `web/src/api/organizations.ts`, `web/src/pages/TransactionTimelinePage.tsx`, `web/src/pages/OrganizationProfilePage.tsx`
- Test: `web/src/pages/TransactionTimelinePage.test.tsx`, `web/src/pages/OrganizationProfilePage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `Organization`/`KybCheck` (Task 2)
- Produces: `getOrganization(id: string): Promise<Organization>`, `listOrganizationKybChecks(id: string): Promise<KybCheck[]>` (`api/organizations.ts`). `/transactions/:id/timeline` (static) and `/organizations/:id` routes.

- [ ] **Step 1: Write `web/src/api/organizations.ts`**

```typescript
import { apiFetch } from './client';
import type { KybCheck, Organization } from './types';

export function getOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/organizations/${id}`);
}

export function listOrganizationKybChecks(id: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/organizations/${id}/kyb-checks`);
}
```

- [ ] **Step 2: Write the failing test `web/src/pages/TransactionTimelinePage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionTimelinePage } from './TransactionTimelinePage';

describe('TransactionTimelinePage', () => {
  it('renders all 6 milestone labels as a static, placeholder lifecycle view', () => {
    render(<TransactionTimelinePage />);

    ['LC Issued', 'Regulatory Clear', 'Shipped', 'Docs Accepted', 'Settled', 'Closed'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText(/not yet connected to a blockchain layer/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- TransactionTimelinePage.test.tsx`
Expected: FAIL — `./TransactionTimelinePage` doesn't exist yet.

- [ ] **Step 4: Write `web/src/pages/TransactionTimelinePage.tsx`**

```typescript
const milestones = ['LC Issued', 'Regulatory Clear', 'Shipped', 'Docs Accepted', 'Settled', 'Closed'];

export function TransactionTimelinePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">Timeline</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Placeholder milestone view — not yet connected to a blockchain layer.
      </p>
      <div className="flex justify-between relative">
        <div className="absolute top-[14px] left-0 right-0 h-[2px] bg-line" />
        {milestones.map((label, index) => (
          <div key={label} className="relative z-10 flex flex-col items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-full bg-paper-2 border-2 border-line flex items-center justify-center text-xs font-mono text-ink-soft">
              {index + 1}
            </div>
            <div className="text-xs text-ink-soft text-center max-w-[90px]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TransactionTimelinePage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Write the failing test `web/src/pages/OrganizationProfilePage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { OrganizationProfilePage } from './OrganizationProfilePage';

const org: Organization = {
  id: 'o-1',
  name: 'MedCure Pharma Exports',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Pharmaceuticals',
  tax_id: 'TAX-1',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const kybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
];

describe('OrganizationProfilePage', () => {
  it('renders the organization profile and KYB checks', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    render(
      <MemoryRouter initialEntries={['/organizations/o-1']}>
        <Routes>
          <Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('MedCure Pharma Exports')).toBeInTheDocument();
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- OrganizationProfilePage.test.tsx`
Expected: FAIL — `./OrganizationProfilePage` doesn't exist yet.

- [ ] **Step 8: Write `web/src/pages/OrganizationProfilePage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';

export function OrganizationProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);

  useEffect(() => {
    if (!orgId) return;
    getOrganization(orgId).then(setOrg);
    listOrganizationKybChecks(orgId).then(setKybChecks);
  }, [orgId]);

  if (!org) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{org.name}</h1>
      <p className="text-ink-soft mb-6">
        {org.industry} · {org.country} · KYB status: <strong>{org.kyb_status}</strong>
      </p>
      <div className="border border-line rounded-lg divide-y divide-line-soft">
        {kybChecks.map((check) => (
          <div key={check.id} className="flex items-center justify-between p-4">
            <span>{check.check_type}</span>
            <span className="text-sm font-semibold">{check.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- OrganizationProfilePage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 10: Wire both routes into `web/src/App.tsx`**

Add imports `import { TransactionTimelinePage } from './pages/TransactionTimelinePage';` and `import { OrganizationProfilePage } from './pages/OrganizationProfilePage';`, then add both as siblings inside the `AppShell` route:

```typescript
<Route path="/transactions/:tradeId/timeline" element={<TransactionTimelinePage />} />
<Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-10 PASS.

- [ ] **Step 12: Commit**

```bash
git add src/api/organizations.ts src/pages/TransactionTimelinePage.tsx src/pages/TransactionTimelinePage.test.tsx src/pages/OrganizationProfilePage.tsx src/pages/OrganizationProfilePage.test.tsx src/App.tsx
git commit -m "Add Transaction Timeline tab and Organization profile page"
```

---

### Task 11: Team and Profile pages

**Files:**
- Create: `web/src/api/users.ts`, `web/src/pages/TeamPage.tsx`, `web/src/pages/ProfilePage.tsx`
- Test: `web/src/pages/TeamPage.test.tsx`, `web/src/pages/ProfilePage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 2), `User`/`InviteUserRequest` (Task 2), `useAuthStore` (Task 3)
- Produces: `listUsers(): Promise<User[]>`, `inviteUser(payload: InviteUserRequest): Promise<User>` (`api/users.ts`). `/team` and `/profile` routes — this is the final task of the plan.

- [ ] **Step 1: Write `web/src/api/users.ts`**

```typescript
import { apiFetch } from './client';
import type { InviteUserRequest, User } from './types';

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function inviteUser(payload: InviteUserRequest): Promise<User> {
  return apiFetch<User>('/users', { method: 'POST', body: payload });
}
```

- [ ] **Step 2: Write the failing test `web/src/pages/TeamPage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as usersApi from '../api/users';
import type { User } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { TeamPage } from './TeamPage';

const teammate: User = { id: 'u-2', org_id: 'o-1', name: 'Arjun Nair', email: 'arjun@example.com', role: 'DOCS_COMPLIANCE', status: 'ACTIVE' };

function renderWithRole(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('TeamPage', () => {
  it('lists team members', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([teammate]);
    renderWithRole('EXPORTER_ADMIN');
    expect(await screen.findByText('Arjun Nair')).toBeInTheDocument();
  });

  it('shows the invite form for an admin role', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    renderWithRole('EXPORTER_ADMIN');
    await screen.findByText(/no team members/i);
    expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();
  });

  it('submits the invite form', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    const inviteSpy = vi.spyOn(usersApi, 'inviteUser').mockResolvedValue(teammate);

    renderWithRole('EXPORTER_ADMIN');
    await screen.findByText(/no team members/i);
    await userEvent.type(screen.getByLabelText(/name/i), 'Arjun Nair');
    await userEvent.type(screen.getByLabelText(/email/i), 'arjun@example.com');
    await userEvent.click(screen.getByRole('button', { name: /invite/i }));

    expect(inviteSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Arjun Nair', email: 'arjun@example.com' }));
  });

  it('hides the invite form for a non-admin role', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    renderWithRole('DOCS_COMPLIANCE');
    await screen.findByText(/no team members/i);
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- TeamPage.test.tsx`
Expected: FAIL — `./TeamPage` doesn't exist yet.

- [ ] **Step 4: Write `web/src/pages/TeamPage.tsx`**

```typescript
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';

import { inviteUser, listUsers } from '../api/users';
import type { User, UserRole } from '../api/types';
import { useAuthStore } from '../stores/AuthContext';

const ADMIN_ROLES: UserRole[] = ['EXPORTER_ADMIN', 'BANK_REVIEWER', 'BUYER'];

export const TeamPage = observer(function TeamPage() {
  const auth = useAuthStore();
  const canInvite = auth.user ? ADMIN_ROLES.includes(auth.user.role) : false;

  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');

  async function refresh() {
    setUsers(await listUsers());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await inviteUser({ name, email, role });
    setName('');
    setEmail('');
    await refresh();
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Team</h1>
      {canInvite && (
        <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 mb-6 max-w-lg flex flex-col gap-3">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-ink-soft mb-1">
              Name
            </label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-line rounded" required />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink-soft mb-1">
              Email
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-line rounded" required />
          </div>
          <div>
            <label htmlFor="role" className="block text-xs font-semibold text-ink-soft mb-1">
              Role
            </label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2 border border-line rounded">
              <option value="DOCS_COMPLIANCE">Docs & Compliance</option>
              <option value="FINANCE">Finance</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            + Invite
          </button>
        </form>
      )}
      {users.length === 0 ? (
        <p className="text-ink-soft">No team members yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line-soft">
                <td className="py-2">{user.name}</td>
                <td className="py-2 font-mono">{user.email}</td>
                <td className="py-2">{user.role}</td>
                <td className="py-2">{user.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TeamPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test `web/src/pages/ProfilePage.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { ProfilePage } from './ProfilePage';

describe('ProfilePage', () => {
  it('shows the signed-in user\'s profile fields', () => {
    const store = new AuthStore();
    store.isHydrating = false;
    store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByText('EXPORTER_ADMIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- ProfilePage.test.tsx`
Expected: FAIL — `./ProfilePage` doesn't exist yet.

- [ ] **Step 8: Write `web/src/pages/ProfilePage.tsx`**

```typescript
import { observer } from 'mobx-react-lite';

import { useAuthStore } from '../stores/AuthContext';

export const ProfilePage = observer(function ProfilePage() {
  const auth = useAuthStore();
  const user = auth.user!;

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Your profile</h1>
      <div className="border border-line rounded-lg p-5 max-w-md flex flex-col gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-soft">Name</span>
          <span>{user.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Email</span>
          <span className="font-mono">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Role</span>
          <span>{user.role}</span>
        </div>
        <button onClick={() => auth.logout()} className="self-start text-block text-sm font-semibold mt-2">
          Log out
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- ProfilePage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 10: Wire both routes into `web/src/App.tsx`**

Add imports `import { TeamPage } from './pages/TeamPage';` and `import { ProfilePage } from './pages/ProfilePage';`, then add both as siblings inside the `AppShell` route:

```typescript
<Route path="/team" element={<TeamPage />} />
<Route path="/profile" element={<ProfilePage />} />
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: all tests from Tasks 1-11 PASS. This is the complete web portal — every route from the design spec is now wired and tested.

- [ ] **Step 12: Commit**

```bash
git add src/api/users.ts src/pages/TeamPage.tsx src/pages/TeamPage.test.tsx src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx src/App.tsx
git commit -m "Add Team and Profile pages"
```
