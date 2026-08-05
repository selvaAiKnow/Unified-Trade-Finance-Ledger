import { describe, expect, it } from 'vitest';

import { ASSIGNABLE_ROLE_OPTIONS, roleLabel } from './roles';

describe('roleLabel', () => {
  it('labels the three admin-per-org roles as Superuser', () => {
    expect(roleLabel('EXPORTER_ADMIN')).toBe('Superuser');
    expect(roleLabel('BANK_REVIEWER')).toBe('Superuser');
    expect(roleLabel('BUYER')).toBe('Superuser');
  });

  it('labels the remaining roles with their existing readable names', () => {
    expect(roleLabel('DOCS_COMPLIANCE')).toBe('Docs & Compliance');
    expect(roleLabel('FINANCE')).toBe('Finance');
    expect(roleLabel('VIEWER')).toBe('Viewer');
    expect(roleLabel('PLATFORM_ADMIN')).toBe('Platform Admin');
  });
});

describe('ASSIGNABLE_ROLE_OPTIONS', () => {
  it('offers every org-level role with a distinct label, excluding platform admin', () => {
    expect(ASSIGNABLE_ROLE_OPTIONS).toEqual([
      { value: 'EXPORTER_ADMIN', label: 'Exporter Admin' },
      { value: 'BUYER', label: 'Buyer' },
      { value: 'BANK_REVIEWER', label: 'Bank Reviewer' },
      { value: 'DOCS_COMPLIANCE', label: 'Docs & Compliance' },
      { value: 'FINANCE', label: 'Finance' },
      { value: 'VIEWER', label: 'Viewer' },
    ]);
  });
});
