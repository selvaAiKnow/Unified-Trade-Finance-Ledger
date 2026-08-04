import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { RequireAdmin, RequireBusinessUser } from './RoleGates';

function renderRequireAdmin(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', {
    id: 'u-1',
    org_id: role === 'PLATFORM_ADMIN' ? null : 'o-1',
    name: 'Test User',
    email: 'test@example.com',
    role: role as never,
    status: 'ACTIVE',
  });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin area</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard area</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function renderRequireBusinessUser(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', {
    id: 'u-1',
    org_id: role === 'PLATFORM_ADMIN' ? null : 'o-1',
    name: 'Test User',
    email: 'test@example.com',
    role: role as never,
    status: 'ACTIVE',
  });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireBusinessUser />}>
            <Route path="/dashboard" element={<div>Dashboard area</div>} />
          </Route>
          <Route path="/admin" element={<div>Admin area</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAdmin', () => {
  it('renders the admin route for a PLATFORM_ADMIN user', () => {
    renderRequireAdmin('PLATFORM_ADMIN');
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });

  it('redirects a business user away to /dashboard', () => {
    renderRequireAdmin('EXPORTER_ADMIN');
    expect(screen.getByText('Dashboard area')).toBeInTheDocument();
  });
});

describe('RequireBusinessUser', () => {
  it('renders the business route for a non-admin user', () => {
    renderRequireBusinessUser('EXPORTER_ADMIN');
    expect(screen.getByText('Dashboard area')).toBeInTheDocument();
  });

  it('redirects a PLATFORM_ADMIN user away to /admin', () => {
    renderRequireBusinessUser('PLATFORM_ADMIN');
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });
});
