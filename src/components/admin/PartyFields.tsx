'use client';

import { useId } from 'react';

export interface PartyFieldValues {
  displayName: string;
  message: string;
  addGuestCap: string;
}

interface PartyFieldsProps {
  values: PartyFieldValues;
  onChange: (values: PartyFieldValues) => void;
  capHint: string;
}

const INPUT_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

/**
 * Parses the add-guest cap input. A blank box means "unspecified", which the
 * server resolves to `Settings.defaultAddGuestCap`; that is why the value is
 * held as a string, so an empty field stays distinguishable from `0`.
 */
export const toAddGuestCap = (raw: string): number | undefined => {
  const trimmed = raw.trim();

  return trimmed.length === 0 ? undefined : Number(trimmed);
};

export const PartyFields: React.FC<PartyFieldsProps> = ({ values, onChange, capHint }) => {
  const fieldId = useId();

  const update = (patch: Partial<PartyFieldValues>) => onChange({ ...values, ...patch });

  return (
    <div className='grid gap-3'>
      <div>
        <label className='text-xs text-sage-700' htmlFor={`${fieldId}-name`}>
          Display name
        </label>
        <input
          id={`${fieldId}-name`}
          type='text'
          value={values.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          className={INPUT_CLASSES}
        />
      </div>

      <div>
        <label className='text-xs text-sage-700' htmlFor={`${fieldId}-message`}>
          Message
        </label>
        <textarea
          id={`${fieldId}-message`}
          rows={2}
          value={values.message}
          onChange={(event) => update({ message: event.target.value })}
          className={INPUT_CLASSES}
        />
      </div>

      <div>
        <label className='block text-xs text-sage-700' htmlFor={`${fieldId}-cap`}>
          Add-guest cap
        </label>
        <input
          id={`${fieldId}-cap`}
          type='number'
          min={0}
          max={20}
          value={values.addGuestCap}
          onChange={(event) => update({ addGuestCap: event.target.value })}
          className={`${INPUT_CLASSES} sm:w-32`}
        />
        <p className='mt-1 text-xs text-sage-700/80'>{capHint}</p>
      </div>
    </div>
  );
};
