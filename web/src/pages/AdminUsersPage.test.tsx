import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { AdminUsersPage } from './AdminUsersPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
  { id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
];

describe('AdminUsersPage', () => {
  it('renders every user platform-wide with their organization name', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument();
  });
});
