import { apiFetch } from './client';
import type { KybStatus, Organization, Trade, User, UserRole, UserStatus } from './types';

export function listAdminOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/admin/organizations');
}

export function updateOrganizationKybStatus(orgId: string, kybStatus: KybStatus): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}/kyb-status`, {
    method: 'PATCH',
    body: { kyb_status: kybStatus },
  });
}

export function listAdminUsers(): Promise<User[]> {
  return apiFetch<User[]>('/admin/users');
}

export function createAdminUser(payload: { name: string; email: string; org_id: string; role: UserRole }): Promise<User> {
  return apiFetch<User>('/admin/users', { method: 'POST', body: payload });
}

export function getAdminUser(userId: string): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}`);
}

export function updateAdminUser(
  userId: string,
  payload: { name: string; org_id: string; role: UserRole; status: UserStatus },
): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}`, { method: 'PATCH', body: payload });
}

export function updateAdminUserStatus(userId: string, status: UserStatus): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}/status`, { method: 'PATCH', body: { status } });
}

export function listAdminTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/admin/trades');
}
