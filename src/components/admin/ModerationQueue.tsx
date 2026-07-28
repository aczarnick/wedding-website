'use client';

import { ModerationCard } from './ModerationCard';
import { fetchFlaggedGuests, fetchParties } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useLoadableResource } from '@/lib/admin/useLoadableResource';

const LOAD_ERROR_MESSAGE = 'We could not load the moderation queue. Please try again.';
const UNKNOWN_PARTY = 'an unknown party';

interface QueueData {
  flagged: AdminGuest[];
  partyNames: Record<string, string>;
}

/**
 * Declared at module scope so its identity is stable across renders, which is
 * what `useLoadableResource` requires of its loader. The queue needs both
 * endpoints: the flagged-guest payload carries only `partyId`, and the question
 * a moderator is answering is which party added this person.
 */
const loadQueue = async (): Promise<QueueData> => {
  const [flagged, parties] = await Promise.all([fetchFlaggedGuests(), fetchParties()]);

  return {
    flagged,
    partyNames: Object.fromEntries(parties.map((party) => [party.id, party.displayName])),
  };
};

export const ModerationQueue: React.FC = () => {
  const { data, errorMessage, reload } = useLoadableResource(loadQueue, LOAD_ERROR_MESSAGE);

  if (errorMessage) {
    return (
      <div>
        <p role='alert' data-testid='moderation-load-error' className='text-sm text-sage-800'>
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

  if (data === null) {
    return <p className='text-sm text-sage-700/80'>Loading the queue…</p>;
  }

  if (data.flagged.length === 0) {
    return <p className='text-sm text-sage-700/80'>Nothing is awaiting review.</p>;
  }

  return (
    <ul className='grid gap-4'>
      {data.flagged.map((guest) => (
        <ModerationCard
          key={guest.id}
          guest={guest}
          partyName={data.partyNames[guest.partyId] ?? UNKNOWN_PARTY}
          onResolved={() => void reload()}
        />
      ))}
    </ul>
  );
};
