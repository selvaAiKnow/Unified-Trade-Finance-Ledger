import type { UserRole } from '../api/types';

const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
  PLATFORM_ADMIN: 'Platform Admin',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export const ASSIGNABLE_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'EXPORTER_ADMIN', label: 'Exporter Admin' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'BANK_REVIEWER', label: 'Bank Reviewer' },
  { value: 'DOCS_COMPLIANCE', label: 'Docs & Compliance' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'VIEWER', label: 'Viewer' },
];
