import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RsvpConfirmation } from './RsvpConfirmation';
import type { PartyDetail } from '@/lib/rsvp/types';

const PARTY: PartyDetail = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: 'Can not wait!',
  addGuestCap: 5,
  addedGuestsRemaining: 1,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending', songRequest: 'September', source: 'admin' },
    { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'declined', songRequest: null, source: 'admin' },
  ],
};

describe('RsvpConfirmation', () => {
  it('summarizes who is attending and who declined', () => {
    render(<RsvpConfirmation party={PARTY} onEdit={vi.fn()} />);

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('echoes the message back', () => {
    render(<RsvpConfirmation party={PARTY} onEdit={vi.fn()} />);

    expect(screen.getByText('Can not wait!')).toBeInTheDocument();
  });

  it('lists an added guest without singling them out for review', () => {
    render(
      <RsvpConfirmation
        party={{
          ...PARTY,
          guests: [{ ...PARTY.guests[0], source: 'guest_added' }],
        }}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument();
  });

  it('reopens the editor on request', () => {
    const onEdit = vi.fn();
    render(<RsvpConfirmation party={PARTY} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit your response/i }));

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
