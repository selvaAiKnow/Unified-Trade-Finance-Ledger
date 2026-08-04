import { apiFetch } from './client';
import type { LoginRequest, LoginResponse, User } from './types';

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}
