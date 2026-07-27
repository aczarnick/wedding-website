import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyPicker } from './PartyPicker';
import type { PartySearchResult } from '@/lib/rsvp/types';

const MATCHES: PartySearchResult[] = [
  { id: 'p1', displayName: 'The Smith Family', guestFirstNames: ['John', 'Jane'] },
  { id: 'p2', displayName: 'John Smith & Guest', guestFirstNames: ['John', 'Dana'] },
];

describe('PartyPicker', () => {
  it('lists every match with its member first names', () => {
    render(<PartyPicker matches={MATCHES} onSelect={vi.fn()} onStartOver={vi.fn()} />);

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John, Jane')).toBeInTheDocument();
    expect(screen.getByText('John Smith & Guest')).toBeInTheDocument();
    expect(screen.getByText('John, Dana')).toBeInTheDocument();
  });

  it('reports the chosen party id', () => {
    const onSelect = vi.fn();
    render(<PartyPicker matches={MATCHES} onSelect={onSelect} onStartOver={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /John Smith & Guest/ }));

    expect(onSelect).toHaveBeenCalledWith('p2');
  });

  it('offers a way back to the search', () => {
    const onStartOver = vi.fn();
    render(<PartyPicker matches={MATCHES} onSelect={vi.fn()} onStartOver={onStartOver} />);

    fireEvent.click(screen.getByRole('button', { name: /search for a different name/i }));

    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
