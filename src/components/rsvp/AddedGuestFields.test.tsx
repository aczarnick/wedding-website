import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddedGuestFields } from './AddedGuestFields';
import { emptyNewGuestDraft } from '@/lib/rsvp/draft';
import type { NewGuestDraft } from '@/lib/rsvp/types';

const draftWith = (overrides: Partial<NewGuestDraft> = {}): NewGuestDraft => ({
  ...emptyNewGuestDraft(),
  ...overrides,
});

describe('AddedGuestFields', () => {
  it('labels the row by its position', () => {
    render(
      <AddedGuestFields position={2} draft={draftWith()} onChange={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('Additional guest 2')).toBeInTheDocument();
  });

  it('reports first and last name edits', () => {
    const onChange = vi.fn();
    const draft = draftWith();
    render(
      <AddedGuestFields position={1} draft={draft} onChange={onChange} onRemove={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Rivera' } });

    expect(onChange).toHaveBeenNthCalledWith(1, { ...draft, firstName: 'Sam' });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...draft, lastName: 'Rivera' });
  });

  it('shows the song request only once the added guest is attending', () => {
    const { rerender } = render(
      <AddedGuestFields position={1} draft={draftWith()} onChange={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();

    rerender(
      <AddedGuestFields
        position={1}
        draft={draftWith({ rsvpStatus: 'attending' })}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/song request/i)).toBeInTheDocument();
  });

  it('removes the row on request', () => {
    const onRemove = vi.fn();
    render(
      <AddedGuestFields position={1} draft={draftWith()} onChange={vi.fn()} onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove additional guest 1' }));

    expect(onRemove).toHaveBeenCalledOnce();
  });
});
