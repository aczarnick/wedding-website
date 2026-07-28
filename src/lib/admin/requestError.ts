import { AdminRequestError } from '@/lib/admin/apiClient';

/**
 * Browser-side, like `apiClient`. A failed admin request is either an
 * `AdminRequestError` carrying the API's own message, or a rejected `fetch`
 * that never reached the server.
 */
export function toFailureMessage(error: unknown): string {
  return error instanceof AdminRequestError ? error.message : 'Could not reach the server.';
}

/**
 * A 401 means the session expired while the console was open. `src/proxy.ts`
 * redirects unauthenticated *page* navigations, so this only ever surfaces on a
 * background request, where the admin needs to be told rather than moved.
 */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof AdminRequestError && error.status === 401;
}
