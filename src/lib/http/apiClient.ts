const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_ERROR_MESSAGE =
  'We could not reach the server. Please check your connection and try again.';

/** A failed JSON API call, carrying the server's machine-readable code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toApiError = (status: number, body: unknown): ApiError => {
  const payload: Record<string, unknown> = isRecord(body) ? body : {};
  const { error, code, ...details } = payload;

  return new ApiError(
    status,
    typeof code === 'string' ? code : 'unknown_error',
    typeof error === 'string' ? error : GENERIC_ERROR_MESSAGE,
    details,
  );
};

/** Fetches JSON, mapping every failure mode onto `ApiError`. */
export const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  if (!isRecord(body)) {
    throw new ApiError(response.status, 'unknown_error', GENERIC_ERROR_MESSAGE);
  }

  return body as T;
};
