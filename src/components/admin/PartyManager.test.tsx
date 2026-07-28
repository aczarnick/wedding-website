import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartyManager } from './PartyManager';
import { deleteParty, fetchParties } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  fetchParties: vi.fn(),
  createParty: vi.fn(),
  updateParty: vi.fn(),
  deleteParty: vi.fn(),
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  deleteGuest: vi.fn(),
}));

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const SMITHS: AdminParty = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [guest({}), guest({ id: 'guest-2', firstName: 'Jane', rsvpStatus: 'pending' })],
};

const CHENS: AdminParty = {
  id: 'party-2',
  displayName: 'The Chen Family',
  message: null,
  addGuestCap: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [
    guest({ id: 'guest-3', partyId: 'party-2', firstName: 'Wei', lastName: 'Chen', rsvpStatus: 'declined' }),
  ],
};

beforeEach(() => {
  vi.mocked(fetchParties).mockReset().mockResolvedValue([SMITHS, CHENS]);
  vi.mocked(deleteParty).mockReset().mockResolvedValue(SMITHS);
});


describe('PartyManager', () => {
  it('lists every party with its guest tally once loaded', async () => {
    render(<PartyManager />);

    expect(await screen.findByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.getByText('2 guests · 1 attending · 1 pending')).toBeInTheDocument();
    expect(screen.getByText('1 guest · 1 declined')).toBeInTheDocument();
  });

  it('filters by the search box across party and guest names', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('Search parties and guests'), { target: { value: 'wei' } });

    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.queryByText('The Smith Family')).not.toBeInTheDocument();
  });

  it('filters by RSVP status', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });

    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.queryByText('The Smith Family')).not.toBeInTheDocument();
  });

  it('reports when nothing matches the current search', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('Search parties and guests'), { target: { value: 'nobody' } });

    expect(screen.getByText('No parties match this search.')).toBeInTheDocument();
  });

  it('reveals a party’s guests when its row is expanded', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /The Smith Family/ }));

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('The Smith Family');
  });

  it('re-fetches the list after a party is deleted', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.click(screen.getByRole('button', { name: /The Smith Family/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete party' }));

    await waitFor(() => expect(fetchParties).toHaveBeenCalledTimes(2));
  });

  it('opens the create form and closes it again on cancel', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.click(screen.getByRole('button', { name: 'New party' }));
    expect(screen.getByRole('heading', { name: 'New party' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'New party' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no parties at all', async () => {
    vi.mocked(fetchParties).mockResolvedValue([]);
    render(<PartyManager />);

    expect(await screen.findByText('No parties yet. Create the first one.')).toBeInTheDocument();
  });

  it('surfaces a load failure with a retry that re-fetches', async () => {
    vi.mocked(fetchParties).mockRejectedValueOnce(
      new ApiError(500, 'server_error', 'The guest list is unavailable.'),
    );
    render(<PartyManager />);

    expect(await screen.findByTestId('party-list-error')).toHaveTextContent(
      'The guest list is unavailable.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('The Smith Family')).toBeInTheDocument();
  });
});
