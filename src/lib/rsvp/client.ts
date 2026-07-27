import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_ERROR_MESSAGE =
  'We could not reach the server. Please check your connection and try again.';

/** A failed call to the guest RSVP API, carrying the server's machine-readable code. */
export class RsvpApiError extends Error {
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
    this.name = 'RsvpApiError';
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

const toApiError = (status: number, body: unknown): RsvpApiError => {
  const payload: Record<string, unknown> = isRecord(body) ? body : {};
  const { error, code, ...details } = payload;

  return new RsvpApiError(
    status,
    typeof code === 'string' ? code : 'unknown_error',
    typeof error === 'string' ? error : GENERIC_ERROR_MESSAGE,
    details,
  );
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new RsvpApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  if (!isRecord(body)) {
    throw new RsvpApiError(response.status, 'unknown_error', GENERIC_ERROR_MESSAGE);
  }

  return body as T;
};

export const searchParties = async (query: string): Promise<PartySearchResult[]> => {
  const body = await request<{ parties: PartySearchResult[] }>(
    `/api/parties/search?q=${encodeURIComponent(query)}`,
  );

  return body.parties;
};

export const fetchParty = (partyId: string): Promise<PartyDetail> =>
  request<PartyDetail>(`/api/parties/${partyId}`);

export const submitRsvp = (partyId: string, input: SubmitRsvpBody): Promise<PartyDetail> =>
  request<PartyDetail>(`/api/parties/${partyId}/rsvp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
