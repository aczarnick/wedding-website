'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/http/apiClient';

const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

interface AdminMutation {
  isSaving: boolean;
  errorMessage: string | null;
  run: (action: () => Promise<unknown>, onSuccess: () => void) => Promise<void>;
}

/**
 * Drives one admin write: tracks the in-flight flag, renders the server's
 * message on failure, and calls `onSuccess` only when the write committed.
 */
export const useAdminMutation = (): AdminMutation => {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, onSuccess: () => void) => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await action();
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, errorMessage, run };
};
