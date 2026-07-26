import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminEmail } from '@/lib/auth/allowlist';

function withAllowlist(value: string | undefined) {
  vi.stubEnv('ADMIN_EMAIL', value ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAdminEmail', () => {
  it('accepts the single allowlisted address', () => {
    withAllowlist('admin@example.com');
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });

  it('accepts any address in a multi-entry list', () => {
    withAllowlist('one@example.com,two@example.com');
    expect(isAdminEmail('two@example.com')).toBe(true);
  });

  it('ignores surrounding whitespace in the list and the input', () => {
    withAllowlist('  one@example.com ,  two@example.com  ');
    expect(isAdminEmail(' two@example.com ')).toBe(true);
  });

  it('compares case-insensitively', () => {
    withAllowlist('Admin@Example.COM');
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });

  it('rejects an address absent from a populated list', () => {
    withAllowlist('one@example.com');
    expect(isAdminEmail('intruder@example.com')).toBe(false);
  });

  it('denies everyone when the allowlist is unset', () => {
    withAllowlist(undefined);
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('denies everyone when the allowlist is empty or only separators', () => {
    withAllowlist(' , , ');
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('rejects an empty address even when the list contains an empty entry', () => {
    withAllowlist('one@example.com,');
    expect(isAdminEmail('')).toBe(false);
  });
});
