import { describe, expect, it } from 'vitest';

import { roleLabel } from './roles';

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
  });
});
