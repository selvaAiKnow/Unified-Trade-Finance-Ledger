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
