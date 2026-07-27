import type { PartySearchResult } from '@/lib/rsvp/types';

interface PartyPickerProps {
  matches: PartySearchResult[];
  onSelect: (partyId: string) => void;
  onStartOver: () => void;
}

export const PartyPicker: React.FC<PartyPickerProps> = ({ matches, onSelect, onStartOver }) => (
  <section className='w-full max-w-md'>
    <h1 className='text-center text-3xl text-sage-800'>Which one is you?</h1>
    <p className='mt-3 text-center text-sm text-sage-700'>
      We found more than one match. Pick the group you belong to.
    </p>

    <ul className='mt-8 space-y-3'>
      {matches.map((match) => (
        <li key={match.id}>
          <button
            type='button'
            onClick={() => onSelect(match.id)}
            className='w-full rounded-md border border-sage-200 bg-white px-4 py-3 text-left transition-colors hover:border-sage-700'
          >
            <span className='block text-sage-800'>{match.displayName}</span>
            <span className='block text-sm text-sage-700'>{match.guestFirstNames.join(', ')}</span>
          </button>
        </li>
      ))}
    </ul>

    <button
      type='button'
      onClick={onStartOver}
      className='mt-6 w-full text-sm text-sage-700 underline'
    >
      Search for a different name
    </button>
  </section>
);
