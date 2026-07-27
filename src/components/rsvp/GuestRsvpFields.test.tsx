import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestRsvpFields } from './GuestRsvpFields';
import type { GuestDraft, PartyDetailGuest } from '@/lib/rsvp/types';

const GUEST: PartyDetailGuest = {
  id: 'g1',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'admin',
};

const renderFields = (draft: GuestDraft, onChange = vi.fn()) => {
  render(<GuestRsvpFields guest={GUEST} draft={draft} onChange={onChange} />);
  return onChange;
};

describe('GuestRsvpFields', () => {
  it('shows the guest full name', () => {
    renderFields({ rsvpStatus: null, songRequest: '' });

    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('hides the song request before the guest has answered', () => {
    renderFields({ rsvpStatus: null, songRequest: '' });

    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();
  });

  it('hides the song request when the guest declines', () => {
    renderFields({ rsvpStatus: 'declined', songRequest: '' });

    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();
  });

  it('shows the song request once the guest is attending', () => {
    renderFields({ rsvpStatus: 'attending', songRequest: 'September' });

    expect(screen.getByLabelText(/song request/i)).toHaveValue('September');
  });

  it('reports a status change without discarding the typed song', () => {
    const onChange = renderFields({ rsvpStatus: 'attending', songRequest: 'September' });

    fireEvent.click(screen.getByRole('radio', { name: 'Declined' }));

    expect(onChange).toHaveBeenCalledWith({ rsvpStatus: 'declined', songRequest: 'September' });
  });

  it('reports a song request change', () => {
    const onChange = renderFields({ rsvpStatus: 'attending', songRequest: '' });

    fireEvent.change(screen.getByLabelText(/song request/i), { target: { value: 'Dancing Queen' } });

    expect(onChange).toHaveBeenCalledWith({ rsvpStatus: 'attending', songRequest: 'Dancing Queen' });
  });
});
