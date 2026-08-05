import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AddUserPage } from './AddUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/new']}>
      <Routes>
        <Route path="/users/new" element={<AddUserPage />} />
        <Route path="/users" element={<div>Users list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddUserPage', () => {
  it('creates a user and navigates back to the list', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    const createSpy = vi.spyOn(adminApi, 'createAdminUser').mockResolvedValue({
      id: 'u-1',
      org_id: 'o-1',
      name: 'Priya Shah',
      email: 'priya@example.com',
      role: 'EXPORTER_ADMIN',
      status: 'INVITED',
    });

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/email/i), 'priya@example.com');
    await userEvent.selectOptions(screen.getByLabelText(/role/i), 'EXPORTER_ADMIN');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(createSpy).toHaveBeenCalledWith({ name: 'Priya Shah', email: 'priya@example.com', org_id: 'o-1', role: 'EXPORTER_ADMIN' });
    expect(await screen.findByText('Users list')).toBeInTheDocument();
  });

  it('shows an error when creation fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'createAdminUser').mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/email/i), 'priya@example.com');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText(/couldn't create the user/i)).toBeInTheDocument();
  });
});
