import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { ProfilePage } from './ProfilePage';

describe('ProfilePage', () => {
  it('shows the signed-in user\'s profile fields', () => {
    const store = new AuthStore();
    store.isHydrating = false;
    store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByText('EXPORTER_ADMIN')).toBeInTheDocument();
  });
});
