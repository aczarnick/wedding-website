import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuestList } from './GuestList';
import { createGuest, deleteGuest, updateGuest } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  deleteGuest: vi.fn(),
}));

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'Jane',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const ADDED = guest({
  id: 'guest-2',
  firstName: 'Sam',
  lastName: 'Plus-One',
  rsvpStatus: 'pending',
  source: 'guest_added',
  flaggedForReview: true,
});

const setup = (guests: AdminGuest[] = [guest({}), ADDED]) => {
  const onChanged = vi.fn();

  render(<GuestList partyId='party-1' guests={guests} addGuestCap={2} onChanged={onChanged} />);

  return { onChanged };
};

beforeEach(() => {
  vi.mocked(createGuest).mockReset().mockResolvedValue(guest({}));
  vi.mocked(updateGuest).mockReset().mockResolvedValue(guest({}));
  vi.mocked(deleteGuest).mockReset().mockResolvedValue(guest({}));
});

describe('GuestList', () => {
  it('lists each guest with its RSVP status', () => {
    setup();

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Sam Plus-One')).toBeInTheDocument();
    expect(screen.getByText('attending')).toBeInTheDocument();
  });

  it('marks a guest-added plus-one that is awaiting review', () => {
    setup();

    expect(screen.getByText('Added by guest')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
  });

  it('reports the add-guest cap and how much of it is used', () => {
    setup();

    expect(screen.getByText('Add-guest cap: 1 of 2 used')).toBeInTheDocument();
  });

  it('shows an empty state when the party has no guests', () => {
    setup([]);

    expect(screen.getByText('No guests on this invitation yet.')).toBeInTheDocument();
  });

  it('creates a guest against this party and refreshes', async () => {
    const { onChanged } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(createGuest).toHaveBeenCalledWith({
        partyId: 'party-1',
        firstName: 'New',
        lastName: 'Guest',
        rsvpStatus: 'pending',
        songRequest: null,
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('patches an edited guest by id and refreshes', async () => {
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(updateGuest).toHaveBeenCalledWith('guest-1', {
        firstName: 'Jane',
        lastName: 'Smith',
        rsvpStatus: 'declined',
        songRequest: null,
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('deletes a guest only after the confirmation is accepted', async () => {
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(deleteGuest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(deleteGuest).toHaveBeenCalledWith('guest-1'));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps the form open and shows the server message when a write fails', async () => {
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onChanged } = setup([]);

    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(screen.getByTestId('guest-form-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  // GuestRow owns its own error paragraph, on a different code path from the
  // add-guest form above. Without this test a failed delete renders nothing.
  it('shows the row’s own error when a delete fails, and does not refresh', async () => {
    vi.mocked(deleteGuest).mockRejectedValue(
      new ApiError(404, 'guest_not_found', 'Guest not found'),
    );
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() =>
      expect(screen.getByTestId('guest-row-error-guest-1')).toHaveTextContent('Guest not found'),
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});
