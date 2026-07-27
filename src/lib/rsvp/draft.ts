import { RSVP_STATUS } from '@/lib/enums';
import type {
  GuestDraft,
  NewGuestDraft,
  PartyDetail,
  SubmitRsvpBody,
  SubmitRsvpGuest,
  SubmitRsvpNewGuest,
  SubmittableRsvpStatus,
} from '@/lib/rsvp/types';

const SUBMITTABLE_STATUSES = new Set<string>([RSVP_STATUS.attending, RSVP_STATUS.declined]);

/**
 * Narrows a stored status to one a guest may submit. `pending` — and any value
 * a later migration introduces — becomes `null`, which the form renders as
 * unanswered rather than guessing on the guest's behalf.
 */
export const toSubmittableStatus = (status: string): SubmittableRsvpStatus | null =>
  SUBMITTABLE_STATUSES.has(status) ? (status as SubmittableRsvpStatus) : null;

/** Seeds one draft per party guest from their currently stored answers. */
export const initialGuestDrafts = (party: PartyDetail): Record<string, GuestDraft> =>
  Object.fromEntries(
    party.guests.map((guest) => [
      guest.id,
      {
        rsvpStatus: toSubmittableStatus(guest.rsvpStatus),
        songRequest: guest.songRequest ?? '',
      },
    ]),
  );

export const emptyNewGuestDraft = (): NewGuestDraft => ({
  key: crypto.randomUUID(),
  firstName: '',
  lastName: '',
  rsvpStatus: null,
  songRequest: '',
});

const resolveSongRequest = (draft: GuestDraft | NewGuestDraft): string | null => {
  if (draft.rsvpStatus !== RSVP_STATUS.attending) {
    return null;
  }

  const trimmed = draft.songRequest.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Builds the submit payload, or `null` when the draft is incomplete. One
 * function decides both whether Submit is enabled and what it sends, so the
 * button state and the request body cannot disagree.
 */
export const buildSubmitBody = (
  party: PartyDetail,
  guestDrafts: Record<string, GuestDraft>,
  newGuests: NewGuestDraft[],
  message: string,
): SubmitRsvpBody | null => {
  const guests: SubmitRsvpGuest[] = [];

  for (const guest of party.guests) {
    const draft = guestDrafts[guest.id];

    if (!draft || draft.rsvpStatus === null) {
      return null;
    }

    guests.push({
      id: guest.id,
      rsvpStatus: draft.rsvpStatus,
      songRequest: resolveSongRequest(draft),
    });
  }

  const addedGuests: SubmitRsvpNewGuest[] = [];

  for (const draft of newGuests) {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();

    if (draft.rsvpStatus === null || firstName.length === 0 || lastName.length === 0) {
      return null;
    }

    addedGuests.push({
      firstName,
      lastName,
      rsvpStatus: draft.rsvpStatus,
      songRequest: resolveSongRequest(draft),
    });
  }

  const trimmedMessage = message.trim();

  return {
    message: trimmedMessage.length > 0 ? trimmedMessage : null,
    guests,
    newGuests: addedGuests,
  };
};
