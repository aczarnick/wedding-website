import { describe, expect, it } from 'vitest';
import { resolveAdminCallbackPath } from './callbackPath';

describe('resolveAdminCallbackPath', () => {
  it('reduces the absolute URL the proxy writes to its path', () => {
    expect(resolveAdminCallbackPath('http://localhost:3000/admin')).toBe('/admin');
  });

  it('keeps a nested admin path and its query string', () => {
    expect(resolveAdminCallbackPath('http://localhost:3000/admin/guests?flagged=1')).toBe(
      '/admin/guests?flagged=1',
    );
  });

  it('accepts an already-relative admin path', () => {
    expect(resolveAdminCallbackPath('/admin/settings')).toBe('/admin/settings');
  });

  it('discards the origin of an off-site absolute URL', () => {
    expect(resolveAdminCallbackPath('https://evil.example/admin')).toBe('/admin');
  });

  it('rejects a protocol-relative URL rather than honouring its path', () => {
    expect(resolveAdminCallbackPath('//evil.example/admin/guests')).toBe('/admin');
  });

  it('rejects a path outside the admin console', () => {
    expect(resolveAdminCallbackPath('/rsvp')).toBe('/admin');
  });

  it('rejects a path that merely starts with the admin prefix', () => {
    expect(resolveAdminCallbackPath('/adminx')).toBe('/admin');
  });

  it('falls back when the parameter is absent or empty', () => {
    expect(resolveAdminCallbackPath(undefined)).toBe('/admin');
    expect(resolveAdminCallbackPath('')).toBe('/admin');
  });

  it('falls back when the value cannot be parsed as a URL', () => {
    expect(resolveAdminCallbackPath('http://[')).toBe('/admin');
  });
});
