import { requestJson } from '@/lib/http/apiClient';
import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

export const searchParties = async (query: string): Promise<PartySearchResult[]> => {
  const body = await requestJson<{ parties: PartySearchResult[] }>(
    `/api/parties/search?q=${encodeURIComponent(query)}`,
  );

  return body.parties;
};

export const fetchParty = (partyId: string): Promise<PartyDetail> =>
  requestJson<PartyDetail>(`/api/parties/${partyId}`);

export const submitRsvp = (partyId: string, input: SubmitRsvpBody): Promise<PartyDetail> =>
  requestJson<PartyDetail>(`/api/parties/${partyId}/rsvp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
