import { StepHeading } from './StepHeading';
import type { PartySearchResult } from '@/lib/rsvp/types';

interface PartyPickerProps {
  matches: PartySearchResult[];
  onSelect: (partyId: string) => void;
  onStartOver: () => void;
}

export const PartyPicker: React.FC<PartyPickerProps> = ({ matches, onSelect, onStartOver }) => (
  <section className='w-full'>
    <StepHeading title='Which group is yours?' eyebrow='More than one match' />
    <p className='mt-5 text-center text-sm text-sage-700'>
      Your name is on more than one invitation. Pick the group you belong to.
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
