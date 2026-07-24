import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as usersApi from '../api/users';
import type { User } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { TeamPage } from './TeamPage';

const teammate: User = { id: 'u-2', org_id: 'o-1', name: 'Arjun Nair', email: 'arjun@example.com', role: 'DOCS_COMPLIANCE', status: 'ACTIVE' };

function renderWithRole(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('TeamPage', () => {
  it('lists team members', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([teammate]);
    renderWithRole('EXPORTER_ADMIN');
    expect(await screen.findByText('Arjun Nair')).toBeInTheDocument();
  });

  it('shows the invite form for an admin role', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    renderWithRole('EXPORTER_ADMIN');
    await screen.findByText(/no team members/i);
    expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();
  });

  it('submits the invite form', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    const inviteSpy = vi.spyOn(usersApi, 'inviteUser').mockResolvedValue(teammate);

    renderWithRole('EXPORTER_ADMIN');
    await screen.findByText(/no team members/i);
    await userEvent.type(screen.getByLabelText(/name/i), 'Arjun Nair');
    await userEvent.type(screen.getByLabelText(/email/i), 'arjun@example.com');
    await userEvent.click(screen.getByRole('button', { name: /invite/i }));

    expect(inviteSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Arjun Nair', email: 'arjun@example.com' }));
  });

  it('hides the invite form for a non-admin role', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([]);
    renderWithRole('DOCS_COMPLIANCE');
    await screen.findByText(/no team members/i);
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
  });

  it('shows an error and no listing when loading the team fails', async () => {
    vi.spyOn(usersApi, 'listUsers').mockRejectedValue(new Error('boom'));
    renderWithRole('EXPORTER_ADMIN');
    expect(await screen.findByText(/couldn't load the team/i)).toBeInTheDocument();
    expect(screen.queryByText(/no team members/i)).not.toBeInTheDocument();
  });

  it('shows a submit error and keeps the loaded team list when inviting fails', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue([teammate]);
    vi.spyOn(usersApi, 'inviteUser').mockRejectedValue(new Error('boom'));

    renderWithRole('EXPORTER_ADMIN');
    await screen.findByText('Arjun Nair');
    await userEvent.type(screen.getByLabelText(/name/i), 'New Person');
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: /invite/i }));

    expect(await screen.findByText(/couldn't send the invite/i)).toBeInTheDocument();
    expect(screen.getByText('Arjun Nair')).toBeInTheDocument();
  });
});
