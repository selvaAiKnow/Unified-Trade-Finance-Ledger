import { apiFetch } from './client';
import type { LoginRequest, LoginResponse, SignupRequest, SignupResponse, User } from './types';

export function signup(payload: SignupRequest): Promise<SignupResponse> {
  return apiFetch<SignupResponse>('/auth/signup', { method: 'POST', body: payload });
}

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}
