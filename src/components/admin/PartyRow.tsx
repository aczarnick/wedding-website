'use client';

import { GuestList } from './GuestList';
import { PartyEditForm } from './PartyEditForm';
import type { AdminParty } from '@/lib/admin/projections';
import { summarizeGuests, type GuestTally } from '@/lib/admin/partyList';

interface PartyRowProps {
  party: AdminParty;
  isExpanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}

const tallyText = (tally: GuestTally): string => {
  const parts = [`${tally.total} ${tally.total === 1 ? 'guest' : 'guests'}`];

  if (tally.attending > 0) {
    parts.push(`${tally.attending} attending`);
  }

  if (tally.declined > 0) {
    parts.push(`${tally.declined} declined`);
  }

  if (tally.pending > 0) {
    parts.push(`${tally.pending} pending`);
  }

  return parts.join(' · ');
};

export const PartyRow: React.FC<PartyRowProps> = ({
  party,
  isExpanded,
  onToggle,
  onChanged,
}) => {
  const tally = summarizeGuests(party.guests);

  return (
    <li className='border-b border-sage-200/70 last:border-b-0'>
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={isExpanded}
        className='flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-1 py-3 text-left hover:bg-sage-100/60'
      >
        <span aria-hidden='true' className='text-xs text-sage-700'>
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className='text-sage-800'>{party.displayName}</span>
        {tally.flagged > 0 && (
          <span className='rounded-full bg-sage-200 px-2 py-0.5 text-xs text-sage-800'>
            {tally.flagged} awaiting review
          </span>
        )}
        <span className='ml-auto text-xs text-sage-700/80'>{tallyText(tally)}</span>
      </button>

      {isExpanded && (
        <div className='grid gap-4 px-1 pb-5'>
          <PartyEditForm party={party} onSaved={onChanged} onCancel={onToggle} />
          <GuestList
            partyId={party.id}
            guests={party.guests}
            addGuestCap={party.addGuestCap}
            onChanged={onChanged}
          />
        </div>
      )}
    </li>
  );
};
