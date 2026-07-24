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
