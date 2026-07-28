import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartyEditForm } from './PartyEditForm';
import { deleteParty, updateParty } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({ updateParty: vi.fn(), deleteParty: vi.fn() }));

const PARTY: AdminParty = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: 'So glad you can come',
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [
    {
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
    },
  ],
};

const setup = (party: AdminParty = PARTY) => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();

  render(<PartyEditForm party={party} onSaved={onSaved} onCancel={onCancel} />);

  return { onSaved, onCancel };
};

beforeEach(() => {
  vi.mocked(updateParty).mockReset().mockResolvedValue(PARTY);
  vi.mocked(deleteParty).mockReset().mockResolvedValue(PARTY);
});

describe('PartyEditForm', () => {
  it('prefills the party fields', () => {
    setup();

    expect(screen.getByLabelText('Display name')).toHaveValue('The Smith Family');
    expect(screen.getByLabelText('Message')).toHaveValue('So glad you can come');
    expect(screen.getByLabelText('Add-guest cap')).toHaveValue(2);
  });

  it('patches the changed fields and reports success', async () => {
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smiths' } });
    fireEvent.change(screen.getByLabelText('Add-guest cap'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(updateParty).toHaveBeenCalledWith('party-1', {
        displayName: 'The Smiths',
        message: 'So glad you can come',
        addGuestCap: 4,
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('clears an emptied message to null', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(updateParty).toHaveBeenCalledWith('party-1', expect.objectContaining({ message: null })),
    );
  });

  it('names the guest cascade in the delete confirmation and deletes only once accepted', async () => {
    const { onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));
    expect(screen.getByText('Remove this party and its 1 guest?')).toBeInTheDocument();
    expect(deleteParty).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete party' }));

    await waitFor(() => expect(deleteParty).toHaveBeenCalledWith('party-1'));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('pluralizes the cascade warning', () => {
    setup({ ...PARTY, guests: [...PARTY.guests, ...PARTY.guests] });

    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));

    expect(screen.getByText('Remove this party and its 2 guests?')).toBeInTheDocument();
  });

  it('shows the server message when the save fails', async () => {
    vi.mocked(updateParty).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(screen.getByTestId('party-edit-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
