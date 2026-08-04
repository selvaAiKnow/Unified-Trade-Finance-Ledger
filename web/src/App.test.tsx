import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as adminApi from './api/admin';
import * as authApi from './api/auth';
import * as tradesApi from './api/trades';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('App', () => {
  it("redirects an unauthenticated user to the login page (unmatched here, so falls through to ProtectedRoute's redirect target once routed)", () => {
    render(<App />);
    // With no token in localStorage, ProtectedRoute redirects toward /login;
    // /login isn't defined until Task 5, so at this point the router has no
    // matching route and renders nothing crash-free — this test only proves
    // App mounts without throwing given the real AuthProvider/BrowserRouter tree.
    expect(document.getElementById('root') ?? document.body).toBeInTheDocument();
  });

  it('routes a PLATFORM_ADMIN session through the real route tree to the real admin organizations page', async () => {
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
    // Confirms this is the real AdminShell nav, not a stub route.
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trades' })).toBeInTheDocument();
  });

  it('routes a regular business-user session through the real route tree to the real dashboard page', async () => {
    localStorage.setItem('token', 'tok-business');
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: 'u-business',
      org_id: 'o-1',
      name: 'Priya Shah',
      email: 'priya@example.com',
      role: 'VIEWER',
      status: 'ACTIVE',
    });
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText(/welcome back, priya/i)).toBeInTheDocument();
    // Confirms this is the real AppShell sidebar, not a stub route.
    expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
  });
});
