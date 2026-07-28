'use client';

import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
import { GuestForm } from './GuestForm';
import { RsvpStatusBadge } from './RsvpStatusBadge';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import { deleteGuest, updateGuest, type GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { GUEST_SOURCE } from '@/lib/enums';

interface GuestRowProps {
  guest: AdminGuest;
  onChanged: () => void;
}

export const GuestRow: React.FC<GuestRowProps> = ({ guest, onChanged }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { isSaving, errorMessage, sessionExpired, run } = useAdminMutation();

  const save = (fields: GuestFields) => {
    void run(() => updateGuest(guest.id, fields), () => {
      setIsEditing(false);
      onChanged();
    });
  };

  const remove = () => {
    void run(() => deleteGuest(guest.id), onChanged);
  };

  if (isEditing) {
    return (
      <li className='py-2'>
        <GuestForm
          initialGuest={guest}
          submitLabel='Save guest'
          isSaving={isSaving}
          errorMessage={sessionExpired ? null : errorMessage}
          onSubmit={save}
          onCancel={() => setIsEditing(false)}
        />
        {sessionExpired && <SessionExpiredNotice className='mt-3' />}
      </li>
    );
  }

  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'>
      <span className='text-sm text-sage-800'>
        {guest.firstName} {guest.lastName}
      </span>

      <RsvpStatusBadge status={guest.rsvpStatus} />

      {guest.source === GUEST_SOURCE.guestAdded && (
        <span className='text-xs text-sage-700/80'>Added by guest</span>
      )}

      {guest.flaggedForReview && (
        <span className='rounded-full bg-sage-200 px-2 py-0.5 text-xs text-sage-800'>
          Awaiting review
        </span>
      )}

      {guest.songRequest && (
        <span className='text-xs text-sage-700/80'>♪ {guest.songRequest}</span>
      )}

      <span className='ml-auto flex items-center gap-1'>
        <button
          type='button'
          onClick={() => setIsEditing(true)}
          className='rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Edit
        </button>
        <ConfirmButton
          label='Remove'
          confirmPrompt={`Remove ${guest.firstName} ${guest.lastName}?`}
          isBusy={isSaving}
          onConfirm={remove}
        />
      </span>

      {sessionExpired ? (
        <SessionExpiredNotice className='w-full' />
      ) : (
        errorMessage && (
          <p
            role='alert'
            data-testid={`guest-row-error-${guest.id}`}
            className='w-full text-sm text-sage-800'
          >
            {errorMessage}
          </p>
        )
      )}
    </li>
  );
};
