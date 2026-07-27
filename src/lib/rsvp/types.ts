import type { RsvpStatus } from '@/lib/enums';

/** The two statuses a guest may submit; `pending` is a server-side initial state. */
export type SubmittableRsvpStatus = Exclude<RsvpStatus, 'pending'>;

export interface PartySearchResult {
  id: string;
  displayName: string;
  guestFirstNames: string[];
}

export interface PartyDetailGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
}

export interface PartyDetail {
  id: string;
  displayName: string;
  message: string | null;
  addGuestCap: number;
  addedGuestsRemaining: number;
  rsvpDeadline: string;
  guests: PartyDetailGuest[];
}

export interface SubmitRsvpGuest {
  id: string;
  rsvpStatus: SubmittableRsvpStatus;
  songRequest: string | null;
}

export interface SubmitRsvpNewGuest {
  firstName: string;
  lastName: string;
  rsvpStatus: SubmittableRsvpStatus;
  songRequest: string | null;
}

export interface SubmitRsvpBody {
  message: string | null;
  guests: SubmitRsvpGuest[];
  newGuests: SubmitRsvpNewGuest[];
}

/** One party guest's in-progress answers, before they are submitted. */
export interface GuestDraft {
  rsvpStatus: SubmittableRsvpStatus | null;
  songRequest: string;
}

/** A guest the party is adding, not yet persisted. */
export interface NewGuestDraft {
  /** Stable React key for the draft row. Client-side only; never sent to the server. */
  key: string;
  firstName: string;
  lastName: string;
  rsvpStatus: SubmittableRsvpStatus | null;
  songRequest: string;
}
