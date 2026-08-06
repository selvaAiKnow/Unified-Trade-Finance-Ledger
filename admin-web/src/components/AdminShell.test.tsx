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
  it('shows links to Organizations, Users, Trades, and KYC Review', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /organizations/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /^users$/i })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: /trades/i })).toHaveAttribute('href', '/trades');
    expect(screen.getByRole('link', { name: /kyc review/i })).toHaveAttribute('href', '/kyc-review');
  });

  it('logs out when the log out button is clicked', async () => {
    const { store } = renderShell();
    const logoutSpy = vi.spyOn(store, 'logout');

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
});
