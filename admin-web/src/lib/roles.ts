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
