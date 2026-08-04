import { apiFetch } from './client';
import type { KybStatus, Organization, Trade, User } from './types';

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

export function listAdminTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/admin/trades');
}
