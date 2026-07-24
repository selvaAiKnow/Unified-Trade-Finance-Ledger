import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

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
});
