import { RSVP_STATUS } from '@/lib/enums';
import type { SubmittableRsvpStatus } from '@/lib/rsvp/types';

interface RsvpStatusToggleProps {
  name: string;
  legend: string;
  value: SubmittableRsvpStatus | null;
  onChange: (status: SubmittableRsvpStatus) => void;
}

const OPTIONS: { status: SubmittableRsvpStatus; label: string }[] = [
  { status: RSVP_STATUS.attending, label: 'Attending' },
  { status: RSVP_STATUS.declined, label: 'Declined' },
];

export const RsvpStatusToggle: React.FC<RsvpStatusToggleProps> = ({
  name,
  legend,
  value,
  onChange,
}) => (
  <fieldset className='mt-3'>
    <legend className='sr-only'>{legend}</legend>
    <div className='flex gap-3'>
      {OPTIONS.map(({ status, label }) => (
        <label
          key={status}
          className={`flex-1 cursor-pointer rounded-full border px-4 py-2 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sage-700 ${
            value === status
              ? 'border-sage-700 bg-sage-700 text-white'
              : 'border-sage-200 bg-white text-sage-700 hover:border-sage-700'
          }`}
        >
          <input
            type='radio'
            className='sr-only'
            name={name}
            value={status}
            checked={value === status}
            onChange={() => onChange(status)}
          />
          {label}
        </label>
      ))}
    </div>
  </fieldset>
);
