import type { UserRole } from '../api/types';

const EXPORTER_ROLES: UserRole[] = ['EXPORTER_ADMIN', 'DOCS_COMPLIANCE', 'FINANCE', 'VIEWER'];

export function isExporterRole(role: UserRole): boolean {
  return EXPORTER_ROLES.includes(role);
}
