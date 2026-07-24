import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionTimelinePage } from './TransactionTimelinePage';

describe('TransactionTimelinePage', () => {
  it('renders all 6 milestone labels as a static, placeholder lifecycle view', () => {
    render(<TransactionTimelinePage />);

    ['LC Issued', 'Regulatory Clear', 'Shipped', 'Docs Accepted', 'Settled', 'Closed'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText(/not yet connected to a blockchain layer/i)).toBeInTheDocument();
  });
});
