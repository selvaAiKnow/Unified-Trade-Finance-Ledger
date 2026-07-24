import { makeAutoObservable, runInAction } from 'mobx';

import { getMe } from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';

export class AuthStore {
  token: string | null = null;
  user: User | null = null;
  isHydrating = true;

  constructor() {
    makeAutoObservable(this);
    this.token = localStorage.getItem('token');
    setAuthToken(this.token);
    setUnauthorizedHandler(() => this.logout());
  }

  get isAuthenticated(): boolean {
    return this.token !== null && this.user !== null;
  }

  async hydrate(): Promise<void> {
    if (!this.token) {
      this.isHydrating = false;
      return;
    }
    try {
      const user = await getMe();
      runInAction(() => {
        this.user = user;
        this.isHydrating = false;
      });
    } catch {
      this.logout();
      runInAction(() => {
        this.isHydrating = false;
      });
    }
  }

  setSession(token: string, user: User): void {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    setAuthToken(token);
  }

  logout(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    setAuthToken(null);
  }
}
