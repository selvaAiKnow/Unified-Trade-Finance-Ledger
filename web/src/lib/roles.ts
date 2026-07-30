import type { UserRole } from '../api/types';

const EXPORTER_ROLES: UserRole[] = ['EXPORTER_ADMIN', 'DOCS_COMPLIANCE', 'FINANCE', 'VIEWER'];
const TEAM_INVITE_ROLES: UserRole[] = ['EXPORTER_ADMIN', 'BANK_REVIEWER', 'BUYER'];

export function isExporterRole(role: UserRole): boolean {
  return EXPORTER_ROLES.includes(role);
}

export function isBankReviewerRole(role: UserRole): boolean {
  return role === 'BANK_REVIEWER';
}

export function canInviteTeamMembers(role: UserRole): boolean {
  return TEAM_INVITE_ROLES.includes(role);
}

const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
