'use client';

import { useId, useState } from 'react';
import type { GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { RSVP_STATUS } from '@/lib/enums';

interface GuestFormProps {
  initialGuest?: AdminGuest;
  submitLabel: string;
  isSaving: boolean;
  errorMessage: string | null;
  onSubmit: (fields: GuestFields) => void;
  onCancel: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string;
}

const STATUS_LABELS: Record<string, string> = {
  [RSVP_STATUS.pending]: 'Pending',
  [RSVP_STATUS.attending]: 'Attending',
  [RSVP_STATUS.declined]: 'Declined',
};

const INPUT_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

const initialState = (guest?: AdminGuest): FormState => ({
  firstName: guest?.firstName ?? '',
  lastName: guest?.lastName ?? '',
  rsvpStatus: guest?.rsvpStatus ?? RSVP_STATUS.pending,
  songRequest: guest?.songRequest ?? '',
});

export const GuestForm: React.FC<GuestFormProps> = ({
  initialGuest,
  submitLabel,
  isSaving,
  errorMessage,
  onSubmit,
  onCancel,
}) => {
  const fieldId = useId();
  const [state, setState] = useState<FormState>(() => initialState(initialGuest));

  const firstName = state.firstName.trim();
  const lastName = state.lastName.trim();
  const canSubmit = firstName.length > 0 && lastName.length > 0 && !isSaving;

  const update = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      firstName,
      lastName,
      rsvpStatus: state.rsvpStatus,
      songRequest: state.songRequest.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className='rounded-lg border border-sage-200 bg-white p-4'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-first`}>
            First name
          </label>
          <input
            id={`${fieldId}-first`}
            type='text'
            value={state.firstName}
            onChange={(event) => update({ firstName: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-last`}>
            Last name
          </label>
          <input
            id={`${fieldId}-last`}
            type='text'
            value={state.lastName}
            onChange={(event) => update({ lastName: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-status`}>
            RSVP status
          </label>
          <select
            id={`${fieldId}-status`}
            value={state.rsvpStatus}
            onChange={(event) => update({ rsvpStatus: event.target.value })}
            className={INPUT_CLASSES}
          >
            {Object.values(RSVP_STATUS).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-song`}>
            Song request
          </label>
          <input
            id={`${fieldId}-song`}
            type='text'
            value={state.songRequest}
            onChange={(event) => update({ songRequest: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>
      </div>

      {errorMessage && (
        <p role='alert' data-testid='guest-form-error' className='mt-3 text-sm text-sage-800'>
          {errorMessage}
        </p>
      )}

      <div className='mt-4 flex items-center gap-3'>
        <button
          type='submit'
          disabled={!canSubmit}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
