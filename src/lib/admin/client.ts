import type { AdminGuest, AdminParty } from '@/lib/admin/projections';
import { requestJson } from '@/lib/http/apiClient';

/** The guest fields an admin may write, on create and update alike. */
export interface GuestFields {
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
}

export interface NewPartyBody {
  displayName: string;
  message: string | null;
  addGuestCap?: number;
  guests: GuestFields[];
}

export interface PartyPatch {
  displayName: string;
  message: string | null;
  addGuestCap?: number;
}

export type ModerationDecision = 'approve' | 'remove';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchParties = async (): Promise<AdminParty[]> => {
  const body = await requestJson<{ parties: AdminParty[] }>('/api/admin/parties');

  return body.parties;
};

export const createParty = (input: NewPartyBody): Promise<AdminParty> =>
  requestJson<AdminParty>('/api/admin/parties', jsonInit('POST', input));

export const updateParty = (partyId: string, input: PartyPatch): Promise<AdminParty> =>
  requestJson<AdminParty>(`/api/admin/parties/${partyId}`, jsonInit('PATCH', input));

export const deleteParty = (partyId: string): Promise<AdminParty> =>
  requestJson<AdminParty>(`/api/admin/parties/${partyId}`, { method: 'DELETE' });

export const createGuest = (input: GuestFields & { partyId: string }): Promise<AdminGuest> =>
  requestJson<AdminGuest>('/api/admin/guests', jsonInit('POST', input));

export const updateGuest = (guestId: string, input: GuestFields): Promise<AdminGuest> =>
  requestJson<AdminGuest>(`/api/admin/guests/${guestId}`, jsonInit('PATCH', input));

export const deleteGuest = (guestId: string): Promise<AdminGuest> =>
  requestJson<AdminGuest>(`/api/admin/guests/${guestId}`, { method: 'DELETE' });

export const fetchFlaggedGuests = async (): Promise<AdminGuest[]> => {
  const body = await requestJson<{ guests: AdminGuest[] }>('/api/admin/guests?flagged=true');

  return body.guests;
};

export const moderateGuest = (
  guestId: string,
  decision: ModerationDecision,
): Promise<AdminGuest> =>
  requestJson<AdminGuest>(
    `/api/admin/guests/${guestId}/moderate`,
    jsonInit('POST', { action: decision }),
  );
