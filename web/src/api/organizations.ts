import { apiFetch } from './client';
import type { KybCheck, Organization } from './types';

export function getOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/organizations/${id}`);
}

export function listOrganizations(search?: string): Promise<Organization[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<Organization[]>(`/organizations${query}`);
}

export function listOrganizationKybChecks(id: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/organizations/${id}/kyb-checks`);
}
