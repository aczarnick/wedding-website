'use client';

import { useState } from 'react';
import { isSessionExpired, toFailureMessage } from '@/lib/admin/requestError';

interface AdminMutation {
  isSaving: boolean;
  errorMessage: string | null;
  sessionExpired: boolean;
  run: (action: () => Promise<unknown>, onSuccess: () => void) => Promise<void>;
}

/**
 * Drives one admin write: tracks the in-flight flag, renders the server's
 * message on failure, and calls `onSuccess` only when the write committed.
 */
export const useAdminMutation = (): AdminMutation => {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const run = async (action: () => Promise<unknown>, onSuccess: () => void) => {
    setIsSaving(true);
    setErrorMessage(null);
    setSessionExpired(false);

    try {
      await action();
      onSuccess();
    } catch (error) {
      setSessionExpired(isSessionExpired(error));
      setErrorMessage(toFailureMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, errorMessage, sessionExpired, run };
};
