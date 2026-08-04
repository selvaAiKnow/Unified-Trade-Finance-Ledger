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
