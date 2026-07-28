'use client';

import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
import { PartyFields, toAddGuestCap, type PartyFieldValues } from './PartyFields';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import { deleteParty, updateParty } from '@/lib/admin/client';
import type { AdminParty } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';

interface PartyEditFormProps {
  party: AdminParty;
  onSaved: () => void;
  onCancel: () => void;
}

const initialValues = (party: AdminParty): PartyFieldValues => ({
  displayName: party.displayName,
  message: party.message ?? '',
  addGuestCap: String(party.addGuestCap),
});

export const PartyEditForm: React.FC<PartyEditFormProps> = ({ party, onSaved, onCancel }) => {
  const [values, setValues] = useState<PartyFieldValues>(() => initialValues(party));
  const { isSaving, errorMessage, sessionExpired, run } = useAdminMutation();

  const displayName = values.displayName.trim();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (displayName.length === 0 || isSaving) {
      return;
    }

    void run(
      () =>
        updateParty(party.id, {
          displayName,
          message: values.message.trim() || null,
          addGuestCap: toAddGuestCap(values.addGuestCap),
        }),
      onSaved,
    );
  };

  const guestCount = party.guests.length;
  const cascadeWarning = `Remove this party and its ${guestCount} ${
    guestCount === 1 ? 'guest' : 'guests'
  }?`;

  return (
    <form onSubmit={handleSubmit} className='rounded-lg border border-sage-200 bg-white p-4'>
      <PartyFields
        values={values}
        onChange={setValues}
        capHint='How many extra guests this party may add themselves.'
      />

      {sessionExpired ? (
        <SessionExpiredNotice className='mt-3' />
      ) : (
        errorMessage && (
          <p role='alert' data-testid='party-edit-error' className='mt-3 text-sm text-sage-800'>
            {errorMessage}
          </p>
        )
      )}

      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <button
          type='submit'
          disabled={displayName.length === 0 || isSaving}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : 'Save party'}
        </button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Cancel
        </button>

        <span className='ml-auto'>
          <ConfirmButton
            label='Delete party'
            confirmPrompt={cascadeWarning}
            confirmLabel='Yes, delete party'
            isBusy={isSaving}
            onConfirm={() => void run(() => deleteParty(party.id), onSaved)}
          />
        </span>
      </div>
    </form>
  );
};
