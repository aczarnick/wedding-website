'use client';

import { useState } from 'react';
import { NewPartyForm } from './NewPartyForm';
import { PartyRow } from './PartyRow';
import { fetchParties } from '@/lib/admin/client';
import { ALL_STATUSES, filterParties } from '@/lib/admin/partyList';
import { useLoadableResource } from '@/lib/admin/useLoadableResource';
import { RSVP_STATUS } from '@/lib/enums';

const LOAD_ERROR_MESSAGE = 'We could not load the guest list. Please try again.';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_STATUSES, label: 'All statuses' },
  { value: RSVP_STATUS.attending, label: 'Attending' },
  { value: RSVP_STATUS.declined, label: 'Declined' },
  { value: RSVP_STATUS.pending, label: 'Pending' },
];

const CONTROL_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

export const PartyManager: React.FC = () => {
  const {
    data: parties,
    errorMessage,
    reload,
  } = useLoadableResource(fetchParties, LOAD_ERROR_MESSAGE);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreated = () => {
    setIsCreating(false);
    void reload();
  };

  if (errorMessage) {
    return (
      <div>
        <p role='alert' data-testid='party-list-error' className='text-sm text-sage-800'>
          {errorMessage}
        </p>
        <button
          type='button'
          onClick={() => void reload()}
          className='mt-3 rounded-full border border-sage-300 px-4 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
        >
          Try again
        </button>
      </div>
    );
  }

  if (parties === null) {
    return <p className='text-sm text-sage-700/80'>Loading the guest list…</p>;
  }

  const visible = filterParties(parties, { query, status });

  return (
    <div>
      <div className='flex flex-wrap items-end gap-4'>
        <div className='min-w-56 flex-1'>
          <label className='text-xs text-sage-700' htmlFor='party-search'>
            Search parties and guests
          </label>
          <input
            id='party-search'
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={CONTROL_CLASSES}
          />
        </div>

        <div className='w-40'>
          <label className='text-xs text-sage-700' htmlFor='party-status'>
            RSVP status
          </label>
          <select
            id='party-status'
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={CONTROL_CLASSES}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!isCreating && (
          <button
            type='button'
            onClick={() => setIsCreating(true)}
            className='rounded-full bg-sage-700 px-5 py-2 text-sm text-white hover:bg-sage-800'
          >
            New party
          </button>
        )}
      </div>

      {isCreating && (
        <div className='mt-6'>
          <NewPartyForm onCreated={handleCreated} onCancel={() => setIsCreating(false)} />
        </div>
      )}

      <p className='mt-6 text-xs text-sage-700/80'>
        {visible.length} of {parties.length} {parties.length === 1 ? 'party' : 'parties'}
      </p>

      {parties.length === 0 && (
        <p className='mt-4 text-sm text-sage-700/80'>No parties yet. Create the first one.</p>
      )}

      {parties.length > 0 && visible.length === 0 && (
        <p className='mt-4 text-sm text-sage-700/80'>No parties match this search.</p>
      )}

      <ul className='mt-2'>
        {visible.map((party) => (
          <PartyRow
            key={party.id}
            party={party}
            isExpanded={expandedPartyId === party.id}
            onToggle={() =>
              setExpandedPartyId((current) => (current === party.id ? null : party.id))
            }
            onChanged={() => void reload()}
          />
        ))}
      </ul>
    </div>
  );
};
