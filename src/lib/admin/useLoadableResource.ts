'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/http/apiClient';

interface LoadableResource<T> {
  data: T | null;
  errorMessage: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads a resource on mount and hands back a `reload` for callers to run after
 * a mutation. `data` stays `null` until the first successful load, so a caller
 * can tell "still loading" from "loaded and empty". `load` must be stable — a
 * module-level function, or one wrapped in `useCallback` — or the mount effect
 * re-runs on every render.
 */
export const useLoadableResource = <T,>(
  load: () => Promise<T>,
  fallbackMessage: string,
): LoadableResource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setErrorMessage(null);

    try {
      setData(await load());
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : fallbackMessage);
    }
  }, [load, fallbackMessage]);

  useEffect(() => {
    // Declaring the call in a function *inside* the effect satisfies the React
    // Compiler's `set-state-in-effect` rule. Calling `reload` by reference from
    // the effect body trips it and would need a suppression comment.
    async function runInitialLoad() {
      await reload();
    }

    void runInitialLoad();
  }, [reload]);

  return { data, errorMessage, reload };
};
