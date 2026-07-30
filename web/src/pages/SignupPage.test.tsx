import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SignupPage } from './SignupPage';

describe('SignupPage', () => {
  it('links to both onboarding tracks', () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /start organization onboarding/i })).toHaveAttribute('href', '/signup/organization');
    expect(screen.getByRole('link', { name: /start banking onboarding/i })).toHaveAttribute('href', '/signup/banking');
  });
});
