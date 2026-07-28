import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestForm } from './GuestForm';
import type { AdminGuest } from '@/lib/admin/projections';

const EXISTING: AdminGuest = {
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'Jane',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: 'September',
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const setup = (props: Partial<React.ComponentProps<typeof GuestForm>> = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  render(
    <GuestForm
      submitLabel='Add guest'
      isSaving={false}
      errorMessage={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );

  return { onSubmit, onCancel };
};

describe('GuestForm', () => {
  it('submits a trimmed new guest defaulting to pending with no song request', () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  John  ' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: ' Smith ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'John',
      lastName: 'Smith',
      rsvpStatus: 'pending',
      songRequest: null,
    });
  });

  it('records an RSVP on the guest’s behalf, including pending', () => {
    const { onSubmit } = setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Jane',
      lastName: 'Smith',
      rsvpStatus: 'declined',
      songRequest: 'September',
    });
    expect(screen.getByLabelText('RSVP status')).toHaveDisplayValue('Declined');
  });

  it('prefills every field from the guest being edited', () => {
    setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    expect(screen.getByLabelText('First name')).toHaveValue('Jane');
    expect(screen.getByLabelText('Last name')).toHaveValue('Smith');
    expect(screen.getByLabelText('Song request')).toHaveValue('September');
  });

  it('clears an emptied song request to null rather than an empty string', () => {
    const { onSubmit } = setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    fireEvent.change(screen.getByLabelText('Song request'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ songRequest: null }));
  });

  it('will not submit without both names', () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add guest' })).toBeDisabled();
  });

  it('renders the server error next to the form', () => {
    setup({ errorMessage: 'Must be between 1 and 100 characters' });

    expect(screen.getByTestId('guest-form-error')).toHaveTextContent(
      'Must be between 1 and 100 characters',
    );
  });

  it('cancels without submitting', () => {
    const { onCancel, onSubmit } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
