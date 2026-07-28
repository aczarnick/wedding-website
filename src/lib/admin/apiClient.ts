/**
 * Browser-side helper for calling `/api/admin/*` routes from client
 * components. Unlike the rest of `src/lib/admin/`, which is Prisma-backed
 * server code, this module must import nothing server-side (no Prisma, no
 * auth, no `node:` builtins) so client components can bundle it.
 */

/** An admin API error, carrying the HTTP status and the API's error envelope. */
export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string | null,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Calls an admin API route and returns its parsed JSON body. A rejected
 * `fetch` (network failure) propagates as-is, so callers can distinguish it
 * from an `AdminRequestError`.
 */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw await toAdminRequestError(response);
  }

  return (await response.json()) as T;
}

async function toAdminRequestError(response: Response): Promise<AdminRequestError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return new AdminRequestError(response.status, null, `Request failed with status ${response.status}`);
  }

  const { error, code, ...details } = (body ?? {}) as {
    error?: string;
    code?: string;
    [key: string]: unknown;
  };

  return new AdminRequestError(
    response.status,
    code ?? null,
    error ?? `Request failed with status ${response.status}`,
    details,
  );
}
