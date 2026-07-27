import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PartyForm } from './PartyForm';
import type { PartyDetail } from '@/lib/rsvp/types';

const party = (overrides: Partial<PartyDetail> = {}): PartyDetail => ({
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 2,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
    { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
  ],
  ...overrides,
});

const renderForm = (overrides: Partial<React.ComponentProps<typeof PartyForm>> = {}) => {
  const onSubmit = vi.fn();
  render(
    <PartyForm
      party={party()}
      notice={null}
      errorMessage={null}
      isSubmitting={false}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return onSubmit;
};

const answer = (guestName: string, choice: 'Attending' | 'Declined') => {
  const row = screen.getByText(guestName).closest('div');
  if (!row) throw new Error(`No row found for ${guestName}`);
  fireEvent.click(within(row).getByRole('radio', { name: choice }));
};

describe('PartyForm', () => {
  it('shows the party name and every guest', () => {
    renderForm();

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('preselects stored answers and prefills the message', () => {
    renderForm({
      party: party({
        message: 'See you there',
        guests: [
          { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending', songRequest: 'September', source: 'admin' },
        ],
      }),
    });

    expect(screen.getByRole('radio', { name: 'Attending' })).toBeChecked();
    expect(screen.getByLabelText(/song request/i)).toHaveValue('September');
    expect(screen.getByLabelText(/message to the couple/i)).toHaveValue('See you there');
  });

  it('keeps Submit disabled until every guest is answered', () => {
    renderForm();
    const submit = screen.getByRole('button', { name: /submit rsvp/i });

    expect(submit).toBeDisabled();
    expect(screen.getByText(/please answer for everyone/i)).toBeInTheDocument();

    answer('John Smith', 'Attending');
    expect(submit).toBeDisabled();

    answer('Jane Smith', 'Declined');
    expect(submit).toBeEnabled();
    expect(screen.queryByText(/please answer for everyone/i)).not.toBeInTheDocument();
  });

  it('submits the whole party state', () => {
    const onSubmit = renderForm();

    answer('John Smith', 'Attending');
    answer('Jane Smith', 'Declined');
    fireEvent.change(screen.getByLabelText(/message to the couple/i), {
      target: { value: 'Can not wait' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      message: 'Can not wait',
      guests: [
        { id: 'g1', rsvpStatus: 'attending', songRequest: null },
        { id: 'g2', rsvpStatus: 'declined', songRequest: null },
      ],
      newGuests: [],
    });
  });

  it('counts down the remaining additions and hides the control at the cap', () => {
    renderForm();
    const addButton = () => screen.queryByRole('button', { name: /add a guest/i });

    expect(addButton()).toHaveTextContent('2 left');

    fireEvent.click(addButton()!);
    expect(addButton()).toHaveTextContent('1 left');

    fireEvent.click(addButton()!);
    expect(addButton()).not.toBeInTheDocument();
  });

  it('never offers to add a guest when no additions remain', () => {
    renderForm({ party: party({ addedGuestsRemaining: 0 }) });

    expect(screen.queryByRole('button', { name: /add a guest/i })).not.toBeInTheDocument();
  });

  it('removes a draft guest and restores its slot', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: /add a guest/i }));
    expect(screen.getByText('Additional guest 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove additional guest 1' }));

    expect(screen.queryByText('Additional guest 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a guest/i })).toHaveTextContent('2 left');
  });

  it('blocks submission until an added guest is complete', () => {
    renderForm();
    answer('John Smith', 'Attending');
    answer('Jane Smith', 'Attending');

    fireEvent.click(screen.getByRole('button', { name: /add a guest/i }));

    expect(screen.getByRole('button', { name: /submit rsvp/i })).toBeDisabled();
  });

  it('warns that added guests are reviewed by the couple', () => {
    renderForm();

    expect(screen.getByText(/reviewed by the couple/i)).toBeInTheDocument();
  });

  it('renders a notice and an error when given them', () => {
    renderForm({ notice: 'Your party was updated', errorMessage: 'Something went wrong' });

    expect(screen.getByRole('status')).toHaveTextContent('Your party was updated');
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('disables Submit while a submission is in flight', () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });
});
