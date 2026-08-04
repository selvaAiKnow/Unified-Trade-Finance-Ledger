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
