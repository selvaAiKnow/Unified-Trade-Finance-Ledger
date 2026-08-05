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

export function uploadBusinessRegistrationDocument(orgId: string, file: File): Promise<KybCheck> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<KybCheck>(`/organizations/${orgId}/kyb-checks/business-registration-document`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
}
