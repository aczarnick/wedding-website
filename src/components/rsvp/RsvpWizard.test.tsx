import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RsvpWizard } from './RsvpWizard';
import { RsvpApiError, fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import type { PartyDetail } from '@/lib/rsvp/types';

vi.mock('@/lib/rsvp/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rsvp/client')>('@/lib/rsvp/client');
  return {
    RsvpApiError: actual.RsvpApiError,
    searchParties: vi.fn(),
    fetchParty: vi.fn(),
    submitRsvp: vi.fn(),
  };
});

const searchPartiesMock = vi.mocked(searchParties);
const fetchPartyMock = vi.mocked(fetchParty);
const submitRsvpMock = vi.mocked(submitRsvp);

const PARTY: PartyDetail = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 2,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
  ],
};

const search = (name = 'John Smith') => {
  fireEvent.change(screen.getByLabelText(/first and last name/i), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /find my invitation/i }));
};

const answer = (guestName: string, choice: 'Attending' | 'Declined') => {
  const row = screen.getByText(guestName).closest('div');
  if (!row) throw new Error(`No row found for ${guestName}`);
  fireEvent.click(within(row).getByRole('radio', { name: choice }));
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RsvpWizard', () => {
  it('starts on the lookup form', () => {
    render(<RsvpWizard />);

    expect(screen.getByLabelText(/first and last name/i)).toBeInTheDocument();
  });

  it('skips the picker when exactly one party matches', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('button', { name: /submit rsvp/i })).toBeInTheDocument();
    expect(fetchPartyMock).toHaveBeenCalledWith(PARTY.id);
  });

  it('shows the picker for several matches and opens the chosen party', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: 'p1', displayName: 'The Smith Family', guestFirstNames: ['John', 'Jane'] },
      { id: 'p2', displayName: 'John Smith & Guest', guestFirstNames: ['John', 'Dana'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    render(<RsvpWizard />);

    search();

    fireEvent.click(await screen.findByRole('button', { name: /John Smith & Guest/ }));

    await waitFor(() => expect(fetchPartyMock).toHaveBeenCalledWith('p2'));
    expect(await screen.findByRole('button', { name: /submit rsvp/i })).toBeInTheDocument();
  });

  it('shows the not-found state when nothing matches', async () => {
    searchPartiesMock.mockResolvedValue([]);
    render(<RsvpWizard />);

    search('Nobody Here');

    expect(await screen.findByText(/contact the bride or groom/i)).toBeInTheDocument();
  });

  it('surfaces a search validation error inline', async () => {
    searchPartiesMock.mockRejectedValue(
      new RsvpApiError(400, 'invalid_request', 'Enter a first and last name'),
    );
    render(<RsvpWizard />);

    search('John');

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a first and last name');
  });

  it('goes to the closed page when the search reports the deadline has passed', async () => {
    searchPartiesMock.mockRejectedValue(
      new RsvpApiError(403, 'rsvp_closed', 'RSVPs are closed.', {
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('goes to the closed page when opening the party reports the deadline has passed', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockRejectedValue(
      new RsvpApiError(403, 'rsvp_closed', 'RSVPs are closed.', {
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('goes to the closed page when submitting reports the deadline has passed', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(403, 'rsvp_closed', 'RSVPs are closed.', {
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('confirms a successful submit and can reopen the editor', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockResolvedValue({
      ...PARTY,
      guests: [{ ...PARTY.guests[0], rsvpStatus: 'attending' }],
    });
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('heading', { name: /thank you/i })).toBeInTheDocument();
    expect(submitRsvpMock).toHaveBeenCalledWith(PARTY.id, {
      message: null,
      guests: [{ id: 'g1', rsvpStatus: 'attending', songRequest: null }],
      newGuests: [],
    });

    fireEvent.click(screen.getByRole('button', { name: /edit your response/i }));

    expect(await screen.findByRole('button', { name: /submit rsvp/i })).toBeInTheDocument();
  });

  it('reloads the party and warns when it changed underneath', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    const refreshed: PartyDetail = {
      ...PARTY,
      guests: [
        ...PARTY.guests,
        { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
      ],
    };
    fetchPartyMock.mockResolvedValueOnce(PARTY).mockResolvedValueOnce(refreshed);
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(409, 'party_changed', 'Your party changed.'),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/updated by the couple/i);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit rsvp/i })).toBeDisabled();
  });

  it('reloads the party and warns when the add-guest cap changed underneath', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValueOnce(PARTY).mockResolvedValueOnce(PARTY);
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(409, 'add_guest_cap_exceeded', 'This party can add at most 2 guests.', {
        cap: 2,
        remaining: 0,
      }),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /changed how many guests you can add/i,
    );
    expect(screen.getByRole('button', { name: /submit rsvp/i })).toBeDisabled();
  });

  it('keeps the draft when the conflict refetch fails for an unrelated reason', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock
      .mockResolvedValueOnce(PARTY)
      .mockRejectedValueOnce(new RsvpApiError(500, 'server_error', 'Something broke over there.'));
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(409, 'party_changed', 'Your party changed.'),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole('radio', { name: 'Attending' })).toBeChecked();
    expect(screen.getByRole('button', { name: /submit rsvp/i })).not.toBeDisabled();
  });

  it('returns to lookup when the party has disappeared', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockRejectedValue(
      new RsvpApiError(404, 'party_not_found', 'Party not found'),
    );
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    expect(screen.getByLabelText(/first and last name/i)).toBeInTheDocument();
  });

  it('returns to lookup when submitting reports the party is gone', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(404, 'party_not_found', 'Party not found'),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    expect(screen.getByLabelText(/first and last name/i)).toBeInTheDocument();
  });

  it('keeps the draft and shows a retry message when the network drops', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockRejectedValue(new RsvpApiError(0, 'network_error', 'We could not reach the server.'));
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole('radio', { name: 'Attending' })).toBeChecked();
  });
});
