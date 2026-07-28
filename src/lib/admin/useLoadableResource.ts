'use client';

import { useCallback, useEffect, useState } from 'react';
import { isSessionExpired, toFailureMessage } from '@/lib/admin/requestError';

interface LoadableResource<T> {
  data: T | null;
  errorMessage: string | null;
  sessionExpired: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads a resource on mount and hands back a `reload` for callers to run after
 * a mutation. `data` stays `null` until the first successful load, so a caller
 * can tell "still loading" from "loaded and empty". `load` must be stable — a
 * module-level function, or one wrapped in `useCallback` — or the mount effect
 * re-runs on every render.
 */
export const useLoadableResource = <T,>(load: () => Promise<T>): LoadableResource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const reload = useCallback(async () => {
    setErrorMessage(null);
    setSessionExpired(false);

    try {
      setData(await load());
    } catch (error) {
      setSessionExpired(isSessionExpired(error));
      setErrorMessage(toFailureMessage(error));
    }
  }, [load]);

  useEffect(() => {
    // Declaring the call in a function *inside* the effect satisfies the React
    // Compiler's `set-state-in-effect` rule. Calling `reload` by reference from
    // the effect body trips it and would need a suppression comment.
    async function runInitialLoad() {
      await reload();
    }

    void runInitialLoad();
  }, [reload]);

  return { data, errorMessage, sessionExpired, reload };
};
