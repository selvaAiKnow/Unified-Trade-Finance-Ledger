import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AdminOrganizationsPage } from './AdminOrganizationsPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Sakura Textiles K.K.', org_type: 'BUYER', country: 'Japan', industry: 'Textiles & Apparel', tax_id: 'TAX-2', kyb_status: 'REVIEW', created_at: '2026-01-01T00:00:00Z' },
];

describe('AdminOrganizationsPage', () => {
  it('renders every organization platform-wide with its KYB status', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Sakura Textiles K.K.')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockRejectedValue(new Error('boom'));

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText(/couldn't load organizations/i)).toBeInTheDocument();
  });
});
