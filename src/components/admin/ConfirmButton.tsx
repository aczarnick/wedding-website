'use client';

import { useState } from 'react';

interface ConfirmButtonProps {
  label: string;
  confirmPrompt: string;
  confirmLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
}

const ACTION_CLASSES =
  'rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800 disabled:opacity-60';

/**
 * Two-step destructive action. Deliberately not `window.confirm`: a native
 * dialog blocks every subsequent browser event, which breaks browser-driven
 * verification, and it cannot be asserted without stubbing a global. The
 * prompt stays open while the write is in flight so a failure remains visible
 * next to the error message the caller renders.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  label,
  confirmPrompt,
  confirmLabel = 'Yes, remove',
  isBusy = false,
  onConfirm,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button type='button' onClick={() => setIsConfirming(true)} className={ACTION_CLASSES}>
        {label}
      </button>
    );
  }

  return (
    <span className='flex flex-wrap items-center gap-2'>
      <span className='text-xs text-sage-800'>{confirmPrompt}</span>
      <button
        type='button'
        disabled={isBusy}
        onClick={onConfirm}
        className='rounded-md bg-sage-700 px-2 py-1 text-xs text-white hover:bg-sage-800 disabled:opacity-60'
      >
        {isBusy ? 'Removing…' : confirmLabel}
      </button>
      <button type='button' onClick={() => setIsConfirming(false)} className={ACTION_CLASSES}>
        Cancel
      </button>
    </span>
  );
};
