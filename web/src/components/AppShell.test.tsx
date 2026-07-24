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
  it('shows the Compliance nav item for a bank reviewer', () => {
    renderShell('BANK_REVIEWER');
    expect(screen.getByText('Compliance')).toBeInTheDocument();
  });

  it('hides the Compliance nav item for an exporter admin', () => {
    renderShell('EXPORTER_ADMIN');
    expect(screen.queryByText('Compliance')).not.toBeInTheDocument();
  });

  it('shows the signed-in user name', () => {
    renderShell('VIEWER');
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
  });
});
