'use client';

import { useState } from 'react';
import { AddedGuestFields } from './AddedGuestFields';
import { GuestRsvpFields } from './GuestRsvpFields';
import { StepHeading } from './StepHeading';
import { buildSubmitBody, emptyNewGuestDraft, initialGuestDrafts } from '@/lib/rsvp/draft';
import type { GuestDraft, NewGuestDraft, PartyDetail, SubmitRsvpBody } from '@/lib/rsvp/types';

interface PartyFormProps {
  party: PartyDetail;
  notice: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (body: SubmitRsvpBody) => void;
}

export const PartyForm: React.FC<PartyFormProps> = ({
  party,
  notice,
  errorMessage,
  isSubmitting,
  onSubmit,
}) => {
  const [guestDrafts, setGuestDrafts] = useState<Record<string, GuestDraft>>(() =>
    initialGuestDrafts(party),
  );
  const [newGuests, setNewGuests] = useState<NewGuestDraft[]>([]);
  const [message, setMessage] = useState(party.message ?? '');

  const submitBody = buildSubmitBody(party, guestDrafts, newGuests, message);
  const remainingAdditions = party.addedGuestsRemaining - newGuests.length;

  const updateGuestDraft = (guestId: string, draft: GuestDraft) => {
    setGuestDrafts((current) => ({ ...current, [guestId]: draft }));
  };

  const updateNewGuest = (draft: NewGuestDraft) => {
    setNewGuests((current) => current.map((item) => (item.key === draft.key ? draft : item)));
  };

  const removeNewGuest = (key: string) => {
    setNewGuests((current) => current.filter((item) => item.key !== key));
  };

  const addNewGuest = () => {
    setNewGuests((current) => [...current, emptyNewGuestDraft()]);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitBody) {
      onSubmit(submitBody);
    }
  };

  return (
    <form className='w-full' onSubmit={handleSubmit}>
      <StepHeading title={party.displayName} eyebrow='Your RSVP' />

      {notice && (
        <p
          role='status'
          className='mt-6 rounded-md border border-sage-200 bg-sage-100 px-4 py-3 text-sm text-sage-800'
        >
          {notice}
        </p>
      )}

      <div className='mt-6'>
        {party.guests.map((guest) => (
          <GuestRsvpFields
            key={guest.id}
            guest={guest}
            draft={guestDrafts[guest.id]}
            onChange={(draft) => updateGuestDraft(guest.id, draft)}
          />
        ))}
      </div>

      {newGuests.map((draft, index) => (
        <AddedGuestFields
          key={draft.key}
          position={index + 1}
          draft={draft}
          onChange={updateNewGuest}
          onRemove={() => removeNewGuest(draft.key)}
        />
      ))}

      {/*
        Deliberately understated, and never showing a remaining count: adding a
        guest is an exception, not an allowance to spend. The control disappears
        once the party's cap is reached.
      */}
      {remainingAdditions > 0 && (
        <div className='mt-6 text-center'>
          <button
            type='button'
            onClick={addNewGuest}
            className='text-sm text-sage-700 underline transition-colors hover:text-sage-800'
          >
            Add a guest
          </button>
        </div>
      )}

      <div className='mt-8'>
        <label className='text-sm text-sage-700' htmlFor='party-message'>
          Message to the couple (optional)
        </label>
        <textarea
          id='party-message'
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none'
        />
      </div>

      {errorMessage && (
        <p role='alert' className='mt-4 text-sm text-sage-800'>
          {errorMessage}
        </p>
      )}

      <button
        type='submit'
        disabled={submitBody === null || isSubmitting}
        className='mt-6 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800 disabled:opacity-60'
      >
        {isSubmitting ? 'Sending…' : 'Submit RSVP'}
      </button>

      {submitBody === null && (
        <p className='mt-3 text-center text-sm text-sage-700'>
          Please answer for everyone in your party before submitting.
        </p>
      )}
    </form>
  );
};
