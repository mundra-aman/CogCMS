import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('account controls', () => {
  it('exposes the self-service password endpoint from the admin shell', () => {
    const shell = readFileSync(
      new URL('../../components/admin/admin-shell.tsx', import.meta.url),
      'utf8',
    );
    const form = readFileSync(
      new URL('../../components/admin/change-password-form.tsx', import.meta.url),
      'utf8',
    );

    expect(shell).toContain("import { ChangePasswordForm } from './change-password-form';");
    expect(shell).toContain('<ChangePasswordForm />');
    expect(form).toContain("fetch('/api/admin/session'");
    expect(form).toContain("method: 'PUT'");
    expect(form).toContain('autoComplete="current-password"');
    expect(form).toContain('autoComplete="new-password"');
  });
});
