import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TransactionDetailLayout } from './TransactionDetailLayout';

describe('TransactionDetailLayout', () => {
  it('renders the tab bar, scoped to the tradeId from the route, above the nested route content', () => {
    render(
      <MemoryRouter initialEntries={['/transactions/t-1/overview']}>
        <Routes>
          <Route path="/transactions/:tradeId" element={<TransactionDetailLayout />}>
            <Route path="overview" element={<div>Overview content</div>} />
            <Route path="documents" element={<div>Documents content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/transactions/t-1/overview');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/transactions/t-1/documents');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Overview content')).toBeInTheDocument();
  });
});
