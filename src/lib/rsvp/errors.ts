import { z, type ZodError } from 'zod';

export type RsvpErrorCode =
  | 'invalid_request'
  | 'invalid_csv'
  | 'csv_too_large'
  | 'rsvp_closed'
  | 'party_not_found'
  | 'party_changed'
  | 'add_guest_cap_exceeded'
  | 'settings_missing';

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

/** A single problem found in the import file, addressed by 1-based file line. */
export interface RowError {
  line: number;
  reason: string;
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

/**
 * Rejects an import, reporting every bad row. The zero counters are always
 * present so a client reads the same two fields on success and on failure.
 * The message counts distinct invalid *lines* rather than error count: one
 * row can fail two rules at once, and "2 invalid rows" would overstate a
 * single bad row.
 */
export function invalidCsv(rowErrors: RowError[]): RsvpError {
  const invalidLineCount = new Set(rowErrors.map((error) => error.line)).size;
  const noun = invalidLineCount === 1 ? 'row' : 'rows';

  return new RsvpError(
    400,
    'invalid_csv',
    `Import rejected: ${invalidLineCount} invalid ${noun}`,
    { rowErrors, partiesCreated: 0, guestsCreated: 0 },
  );
}

export function csvTooLarge(message: string): RsvpError {
  return new RsvpError(413, 'csv_too_large', message, {
    partiesCreated: 0,
    guestsCreated: 0,
  });
}
