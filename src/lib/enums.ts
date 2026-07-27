export const RSVP_STATUS = {
  pending: 'pending',
  attending: 'attending',
  declined: 'declined',
} as const;
export type RsvpStatus = (typeof RSVP_STATUS)[keyof typeof RSVP_STATUS];

export const GUEST_SOURCE = {
  admin: 'admin',
  guestAdded: 'guest_added',
} as const;
export type GuestSource = (typeof GUEST_SOURCE)[keyof typeof GUEST_SOURCE];

export const ACTOR_TYPE = {
  guest: 'guest',
  admin: 'admin',
} as const;
export type ActorType = (typeof ACTOR_TYPE)[keyof typeof ACTOR_TYPE];

export const AUDIT_ACTION = {
  partyCreated: 'party_created',
  partyUpdated: 'party_updated',
  partyDeleted: 'party_deleted',
  guestCreated: 'guest_created',
  guestUpdated: 'guest_updated',
  guestDeleted: 'guest_deleted',
  rsvpSubmitted: 'rsvp_submitted',
  guestAdded: 'guest_added',
  guestModerated: 'guest_moderated',
  settingsUpdated: 'settings_updated',
  import: 'import',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
