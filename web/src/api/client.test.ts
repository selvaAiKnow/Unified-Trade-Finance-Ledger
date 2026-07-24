import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch, setAuthToken, setUnauthorizedHandler } from './client';

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    setAuthToken(null);
    setUnauthorizedHandler(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a GET request without an Authorization header when no token is set', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await apiFetch<{ ok: boolean }>('/health');

    expect(result).toEqual({ ok: true });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('attaches a Bearer Authorization header once a token is set', async () => {
    setAuthToken('test-token-123');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiFetch('/auth/me');

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('sends a JSON body and Content-Type header for a POST with a body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), { status: 201 }),
    );

    await apiFetch('/trades', { method: 'POST', body: { lc_reference: 'LC-1' } });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ lc_reference: 'LC-1' }));
  });

  it('throws ApiError with the response status on a non-2xx response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('not found', { status: 404 }),
    );

    await expect(apiFetch('/trades/unknown')).rejects.toMatchObject({ status: 404 });
  });

  it('calls the registered unauthorized handler on a 401 response', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });
});
