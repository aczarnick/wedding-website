import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RsvpStatusToggle } from './RsvpStatusToggle';

const renderToggle = (value: 'attending' | 'declined' | null, onChange = vi.fn()) => {
  render(
    <RsvpStatusToggle name='status-g1' legend='Will John Smith attend?' value={value} onChange={onChange} />,
  );
  return onChange;
};

describe('RsvpStatusToggle', () => {
  it('offers exactly Attending and Declined', () => {
    renderToggle(null);

    expect(screen.getByRole('radio', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Declined' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('checks neither option when unanswered', () => {
    renderToggle(null);

    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
  });

  it('checks the current value', () => {
    renderToggle('declined');

    expect(screen.getByRole('radio', { name: 'Declined' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Attending' })).not.toBeChecked();
  });

  it('reports the chosen status', () => {
    const onChange = renderToggle(null);

    fireEvent.click(screen.getByRole('radio', { name: 'Attending' }));

    expect(onChange).toHaveBeenCalledWith('attending');
  });
});
