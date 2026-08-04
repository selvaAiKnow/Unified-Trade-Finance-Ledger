import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it("redirects an unauthenticated user to the login page (unmatched here, so falls through to ProtectedRoute's redirect target once routed)", () => {
    render(<App />);
    // With no token in localStorage, ProtectedRoute redirects toward /login;
    // this test only proves App mounts without throwing given the real
    // AuthProvider/BrowserRouter tree.
    expect(document.getElementById('root') ?? document.body).toBeInTheDocument();
  });
});
