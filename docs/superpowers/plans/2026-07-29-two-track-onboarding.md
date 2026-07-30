# Two-Track Onboarding & Superuser Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `web`'s single generic `/signup` form into two distinct
onboarding tracks (organization vs. banking) behind a hub page, and give
the existing per-org admin role a consistent "Superuser" label in the UI.

**Architecture:** Extract the current `SignupPage.tsx` form into a shared,
configurable `SignupForm` component. Two new pages
(`OrganizationSignupPage`, `BankSignupPage`) each render it configured
differently (which `org_type` values are selectable). `SignupPage.tsx`
itself becomes a two-card hub linking to both. A new `roleLabel()` helper
in the existing `lib/roles.ts` maps the three existing admin roles to
"Superuser" for display.

**Tech Stack:** React 18/TypeScript/Vite, matching the rest of `web`
exactly. No backend changes.

## Global Constraints

- **No backend/API changes.** Both onboarding tracks call the exact same
  `signup()` (`POST /auth/signup`) with the exact same `SignupRequest`
  shape that exists today.
- **Superuser is a display label only.** No new `UserRole` value, no
  schema change. `roleLabel()` maps the existing `EXPORTER_ADMIN`/
  `BANK_REVIEWER`/`BUYER` roles (already `lib/roles.ts`'s
  `TEAM_INVITE_ROLES`) to `"Superuser"`.
- **Organization track:** `org_type` selectable between `EXPORTER` and
  `BUYER` (a dropdown, matching today's two non-bank options).
- **Banking track:** `org_type` fixed to `BANK` — no dropdown shown, since
  the track chosen already determines it.

---

### Task 1: Extract the shared `SignupForm` component

**Files:**
- Create: `web/src/components/SignupForm.tsx`

**Interfaces:**
- Consumes: `signup()` (`web/src/api/auth.ts`, unchanged), `OrgType`/
  `SignupResponse` (`web/src/api/types.ts`, unchanged).
- Produces: `SignupForm` component with props `{ heading: string;
  subheading: string; orgTypeOptions: Array<{ value: OrgType; label:
  string }>; orgNameLabel?: string }` — consumed by Task 2's
  `OrganizationSignupPage`/`BankSignupPage`.

This task has no automated test of its own — it's a pure extraction of
`SignupPage.tsx`'s existing, already-tested form logic into a reusable
component with configurable props. Task 2's tests exercise it through
both consuming pages.

- [ ] **Step 1: Create `SignupForm.tsx`**

This is `SignupPage.tsx`'s current form logic (account step + verify
step), made configurable: `heading`/`subheading` replace the hardcoded
copy, `orgTypeOptions` replaces the hardcoded 3-option dropdown (rendered
only when there's more than one option — a single option means the org
type is fixed and no dropdown is shown), and `orgNameLabel` lets the
banking track say "Institution name" instead of "Organization name".

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType, SignupResponse } from '../api/types';

export interface SignupFormProps {
  heading: string;
  subheading: string;
  orgTypeOptions: Array<{ value: OrgType; label: string }>;
  orgNameLabel?: string;
}

