import { RSVP_STATUS } from '@/lib/enums';
import { RsvpStatusToggle } from './RsvpStatusToggle';
import type { NewGuestDraft } from '@/lib/rsvp/types';

interface AddedGuestFieldsProps {
  position: number;
  draft: NewGuestDraft;
  onChange: (draft: NewGuestDraft) => void;
  onRemove: () => void;
}

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

export const AddedGuestFields: React.FC<AddedGuestFieldsProps> = ({
  position,
  draft,
  onChange,
  onRemove,
}) => {
  const label = `Additional guest ${position}`;
  const firstNameId = `new-guest-${draft.key}-first-name`;
  const lastNameId = `new-guest-${draft.key}-last-name`;
  const songRequestId = `new-guest-${draft.key}-song-request`;

  return (
    <div className='mt-5 rounded-md border border-sage-200 bg-white/60 p-4'>
      <div className='flex items-center justify-between'>
        <p className='text-sage-800'>{label}</p>
        <button type='button' onClick={onRemove} className='text-sm text-sage-700 underline'>
          Remove {label.toLowerCase()}
        </button>
      </div>

      <div className='mt-3 flex flex-col gap-3 md:flex-row'>
        <div className='flex-1'>
          <label className='text-sm text-sage-700' htmlFor={firstNameId}>
            First name
          </label>
          <input
            id={firstNameId}
            type='text'
            maxLength={100}
            value={draft.firstName}
            onChange={(event) => onChange({ ...draft, firstName: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <div className='flex-1'>
          <label className='text-sm text-sage-700' htmlFor={lastNameId}>
            Last name
          </label>
          <input
            id={lastNameId}
            type='text'
            maxLength={100}
            value={draft.lastName}
            onChange={(event) => onChange({ ...draft, lastName: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <RsvpStatusToggle
        name={`new-guest-${draft.key}-status`}
        legend={`Will ${label.toLowerCase()} attend?`}
        value={draft.rsvpStatus}
        onChange={(rsvpStatus) => onChange({ ...draft, rsvpStatus })}
      />

      {draft.rsvpStatus === RSVP_STATUS.attending && (
        <div className='mt-3'>
          <label className='text-sm text-sage-700' htmlFor={songRequestId}>
            Song request for {label.toLowerCase()} (optional)
          </label>
          <input
            id={songRequestId}
            type='text'
            maxLength={200}
            value={draft.songRequest}
            onChange={(event) => onChange({ ...draft, songRequest: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      )}
    </div>
  );
};
