'use client';

import { useState } from 'react';
import { StepHeading } from './StepHeading';

interface PartyLookupProps {
  isSearching: boolean;
  errorMessage: string | null;
  showNotFound: boolean;
  onSearch: (query: string) => void;
}

export const PartyLookup: React.FC<PartyLookupProps> = ({
  isSearching,
  errorMessage,
  showNotFound,
  onSearch,
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <section className='w-full'>
      <StepHeading title='RSVP' eyebrow='Find your invitation' />

      <form className='mt-8' onSubmit={handleSubmit}>
        <label className='text-sm text-sage-700' htmlFor='party-search'>
          Enter your first and last name
        </label>
        <input
          id='party-search'
          type='text'
          autoComplete='name'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sage-800 focus:border-sage-700 focus:outline-none'
        />

        {errorMessage && (
          <p role='alert' className='mt-2 text-sm text-sage-800'>
            {errorMessage}
          </p>
        )}

        <button
          type='submit'
          disabled={isSearching}
          className='mt-5 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800 disabled:opacity-60'
        >
          {isSearching ? 'Searching…' : 'Find my invitation'}
        </button>
      </form>

      {showNotFound && (
        <p role='status' className='mt-6 text-center text-sm text-sage-700'>
          We could not find that name on our guest list. Please double-check the spelling, or
          contact the bride or groom and we will get you sorted.
        </p>
      )}
    </section>
  );
};
