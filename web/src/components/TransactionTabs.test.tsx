import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TransactionTabs } from './TransactionTabs';

describe('TransactionTabs', () => {
  it('renders all five tabs scoped to the current tradeId', () => {
    render(
      <MemoryRouter initialEntries={['/transactions/t-1/documents']}>
        <TransactionTabs tradeId="t-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/transactions/t-1/overview');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/transactions/t-1/documents');
    expect(screen.getByRole('link', { name: 'Compliance' })).toHaveAttribute('href', '/transactions/t-1/compliance');
    expect(screen.getByRole('link', { name: 'Bank Review' })).toHaveAttribute('href', '/transactions/t-1/bank-review');
    expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute('href', '/transactions/t-1/timeline');
  });

  it('marks the tab matching the current route as active, and leaves the others inactive', () => {
    render(
      <MemoryRouter initialEntries={['/transactions/t-1/documents']}>
        <TransactionTabs tradeId="t-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Compliance' })).not.toHaveAttribute('aria-current');
  });
});
