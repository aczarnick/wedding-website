import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewPartyForm } from './NewPartyForm';
import { createParty } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';

vi.mock('@/lib/admin/client', () => ({ createParty: vi.fn() }));

const setup = () => {
  const onCreated = vi.fn();
  const onCancel = vi.fn();

  render(<NewPartyForm onCreated={onCreated} onCancel={onCancel} />);

  return { onCreated, onCancel };
};

beforeEach(() => {
  vi.mocked(createParty).mockReset().mockResolvedValue({
    id: 'party-1',
    displayName: 'The Smith Family',
    message: null,
    addGuestCap: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    guests: [],
  });
});

describe('NewPartyForm', () => {
  it('creates a party with its guests in one call and reports success', async () => {
    const { onCreated } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Guest 1 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another guest' }));
    fireEvent.change(screen.getByLabelText('Guest 2 first name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Guest 2 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith({
        displayName: 'The Smith Family',
        message: null,
        addGuestCap: undefined,
        guests: [
          { firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
          { firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
        ],
      }),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('sends the entered add-guest cap, including zero', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.change(screen.getByLabelText('Add-guest cap'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(expect.objectContaining({ addGuestCap: 0 })),
    );
  });

  it('omits a blank cap so the server default applies', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(
        expect.objectContaining({ addGuestCap: undefined }),
      ),
    );
  });

  it('allows a party with no guests yet', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(expect.objectContaining({ guests: [] })),
    );
  });

  it('refuses to submit without a display name', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    expect(createParty).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create party' })).toBeDisabled();
  });

  it('refuses to submit a half-filled guest row rather than dropping it', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    expect(createParty).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-party-error')).toHaveTextContent(
      'Every guest needs both a first and a last name.',
    );
  });

  it('drops a removed guest row from the payload', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Guest 1 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another guest' }));
    fireEvent.change(screen.getByLabelText('Guest 2 first name'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove guest 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(
        expect.objectContaining({
          guests: [
            { firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
          ],
        }),
      ),
    );
  });

  it('shows the server message and does not report success when the create fails', async () => {
    vi.mocked(createParty).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onCreated } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(screen.getByTestId('new-party-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
