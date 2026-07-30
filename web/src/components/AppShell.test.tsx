import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  window.localStorage.clear();
});

describe('AppShell', () => {
  it('does not render a global Compliance nav item (compliance is per-trade only)', () => {
    renderShell('BANK_REVIEWER');
    expect(screen.queryByText('Compliance')).not.toBeInTheDocument();
  });

  it('shows the signed-in user name', () => {
    renderShell('VIEWER');
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
  });

  it('links the user name/role block to the profile page', () => {
    renderShell('VIEWER');
    const profileLink = screen.getByText('Priya Shah').closest('a');
    expect(profileLink).toHaveAttribute('href', '/profile');
  });

  it('shows the Superuser label for admin roles instead of the raw role value', () => {
    renderShell('EXPORTER_ADMIN');
    expect(screen.getByText('Superuser')).toBeInTheDocument();
    expect(screen.queryByText('EXPORTER_ADMIN')).not.toBeInTheDocument();
  });

  it('collapses the sidebar to an icon-only rail and persists the choice', async () => {
    renderShell('VIEWER');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it('shows an icon-only logout button that signs the user out', async () => {
    const store = new AuthStore();
    store.isHydrating = false;
    store.setSession('tok', { id: '1', org_id: '2', name: 'Priya Shah', email: 'priya@example.com', role: 'VIEWER', status: 'ACTIVE' });
    const logoutSpy = vi.spyOn(store, 'logout');

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
});
