import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  return { onConfirm, user: userEvent.setup() };
};

describe('ConfirmButton', () => {
  it('does not act on the first click', async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Jane Smith?')).toBeInTheDocument();
  });

  it('calls onConfirm once the prompt is confirmed', async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('restores the original button on cancel without acting', async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByText('Remove Jane Smith?')).not.toBeInTheDocument();
  });

  it('disables the confirm button while the write is in flight', async () => {
    const { user } = setup({ isBusy: true });

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
  });

  it('uses a custom confirm label when given one', async () => {
    const { user } = setup({ confirmLabel: 'Yes, delete party' });

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('button', { name: 'Yes, delete party' })).toBeInTheDocument();
  });
});
