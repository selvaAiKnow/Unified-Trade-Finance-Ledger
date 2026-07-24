import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMe, login, signup } from './auth';

describe('auth API module', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signup posts to /auth/signup and returns the parsed response', async () => {
    const responseBody = {
      organization: { id: '1', name: 'Org', org_type: 'EXPORTER', country: 'IN', industry: 'Pharma', tax_id: 'TAX', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'User', email: 'user@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 201 }));

    const result = await signup({
      organization: { name: 'Org', org_type: 'EXPORTER', country: 'IN', industry: 'Pharma', tax_id: 'TAX' },
      admin_user: { name: 'User', email: 'user@example.com', password: 'secret' },
    });

    expect(result).toEqual(responseBody);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/signup');
    expect(init.method).toBe('POST');
  });

  it('login posts to /auth/login and returns the token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer' }), { status: 200 }),
    );

    const result = await login({ email: 'user@example.com', password: 'secret' });

    expect(result.access_token).toBe('tok');
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(init.method).toBe('POST');
  });

  it('getMe fetches /auth/me', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' }), { status: 200 }),
    );

    const result = await getMe();

    expect(result.email).toBe('a@example.com');
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/me');
  });
});
