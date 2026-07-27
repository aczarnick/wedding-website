import { z } from 'zod';
import { AUDIT_ACTION, RSVP_STATUS } from '@/lib/enums';
import { optionalText, requiredName } from '@/lib/rsvp/schemas';

const AUDIT_ACTIONS = Object.values(AUDIT_ACTION) as [string, ...string[]];
const RSVP_STATUSES = Object.values(RSVP_STATUS) as [string, ...string[]];

const addGuestCap = z.int().min(0).max(20);

const guestFields = {
  firstName: requiredName,
  lastName: requiredName,
  rsvpStatus: z.enum(RSVP_STATUSES).default(RSVP_STATUS.pending),
  songRequest: optionalText(200),
};

function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    });
}

export const createPartySchema = z.object({
  displayName: requiredName,
  message: optionalText(1000),
  addGuestCap: addGuestCap.optional(),
  guests: z.array(z.object(guestFields)).default([]),
});

export const updatePartySchema = nonEmptyPatch({
  displayName: requiredName,
  message: optionalText(1000),
  addGuestCap,
});

export const createGuestSchema = z.object({ partyId: z.uuid(), ...guestFields });

export const updateGuestSchema = nonEmptyPatch({
  firstName: requiredName,
  lastName: requiredName,
  rsvpStatus: z.enum(RSVP_STATUSES),
  songRequest: optionalText(200),
});

export const moderateGuestSchema = z.object({ action: z.enum(['approve', 'remove']) });

export const updateSettingsSchema = nonEmptyPatch({
  rsvpDeadline: z.iso.datetime().transform((value) => new Date(value)),
  defaultAddGuestCap: addGuestCap,
});

export const auditQuerySchema = z.object({
  partyId: z.uuid().optional(),
  guestId: z.uuid().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const guestListQuerySchema = z.object({
  flagged: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
export type ModerateGuestInput = z.infer<typeof moderateGuestSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type GuestListQuery = z.infer<typeof guestListQuerySchema>;
