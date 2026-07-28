'use client';

import { useState } from 'react';
import { GuestForm } from './GuestForm';
import { GuestRow } from './GuestRow';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import { createGuest, type GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { GUEST_SOURCE } from '@/lib/enums';

interface GuestListProps {
  partyId: string;
  guests: readonly AdminGuest[];
  addGuestCap: number;
  onChanged: () => void;
}

export const GuestList: React.FC<GuestListProps> = ({
  partyId,
  guests,
  addGuestCap,
  onChanged,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const { isSaving, errorMessage, sessionExpired, run } = useAdminMutation();

  const addedByGuests = guests.filter((guest) => guest.source === GUEST_SOURCE.guestAdded).length;

  const add = (fields: GuestFields) => {
    void run(() => createGuest({ ...fields, partyId }), () => {
      setIsAdding(false);
      onChanged();
    });
  };

  return (
    <div>
      {guests.length === 0 ? (
        <p className='py-2 text-sm text-sage-700/80'>No guests on this invitation yet.</p>
      ) : (
        <ul className='divide-y divide-sage-200/70'>
          {guests.map((guest) => (
            <GuestRow key={guest.id} guest={guest} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <p className='mt-3 text-xs text-sage-700/80'>
        Add-guest cap: {addedByGuests} of {addGuestCap} used
      </p>

      <div className='mt-3'>
        {isAdding ? (
          <>
            <GuestForm
              submitLabel='Save guest'
              isSaving={isSaving}
              errorMessage={sessionExpired ? null : errorMessage}
              onSubmit={add}
              onCancel={() => setIsAdding(false)}
            />
            {sessionExpired && <SessionExpiredNotice className='mt-3' />}
          </>
        ) : (
          <button
            type='button'
            onClick={() => setIsAdding(true)}
            className='rounded-full border border-sage-300 px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
          >
            Add guest
          </button>
        )}
      </div>
    </div>
  );
};
