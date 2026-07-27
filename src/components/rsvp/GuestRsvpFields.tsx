import { RSVP_STATUS } from '@/lib/enums';
import { RsvpStatusToggle } from './RsvpStatusToggle';
import type { GuestDraft, PartyDetailGuest } from '@/lib/rsvp/types';

interface GuestRsvpFieldsProps {
  guest: PartyDetailGuest;
  draft: GuestDraft;
  onChange: (draft: GuestDraft) => void;
}

export const GuestRsvpFields: React.FC<GuestRsvpFieldsProps> = ({ guest, draft, onChange }) => {
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const songRequestId = `guest-${guest.id}-song-request`;

  return (
    <div className='border-b border-sage-200 py-5 last:border-b-0'>
      <p className='text-lg text-sage-800'>{fullName}</p>

      <RsvpStatusToggle
        name={`guest-${guest.id}-status`}
        legend={`Will ${fullName} attend?`}
        value={draft.rsvpStatus}
        onChange={(rsvpStatus) => onChange({ ...draft, rsvpStatus })}
      />

      {draft.rsvpStatus === RSVP_STATUS.attending && (
        <div className='mt-3'>
          <label className='text-sm text-sage-700' htmlFor={songRequestId}>
            Song request for {fullName} (optional)
          </label>
          <input
            id={songRequestId}
            type='text'
            maxLength={200}
            value={draft.songRequest}
            onChange={(event) => onChange({ ...draft, songRequest: event.target.value })}
            className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none'
          />
        </div>
      )}
    </div>
  );
};
