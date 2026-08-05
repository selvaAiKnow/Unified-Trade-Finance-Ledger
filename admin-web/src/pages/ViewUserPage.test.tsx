import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { ViewUserPage } from './ViewUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

function renderPage(user: User) {
  vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
  vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

  return render(
    <MemoryRouter initialEntries={['/users/u-1']}>
      <Routes>
        <Route path="/users/:userId" element={<ViewUserPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ViewUserPage', () => {
  it("shows the user's details, resolving their organization name", async () => {
    renderPage({ id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    expect(await screen.findByRole('heading', { name: 'Priya Shah' })).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows an Edit link for a non-platform-admin user', async () => {
    renderPage({ id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    expect(await screen.findByRole('link', { name: /edit user/i })).toHaveAttribute('href', '/users/u-1/edit');
  });

  it('hides the Edit link for a platform admin', async () => {
    renderPage({ id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' });

    await screen.findByRole('heading', { name: 'Ops Admin' });
    expect(screen.queryByRole('link', { name: /edit user/i })).not.toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(
      <MemoryRouter initialEntries={['/users/u-1']}>
        <Routes>
          <Route path="/users/:userId" element={<ViewUserPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load this user/i)).toBeInTheDocument();
  });
});
