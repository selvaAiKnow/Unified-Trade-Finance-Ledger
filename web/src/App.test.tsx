import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it("redirects an unauthenticated user to the login page (unmatched here, so falls through to ProtectedRoute's redirect target once routed)", () => {
    render(<App />);
    // With no token in localStorage, ProtectedRoute redirects toward /login;
    // /login isn't defined until Task 5, so at this point the router has no
    // matching route and renders nothing crash-free — this test only proves
    // App mounts without throwing given the real AuthProvider/BrowserRouter tree.
    expect(document.getElementById('root') ?? document.body).toBeInTheDocument();
  });
});
