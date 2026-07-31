import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { Organization } from '../api/types';
import { OrgPicker } from './OrgPicker';

const sakura: Organization = {
  id: 'o-2',
  name: 'Sakura Textiles K.K.',
  org_type: 'BUYER',
  country: 'Japan',
  industry: 'Textiles & Apparel',
  tax_id: 'TAX-2',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

describe('OrgPicker', () => {
  it('shows matching organizations as the user types and resolves the pick to an id', async () => {
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([sakura]);
    const onChange = vi.fn();

    render(<OrgPicker id="importer" label="Importer" value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Importer'), 'sak');
    await userEvent.click(await screen.findByText('Sakura Textiles K.K.'));

    expect(onChange).toHaveBeenCalledWith('o-2');
    expect(screen.getByLabelText('Importer')).toHaveValue('Sakura Textiles K.K.');
  });

  it('clears the resolved id when the user edits the text after picking', async () => {
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([sakura]);
    const onChange = vi.fn();

    render(<OrgPicker id="importer" label="Importer" value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Importer'), 'sak');
    await userEvent.click(await screen.findByText('Sakura Textiles K.K.'));
    onChange.mockClear();

    await userEvent.type(screen.getByLabelText('Importer'), 'x');

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('does not show a dropdown when there are no matches', async () => {
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([]);
    const onChange = vi.fn();

    render(<OrgPicker id="importer" label="Importer" value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Importer'), 'zzz');

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