export function SignupForm({ heading, subheading, orgTypeOptions, orgNameLabel = 'Organization name' }: SignupFormProps) {
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
        <h2 className="font-serif text-xl mb-1">{heading}</h2>
        <p className="text-ink-soft text-sm mb-4">{subheading}</p>
        <form onSubmit={handleAccountSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold text-ink-soft mb-1">
              {orgNameLabel}
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          {orgTypeOptions.length > 1 && (
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
                {orgTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc -b --noEmit`
Expected: no errors (this component isn't wired into any page yet, so
nothing else changes behavior — this just proves the file itself is
valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SignupForm.tsx
git commit -m "Extract SignupForm as a shared, configurable component"
```

---

### Task 2: Organization and banking onboarding pages

**Files:**
- Create: `web/src/pages/OrganizationSignupPage.tsx`
- Create: `web/src/pages/BankSignupPage.tsx`
- Test: `web/src/pages/OrganizationSignupPage.test.tsx`
- Test: `web/src/pages/BankSignupPage.test.tsx`

**Interfaces:**
- Consumes: `SignupForm` (Task 1).
- Produces: `OrganizationSignupPage`, `BankSignupPage` — consumed by
  Task 3's `App.tsx` routing.

- [ ] **Step 1: Create `OrganizationSignupPage.tsx`**

```tsx
import { SignupForm } from '../components/SignupForm';

export function OrganizationSignupPage() {
  return (
    <SignupForm
      heading="Create your organization account"
      subheading="For exporters and importers creating and managing trade transactions."
      orgTypeOptions={[
        { value: 'EXPORTER', label: 'Exporter' },
        { value: 'BUYER', label: 'Buyer / Importer' },
      ]}
    />
  );
}
```

- [ ] **Step 2: Create `BankSignupPage.tsx`**

```tsx
import { SignupForm } from '../components/SignupForm';

export function BankSignupPage() {
  return (
    <SignupForm
      heading="Register your bank"
      subheading="For banks and financiers joining as a participant institution."
      orgTypeOptions={[{ value: 'BANK', label: 'Bank' }]}
      orgNameLabel="Institution name"
    />
  );
}
```

- [ ] **Step 3: Write `OrganizationSignupPage.test.tsx`**

This is the existing `SignupPage.test.tsx` test (the current file is
replaced entirely in Task 3, once `SignupPage` becomes the hub), plus a
new test proving only Exporter/Buyer are selectable:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { OrganizationSignupPage } from './OrganizationSignupPage';

describe('OrganizationSignupPage', () => {
  it('submits the account step and shows the immediate KYB verify result', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'MedCure Pharma Exports', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
    });

    render(
      <MemoryRouter>
        <OrganizationSignupPage />
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
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ organization: expect.objectContaining({ org_type: 'EXPORTER' }) }));
  });

  it('offers only Exporter and Buyer as organization types', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/organization type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['EXPORTER', 'BUYER']);
  });
});
```

- [ ] **Step 4: Write `BankSignupPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { BankSignupPage } from './BankSignupPage';

describe('BankSignupPage', () => {
  it('submits the account step with org_type fixed to BANK and no type dropdown shown', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Rahul Mehta', email: 'rahul@example.com', role: 'BANK_REVIEWER', status: 'ACTIVE' },
    });

    render(
      <MemoryRouter>
        <BankSignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/organization type/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/institution name/i), 'Canara Bank');
    await userEvent.type(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Banking');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-2');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Rahul Mehta');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'rahul@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ organization: expect.objectContaining({ org_type: 'BANK' }) }));
  });
});
```

- [ ] **Step 5: Run the new tests**

Run: `cd web && npx vitest run src/pages/OrganizationSignupPage.test.tsx src/pages/BankSignupPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/OrganizationSignupPage.tsx web/src/pages/BankSignupPage.tsx \
        web/src/pages/OrganizationSignupPage.test.tsx web/src/pages/BankSignupPage.test.tsx
git commit -m "Add organization and banking onboarding pages"
```

---

### Task 3: Onboarding hub and routing

**Files:**
- Modify: `web/src/pages/SignupPage.tsx`
- Modify: `web/src/pages/SignupPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `OrganizationSignupPage`, `BankSignupPage` (Task 2).
- Produces: `/signup` (hub), `/signup/organization`, `/signup/banking` —
  live routes, this plan's externally-visible routing deliverable.

- [ ] **Step 1: Replace `SignupPage.tsx`'s full contents**

`SignupPage` stops being the form itself and becomes a two-card hub,
mirroring `prototypes/trade_finance_platform_app.html`'s "Onboard a
party" hub pattern:

