import { ApiError } from '@/lib/http/apiClient';

/**
 * Browser-side. Every failed admin request arrives as an `ApiError` — including
 * an unreachable server, which the transport maps rather than rethrowing — so the
 * fallback here only covers a genuinely unexpected throw.
 */
export function toFailureMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

/**
 * A 401 means the session expired while the console was open. `src/proxy.ts`
 * redirects unauthenticated *page* navigations, so this only ever surfaces on a
 * background request, where the admin needs to be told rather than moved.
 */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
