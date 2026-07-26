import { z } from 'zod';
import { RSVP_STATUS } from '@/lib/enums';
import { normalizeName } from '@/lib/rsvp/policy';

const SUBMITTABLE_STATUSES = [RSVP_STATUS.attending, RSVP_STATUS.declined] as const;

const submittableStatus = z.enum(SUBMITTABLE_STATUSES);

function optionalText(maxLength: number) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || value.length <= maxLength, {
      message: `Must be ${maxLength} characters or fewer`,
    });
}

const requiredName = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 1 && value.length <= 100, {
    message: 'Must be between 1 and 100 characters',
  });

/** Parses the `q` search parameter into a normalized full name. */
export const searchQuerySchema = z
  .string()
  .transform(normalizeName)
  .refine((value) => value.length >= 2, { message: 'Enter at least 2 characters' })
  .refine((value) => value.includes(' '), { message: 'Enter a first and last name' });

/** Parses the full declarative party state a guest submits. */
export const submitRsvpSchema = z.object({
  message: optionalText(1000),
  guests: z
    .array(
      z.object({
        id: z.uuid(),
        rsvpStatus: submittableStatus,
        songRequest: optionalText(200),
      }),
    )
    .min(1),
  newGuests: z
    .array(
      z.object({
        firstName: requiredName,
        lastName: requiredName,
        rsvpStatus: submittableStatus,
        songRequest: optionalText(200),
      }),
    )
    .default([]),
});

export type SubmitRsvpInput = z.infer<typeof submitRsvpSchema>;