```tsx
import { Link } from 'react-router-dom';

export function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-2xl">
        <h1 className="font-serif text-2xl text-center mb-2">Onboard a party</h1>
        <p className="text-ink-soft text-sm text-center mb-8">
          Choose who you're bringing onto the platform. Trade entities and financial institutions follow different verification paths.
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-line rounded-xl p-6 bg-paper-2">
            <h2 className="font-serif text-lg mb-2">Organization</h2>
            <p className="text-ink-soft text-sm mb-4">Exporters and importers who will create and manage trade transactions.</p>
            <Link to="/signup/organization" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
              Start organization onboarding
            </Link>
          </div>
          <div className="border border-line rounded-xl p-6 bg-paper-2">
            <h2 className="font-serif text-lg mb-2">Banking</h2>
            <p className="text-ink-soft text-sm mb-4">Banks and financiers joining as a participant institution.</p>
            <Link to="/signup/banking" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
              Start banking onboarding
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `SignupPage.test.tsx`'s full contents**

The old test (account-form submission) moved to Task 2's
`OrganizationSignupPage.test.tsx`. This file now tests the hub itself:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SignupPage } from './SignupPage';

describe('SignupPage', () => {
  it('links to both onboarding tracks', () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /start organization onboarding/i })).toHaveAttribute('href', '/signup/organization');
    expect(screen.getByRole('link', { name: /start banking onboarding/i })).toHaveAttribute('href', '/signup/banking');
  });
});
```

- [ ] **Step 3: Wire the two new routes into `App.tsx`**

Add the two imports alongside the existing `SignupPage` import:

```tsx
import { BankSignupPage } from './pages/BankSignupPage';
import { OrganizationSignupPage } from './pages/OrganizationSignupPage';
```

Add the two routes directly after the existing `/signup` route:

```tsx
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/organization" element={<OrganizationSignupPage />} />
          <Route path="/signup/banking" element={<BankSignupPage />} />
```

- [ ] **Step 4: Run the full test suite**

Run: `cd web && npx vitest run`
Expected: PASS, all tests green (the old `SignupPage` test scenario now
lives in `OrganizationSignupPage.test.tsx` from Task 2; `App.test.tsx`
is unaffected since it doesn't assert on `/signup`'s content).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/SignupPage.tsx web/src/pages/SignupPage.test.tsx web/src/App.tsx
git commit -m "Turn /signup into a two-track onboarding hub"
```

---

### Task 4: Superuser role labeling

**Files:**
- Modify: `web/src/lib/roles.ts`
- Test: `web/src/lib/roles.test.ts`
- Modify: `web/src/pages/TeamPage.tsx`

**Interfaces:**
- Consumes: `UserRole` (`web/src/api/types.ts`, unchanged).
- Produces: `roleLabel(role: UserRole): string` — consumed by
  `TeamPage.tsx`'s role column; available for any other page that
  displays a role in the future.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { roleLabel } from './roles';

describe('roleLabel', () => {
  it('labels the three admin-per-org roles as Superuser', () => {
    expect(roleLabel('EXPORTER_ADMIN')).toBe('Superuser');
    expect(roleLabel('BANK_REVIEWER')).toBe('Superuser');
    expect(roleLabel('BUYER')).toBe('Superuser');
  });

  it('labels the remaining roles with their existing readable names', () => {
    expect(roleLabel('DOCS_COMPLIANCE')).toBe('Docs & Compliance');
    expect(roleLabel('FINANCE')).toBe('Finance');
    expect(roleLabel('VIEWER')).toBe('Viewer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/roles.test.ts`
Expected: FAIL — `roleLabel` is not exported yet.

- [ ] **Step 3: Add `roleLabel` to `roles.ts`**

Add this to the existing file, alongside `isExporterRole`/
`isBankReviewerRole`/`canInviteTeamMembers` (don't remove or change any
of those three — purely additive):

```ts
const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/roles.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Use `roleLabel` in `TeamPage.tsx`**

Add the import alongside the existing `canInviteTeamMembers` import:

```tsx
import { canInviteTeamMembers, roleLabel } from '../lib/roles';
```

Change the role table cell from:

```tsx
                <td className="py-2">{user.role}</td>
```

to:

```tsx
                <td className="py-2">{roleLabel(user.role)}</td>
```

- [ ] **Step 6: Run the full test suite**

Run: `cd web && npx vitest run`
Expected: PASS, all tests green. `TeamPage.test.tsx`'s existing
assertions don't check the role column's text directly, so this change
doesn't require any test updates there.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/roles.ts web/src/lib/roles.test.ts web/src/pages/TeamPage.tsx
git commit -m "Label the per-org admin roles as Superuser in the UI"
```
