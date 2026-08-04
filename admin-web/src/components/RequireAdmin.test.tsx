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
