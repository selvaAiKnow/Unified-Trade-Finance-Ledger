import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import type { User } from '../api/types';
import { AuthStore } from './AuthStore';

const testUser: User = { id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' };

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no token and no user when localStorage is empty', () => {
    const store = new AuthStore();
    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('setSession stores the token in localStorage and marks authenticated', () => {
    const store = new AuthStore();
    store.setSession('tok-123', testUser);

    expect(store.token).toBe('tok-123');
    expect(store.user).toEqual(testUser);
    expect(store.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe('tok-123');
  });

  it('logout clears the token, user, and localStorage', () => {
    const store = new AuthStore();
    store.setSession('tok-123', testUser);

    store.logout();

    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('hydrate resolves isHydrating to false immediately when there is no stored token', async () => {
    const store = new AuthStore();
    await store.hydrate();
    expect(store.isHydrating).toBe(false);
  });

  it('hydrate loads the current user via getMe when a token is stored', async () => {
    localStorage.setItem('token', 'stored-token');
    vi.spyOn(authApi, 'getMe').mockResolvedValue(testUser);

    const store = new AuthStore();
    await store.hydrate();

    expect(store.user).toEqual(testUser);
    expect(store.isHydrating).toBe(false);
  });

  it('hydrate logs out if getMe fails (e.g. expired token)', async () => {
    localStorage.setItem('token', 'stale-token');
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new Error('401'));

    const store = new AuthStore();
    await store.hydrate();

    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isHydrating).toBe(false);
  });
});
