import { z } from 'zod';
import { normalizeName } from '@/lib/rsvp/policy';

export const MAX_ADD_GUEST_CAP = 20;
export const MAX_NAME_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_048_576;

export const REQUIRED_IMPORT_COLUMNS = [
  'partyDisplayName',
  'firstName',
  'lastName',
] as const;

export const EXPORT_COLUMNS = [
  'partyDisplayName',
  'firstName',
  'lastName',
  'message',
  'addGuestCap',
  'rsvpStatus',
  'songRequest',
  'source',
  'flaggedForReview',
  'partyId',
  'guestId',
] as const;

const CAP_MESSAGE = `addGuestCap must be a whole number between 0 and ${MAX_ADD_GUEST_CAP}`;

/** Leading characters that `csvExport.ts`'s `escape_formulas` guards against. */
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Inverse of the exporter's formula-escape prefix: a leading run of `'`
 * immediately followed by a formula-trigger character is the exporter's own
 * escape, so exactly one is removed. Any other leading apostrophe (including
 * one immediately followed by another apostrophe) is real message content
 * and is left untouched — stripping it would corrupt a message that
 * legitimately starts with `'`.
 */
function stripFormulaEscape(value: string): string {
  let apostrophes = 0;
  while (value[apostrophes] === "'") {
    apostrophes += 1;
  }

  if (apostrophes === 0 || !FORMULA_TRIGGER_CHARS.has(value[apostrophes])) {
    return value;
  }

  return value.slice(1);
}

function requiredName(column: string) {
  return z
    .string()
    .default('')
    .transform(normalizeName)
    .refine((value) => value.length > 0, { message: `${column} is required` })
    .refine((value) => value.length <= MAX_NAME_LENGTH, {
      message: `${column} must be ${MAX_NAME_LENGTH} characters or fewer`,
    });
}

const optionalMessage = z
  .string()
  .default('')
  .transform((value) => value.trim())
  .transform(stripFormulaEscape)
  .refine((value) => value.length <= MAX_MESSAGE_LENGTH, {
    message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
  })
  .transform((value) => (value.length > 0 ? value : null));

const optionalAddGuestCap = z
  .string()
  .default('')
  .transform((value) => value.trim())
  .refine((value) => value === '' || /^\d+$/.test(value), { message: CAP_MESSAGE })
  .refine((value) => value === '' || Number(value) <= MAX_ADD_GUEST_CAP, {
    message: CAP_MESSAGE,
  })
  .transform((value) => (value === '' ? null : Number(value)));

/** Parses one CSV row. Unknown columns are dropped rather than rejected. */
export const importRowSchema = z.object({
  partyDisplayName: requiredName('partyDisplayName'),
  firstName: requiredName('firstName'),
  lastName: requiredName('lastName'),
  message: optionalMessage,
  addGuestCap: optionalAddGuestCap,
});

export type ImportRow = z.infer<typeof importRowSchema>;
