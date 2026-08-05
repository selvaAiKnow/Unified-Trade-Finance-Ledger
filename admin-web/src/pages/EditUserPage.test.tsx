import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { EditUserPage } from './EditUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const user: User = { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/u-1/edit']}>
      <Routes>
        <Route path="/users/:userId/edit" element={<EditUserPage />} />
        <Route path="/users" element={<div>Users list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditUserPage', () => {
  it('pre-fills the form with the current user and saves changes', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    const updateSpy = vi.spyOn(adminApi, 'updateAdminUser').mockResolvedValue({ ...user, name: 'Priya Renamed' });

    renderPage();

    expect(await screen.findByDisplayValue('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Renamed');
    await userEvent.selectOptions(screen.getByLabelText(/organization/i), 'o-2');
    await userEvent.selectOptions(screen.getByLabelText(/role/i), 'FINANCE');
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'SUSPENDED');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateSpy).toHaveBeenCalledWith('u-1', { name: 'Priya Renamed', org_id: 'o-2', role: 'FINANCE', status: 'SUSPENDED' });
    expect(await screen.findByText('Users list')).toBeInTheDocument();
  });

  it('shows an error when loading the user fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load this user/i)).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'updateAdminUser').mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByDisplayValue('Priya Shah');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/couldn't save the changes/i)).toBeInTheDocument();
  });
});
