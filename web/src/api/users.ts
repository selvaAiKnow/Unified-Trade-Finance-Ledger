import { apiFetch } from './client';
import type { InviteUserRequest, User } from './types';

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function inviteUser(payload: InviteUserRequest): Promise<User> {
  return apiFetch<User>('/users', { method: 'POST', body: payload });
}
