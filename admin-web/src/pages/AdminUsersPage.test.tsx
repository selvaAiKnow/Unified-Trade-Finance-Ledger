import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { AdminUsersPage } from './AdminUsersPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
  { id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

describe('AdminUsersPage', () => {
  it('renders every user platform-wide, resolving org_id to the correct organization name', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.queryByText('Global Imports Co.')).not.toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument();
  });

  it('has an Add user link pointing to /users/new', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Priya Shah');

    expect(screen.getByRole('link', { name: /add user/i })).toHaveAttribute('href', '/users/new');
  });

  it('links View and Edit icons to the correct per-user routes', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Priya Shah');

    expect(screen.getByRole('link', { name: /view priya shah/i })).toHaveAttribute('href', '/users/u-1');
    expect(screen.getByRole('link', { name: /edit priya shah/i })).toHaveAttribute('href', '/users/u-1/edit');
  });

  it('hides Edit and Deactivate for a platform admin row, but keeps View', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Ops Admin');

    expect(screen.getByRole('link', { name: /view ops admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit ops admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate ops admin/i })).not.toBeInTheDocument();
  });

  describe('deactivating a user', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('deactivates an active user after confirming', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      const statusSpy = vi.spyOn(adminApi, 'updateAdminUserStatus').mockResolvedValue({ ...users[0], status: 'SUSPENDED' });

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(statusSpy).toHaveBeenCalledWith('u-1', 'SUSPENDED');
      expect(await screen.findByRole('button', { name: /reactivate priya shah/i })).toBeInTheDocument();
    });

    it('does nothing if the confirmation is declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      const statusSpy = vi.spyOn(adminApi, 'updateAdminUserStatus');

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('reverts and shows an error if deactivating fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      vi.spyOn(adminApi, 'updateAdminUserStatus').mockRejectedValue(new Error('boom'));

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(await screen.findByText(/couldn't deactivate priya shah/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /deactivate priya shah/i })).toBeInTheDocument();
    });

    it('clears a stale error banner once a later action succeeds', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      const statusSpy = vi
        .spyOn(adminApi, 'updateAdminUserStatus')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ ...users[0], status: 'SUSPENDED' });

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));
      expect(await screen.findByText(/couldn't deactivate priya shah/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(statusSpy).toHaveBeenCalledTimes(2);
      expect(await screen.findByRole('button', { name: /reactivate priya shah/i })).toBeInTheDocument();
      expect(screen.queryByText(/couldn't deactivate priya shah/i)).not.toBeInTheDocument();
    });
  });
});
