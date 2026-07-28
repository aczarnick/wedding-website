'use client';

import { useState } from 'react';
import { PartyFields, toAddGuestCap, type PartyFieldValues } from './PartyFields';
import { createParty, type GuestFields } from '@/lib/admin/client';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { RSVP_STATUS } from '@/lib/enums';

interface NewPartyFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

interface GuestNameRow {
  firstName: string;
  lastName: string;
}

const EMPTY_FIELDS: PartyFieldValues = { displayName: '', message: '', addGuestCap: '' };
const EMPTY_ROW: GuestNameRow = { firstName: '', lastName: '' };
const HALF_FILLED_MESSAGE = 'Every guest needs both a first and a last name.';

const INPUT_CLASSES =
  'w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

const isBlank = (row: GuestNameRow) =>
  row.firstName.trim().length === 0 && row.lastName.trim().length === 0;

const isComplete = (row: GuestNameRow) =>
  row.firstName.trim().length > 0 && row.lastName.trim().length > 0;

const toGuestFields = (row: GuestNameRow): GuestFields => ({
  firstName: row.firstName.trim(),
  lastName: row.lastName.trim(),
  rsvpStatus: RSVP_STATUS.pending,
  songRequest: null,
});

export const NewPartyForm: React.FC<NewPartyFormProps> = ({ onCreated, onCancel }) => {
  const [fields, setFields] = useState<PartyFieldValues>(EMPTY_FIELDS);
  const [rows, setRows] = useState<GuestNameRow[]>([EMPTY_ROW]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const { isSaving, errorMessage, run } = useAdminMutation();

  const displayName = fields.displayName.trim();
  const canSubmit = displayName.length > 0 && !isSaving;

  const updateRow = (index: number, patch: Partial<GuestNameRow>) =>
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const entered = rows.filter((row) => !isBlank(row));

    if (entered.some((row) => !isComplete(row))) {
      setValidationMessage(HALF_FILLED_MESSAGE);
      return;
    }

    setValidationMessage(null);

    void run(
      () =>
        createParty({
          displayName,
          message: fields.message.trim() || null,
          addGuestCap: toAddGuestCap(fields.addGuestCap),
          guests: entered.map(toGuestFields),
        }),
      onCreated,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className='rounded-xl border border-sage-200 bg-white p-5 shadow-sm'
    >
      <h2 className='text-lg text-sage-800'>New party</h2>

      <div className='mt-4'>
        <PartyFields
          values={fields}
          onChange={setFields}
          capHint='Leave blank to use the default from settings.'
        />
      </div>

      <fieldset className='mt-5'>
        <legend className='text-xs text-sage-700'>Guests</legend>

        <ul className='mt-2 grid gap-2'>
          {rows.map((row, index) => (
            <li key={index} className='flex flex-wrap items-center gap-2'>
              <label className='sr-only' htmlFor={`guest-${index}-first`}>
                Guest {index + 1} first name
              </label>
              <input
                id={`guest-${index}-first`}
                type='text'
                placeholder='First name'
                value={row.firstName}
                onChange={(event) => updateRow(index, { firstName: event.target.value })}
                className={`${INPUT_CLASSES} sm:w-40`}
              />

              <label className='sr-only' htmlFor={`guest-${index}-last`}>
                Guest {index + 1} last name
              </label>
              <input
                id={`guest-${index}-last`}
                type='text'
                placeholder='Last name'
                value={row.lastName}
                onChange={(event) => updateRow(index, { lastName: event.target.value })}
                className={`${INPUT_CLASSES} sm:w-40`}
              />

              {rows.length > 1 && (
                <button
                  type='button'
                  onClick={() =>
                    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                  }
                  className='rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800'
                >
                  Remove guest {index + 1}
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          type='button'
          onClick={() => setRows((current) => [...current, EMPTY_ROW])}
          className='mt-3 rounded-full border border-sage-300 px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
        >
          Add another guest
        </button>
      </fieldset>

      {(validationMessage ?? errorMessage) && (
        <p role='alert' data-testid='new-party-error' className='mt-4 text-sm text-sage-800'>
          {validationMessage ?? errorMessage}
        </p>
      )}

      <div className='mt-5 flex items-center gap-3'>
        <button
          type='submit'
          disabled={!canSubmit}
          className='rounded-full bg-sage-700 px-5 py-2 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Creating…' : 'Create party'}
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
