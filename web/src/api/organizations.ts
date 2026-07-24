import { apiFetch } from './client';
import type { KybCheck, Organization } from './types';

export function getOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/organizations/${id}`);
}

export function listOrganizationKybChecks(id: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/organizations/${id}/kyb-checks`);
}
