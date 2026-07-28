import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmButton } from './ConfirmButton';

const setup = (props: Partial<React.ComponentProps<typeof ConfirmButton>> = {}) => {
  const onConfirm = vi.fn();

  render(
    <ConfirmButton
      label='Remove'
      confirmPrompt='Remove Jane Smith?'
      onConfirm={onConfirm}
      {...props}
    />,
  );

  return { onConfirm };
};

const clickButton = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('ConfirmButton', () => {
  it('does not act on the first click', () => {
    const { onConfirm } = setup();

    clickButton('Remove');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Jane Smith?')).toBeInTheDocument();
  });

  it('calls onConfirm once the prompt is confirmed', () => {
    const { onConfirm } = setup();

    clickButton('Remove');
    clickButton('Yes, remove');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('restores the original button on cancel without acting', () => {
    const { onConfirm } = setup();

    clickButton('Remove');
    clickButton('Cancel');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByText('Remove Jane Smith?')).not.toBeInTheDocument();
  });

  it('disables the confirm button while the write is in flight', () => {
    setup({ isBusy: true });

    clickButton('Remove');

    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
  });

  it('uses a custom confirm label when given one', () => {
    setup({ confirmLabel: 'Yes, delete party' });

    clickButton('Remove');

    expect(screen.getByRole('button', { name: 'Yes, delete party' })).toBeInTheDocument();
  });
});
