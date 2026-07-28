import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModerationQueue } from './ModerationQueue';
import { fetchFlaggedGuests, fetchParties, moderateGuest } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  fetchFlaggedGuests: vi.fn(),
  fetchParties: vi.fn(),
  moderateGuest: vi.fn(),
}));

const FLAGGED: AdminGuest = {
  id: 'guest-9',
  partyId: 'party-2',
  firstName: 'Sam',
  lastName: 'Rivera',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'guest_added',
  flaggedForReview: true,
  createdAt: '2026-02-03T00:00:00.000Z',
  updatedAt: '2026-02-03T00:00:00.000Z',
};

const PARTY: AdminParty = {
  id: 'party-2',
  displayName: 'Alex Rivera & Guest',
  message: null,
  addGuestCap: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [FLAGGED],
};

beforeEach(() => {
  vi.mocked(fetchFlaggedGuests).mockReset().mockResolvedValue([FLAGGED]);
  vi.mocked(fetchParties).mockReset().mockResolvedValue([PARTY]);
  vi.mocked(moderateGuest).mockReset().mockResolvedValue(FLAGGED);
});


describe('ModerationQueue', () => {
  it('names the guest and the party that added them', async () => {
    render(<ModerationQueue />);

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByText('Added to Alex Rivera & Guest')).toBeInTheDocument();
  });

  it('states that approving still counts against the add-guest cap', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    expect(
      screen.getByText(
        'Approving keeps this guest counted against the party’s add-guest cap.',
      ),
    ).toBeInTheDocument();
  });

  it('approves without a confirmation step and refreshes', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(moderateGuest).toHaveBeenCalledWith('guest-9', 'approve'));
    await waitFor(() => expect(fetchFlaggedGuests).toHaveBeenCalledTimes(2));
  });

  it('removes only after the confirmation is accepted', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(moderateGuest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(moderateGuest).toHaveBeenCalledWith('guest-9', 'remove'));
  });

  it('shows the empty state when nothing is awaiting review', async () => {
    vi.mocked(fetchFlaggedGuests).mockResolvedValue([]);
    render(<ModerationQueue />);

    expect(await screen.findByText('Nothing is awaiting review.')).toBeInTheDocument();
  });

  it('falls back to a neutral label when the party cannot be resolved', async () => {
    vi.mocked(fetchParties).mockResolvedValue([]);
    render(<ModerationQueue />);

    expect(await screen.findByText('Added to an unknown party')).toBeInTheDocument();
  });

  it('surfaces a guest already resolved elsewhere', async () => {
    vi.mocked(moderateGuest).mockRejectedValue(
      new ApiError(409, 'guest_not_flagged', 'This guest is not awaiting moderation'),
    );
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(screen.getByTestId('moderation-error-guest-9')).toHaveTextContent(
        'This guest is not awaiting moderation',
      ),
    );
  });

  it('surfaces a load failure with a retry', async () => {
    vi.mocked(fetchFlaggedGuests).mockRejectedValueOnce(
      new ApiError(500, 'server_error', 'The queue is unavailable.'),
    );
    render(<ModerationQueue />);

    expect(await screen.findByTestId('moderation-load-error')).toHaveTextContent(
      'The queue is unavailable.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
  });
});
