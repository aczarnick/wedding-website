'use client';

import { ConfirmButton } from './ConfirmButton';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import { moderateGuest } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';

interface ModerationCardProps {
  guest: AdminGuest;
  partyName: string;
  onResolved: () => void;
}

const addedOn = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export const ModerationCard: React.FC<ModerationCardProps> = ({
  guest,
  partyName,
  onResolved,
}) => {
  const { isSaving, errorMessage, sessionExpired, run } = useAdminMutation();

  return (
    <li className='rounded-xl border border-sage-200 bg-white p-5'>
      <p className='text-sage-800'>
        {guest.firstName} {guest.lastName}
      </p>
      <p className='mt-1 text-sm text-sage-700/80'>Added to {partyName}</p>
      <p className='mt-1 text-xs text-sage-700/80'>Added {addedOn(guest.createdAt)}</p>

      <p className='mt-3 text-xs text-sage-700/80'>
        Approving keeps this guest counted against the party&rsquo;s add-guest cap.
      </p>

      {sessionExpired ? (
        <SessionExpiredNotice className='mt-3' />
      ) : (
        errorMessage && (
          <p
            role='alert'
            data-testid={`moderation-error-${guest.id}`}
            className='mt-3 text-sm text-sage-800'
          >
            {errorMessage}
          </p>
        )
      )}

      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <button
          type='button'
          disabled={isSaving}
          onClick={() => void run(() => moderateGuest(guest.id, 'approve'), onResolved)}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : 'Approve'}
        </button>

        <ConfirmButton
          label='Remove'
          confirmPrompt={`Remove ${guest.firstName} ${guest.lastName} from ${partyName}?`}
          isBusy={isSaving}
          onConfirm={() => void run(() => moderateGuest(guest.id, 'remove'), onResolved)}
        />
      </div>
    </li>
  );
};
