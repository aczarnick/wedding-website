import Link from 'next/link';
import { GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import type { PartyDetail, PartyDetailGuest } from '@/lib/rsvp/types';

interface RsvpConfirmationProps {
  party: PartyDetail;
  onEdit: () => void;
}

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
      <p className='text-sm uppercase tracking-[0.2em] text-sage-700/70'>{heading}</p>
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
  const hasAddedGuests = party.guests.some((guest) => guest.source === GUEST_SOURCE.guestAdded);

  return (
    <section className='w-full max-w-md'>
      <h1 className='text-center text-3xl text-sage-800'>Thank you!</h1>
      <p className='mt-3 text-center text-sm text-sage-700'>
        We have your RSVP for <span className='text-sage-800'>{party.displayName}</span>. You can
        come back and change it any time before the deadline.
      </p>

      <GuestList heading='Attending' guests={attending} />
      <GuestList heading='Unable to attend' guests={declined} />

      {party.message && (
        <div className='mt-6'>
          <p className='text-sm uppercase tracking-[0.2em] text-sage-700/70'>Your message</p>
          <p className='mt-2 text-sage-800'>{party.message}</p>
        </div>
      )}

      {hasAddedGuests && (
        <p className='mt-6 text-sm text-sage-700'>
          Guests you added are reviewed by the couple before they are final.
        </p>
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
