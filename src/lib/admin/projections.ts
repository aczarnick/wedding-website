export interface AdminGuest {
  id: string;
  partyId: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
  flaggedForReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminParty {
  id: string;
  displayName: string;
  message: string | null;
  addGuestCap: number;
  createdAt: string;
  updatedAt: string;
  guests: AdminGuest[];
}

export interface PartyFields {
  displayName: string;
  message: string | null;
  addGuestCap: number;
}

export interface GuestRow {
  id: string;
  partyId: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
  flaggedForReview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartyRow {
  id: string;
  displayName: string;
  message: string | null;
  addGuestCap: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Projects a guest row for admin responses and audit snapshots alike. */
export function toAdminGuest(row: GuestRow): AdminGuest {
  return {
    id: row.id,
    partyId: row.partyId,
    firstName: row.firstName,
    lastName: row.lastName,
    rsvpStatus: row.rsvpStatus,
    songRequest: row.songRequest,
    source: row.source,
    flaggedForReview: row.flaggedForReview,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminParty(row: PartyRow, guests: readonly GuestRow[]): AdminParty {
  return {
    id: row.id,
    displayName: row.displayName,
    message: row.message,
    addGuestCap: row.addGuestCap,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    guests: guests.map(toAdminGuest),
  };
}

/** The party-level fields a change-log entry records, without the guest list. */
export function toPartyFields(row: PartyRow): PartyFields {
  return { displayName: row.displayName, message: row.message, addGuestCap: row.addGuestCap };
}
