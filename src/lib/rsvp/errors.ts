import { z, type ZodError } from 'zod';

export type RsvpErrorCode =
  | 'invalid_request'
  | 'rsvp_closed'
  | 'party_not_found'
  | 'party_changed'
  | 'add_guest_cap_exceeded'
  | 'settings_missing'
  | 'guest_not_found'
  | 'guest_not_flagged';

/** An error carrying the HTTP status and machine-readable code to return. */
export class RsvpError extends Error {
  readonly status: number;
  readonly code: RsvpErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: RsvpErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'RsvpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Renders an `RsvpError` as a JSON response. Anything else is rethrown rather
 * than masked, so an unexpected failure surfaces as a 500 instead of a
 * plausible-looking error body.
 */
export function errorResponse(error: unknown): Response {
  if (!(error instanceof RsvpError)) {
    throw error;
  }

  return Response.json(
    { error: error.message, code: error.code, ...error.details },
    { status: error.status },
  );
}

/** Converts a schema failure into a 400 carrying the first useful message. */
export function invalidRequest(error: ZodError): RsvpError {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const message = formErrors[0] ?? Object.values(fieldErrors).flat()[0] ?? 'Invalid request';
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return new RsvpError(400, 'invalid_request', message, hasFieldErrors ? { fieldErrors } : {});
}
