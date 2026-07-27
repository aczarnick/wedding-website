import Link from 'next/link';
import { StepHeading } from './StepHeading';
import { RSVP_STATUS } from '@/lib/enums';
import type { PartyDetail, PartyDetailGuest } from '@/lib/rsvp/types';

interface RsvpConfirmationProps {
  party: PartyDetail;
  onEdit: () => void;
}

const SECTION_LABEL_CLASS = 'text-sm uppercase tracking-[0.2em] text-sage-700/70';

const fullName = (guest: PartyDetailGuest): string => `${guest.firstName} ${guest.lastName}`;

const GuestList: React.FC<{ heading: string; guests: PartyDetailGuest[] }> = ({
  heading,
  guests,
}) => {
  if (guests.length === 0) {
    return null;
  }

  return (
    <div className='mt-6'>
      <p className={SECTION_LABEL_CLASS}>{heading}</p>
      <ul className='mt-2 space-y-1'>
        {guests.map((guest) => (
          <li key={guest.id} className='text-sage-800'>
            {fullName(guest)}
            {guest.songRequest && (
              <span className='block text-sm text-sage-700'>♪ {guest.songRequest}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const RsvpConfirmation: React.FC<RsvpConfirmationProps> = ({ party, onEdit }) => {
  const attending = party.guests.filter((guest) => guest.rsvpStatus === RSVP_STATUS.attending);
  const declined = party.guests.filter((guest) => guest.rsvpStatus === RSVP_STATUS.declined);

  return (
    <section className='w-full'>
      <StepHeading title='Thank you!' eyebrow='RSVP received' />
      <p className='mt-5 text-center text-sm text-sage-700'>
        We have your RSVP for <span className='text-sage-800'>{party.displayName}</span>. You can
        come back and change it any time before the deadline.
      </p>

      <GuestList heading='Attending' guests={attending} />
      <GuestList heading='Unable to attend' guests={declined} />

      {party.message && (
        <div className='mt-6'>
          <p className={SECTION_LABEL_CLASS}>Your message</p>
          <p className='mt-2 text-sage-800'>{party.message}</p>
        </div>
      )}

      <button
        type='button'
        onClick={onEdit}
        className='mt-8 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800'
      >
        Edit your response
      </button>

      <Link href='/' className='mt-4 block text-center text-sm text-sage-700 underline'>
        Back to the wedding site
      </Link>
    </section>
  );
};
