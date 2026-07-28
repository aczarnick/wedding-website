'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin/apiClient';
import { isSessionExpired, toFailureMessage } from '@/lib/admin/requestError';
import { AUDIT_ACTION_LABELS } from '@/constants/admin';
import { AuditEntry } from './AuditEntry';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import type { AuditEntryView } from '@/lib/admin/audit';

const PAGE_SIZE = 50;

interface AuditLogResponse {
  entries: AuditEntryView[];
  total: number;
}

type FetchStatus = 'idle' | 'loading';

const SELECT_CLASS =
  'mt-2 block w-full max-w-xs rounded-lg border border-sage-200 bg-white px-4 py-2.5 ' +
  'text-sage-800 outline-none focus:border-sage-700';

const PAGE_BUTTON_CLASS =
  'rounded-lg border border-sage-200 px-3 py-1.5 text-sm text-sage-800 disabled:opacity-40';

function buildQuery(action: string, offset: number): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });

  if (action) {
    params.set('action', action);
  }

  return params.toString();
}

export const AuditLogViewer: React.FC = () => {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<AuditEntryView[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchEntries = async () => {
      setStatus('loading');
      setErrorMessage(null);
      setSessionExpired(false);

      try {
        const query = buildQuery(action, offset);
        const response = await adminFetch<AuditLogResponse>(`/api/admin/audit?${query}`);
        if (cancelled) return;

        setEntries(response.entries);
        setTotal(response.total);
      } catch (error) {
        if (cancelled) return;

        if (isSessionExpired(error)) {
          setSessionExpired(true);
        } else {
          setErrorMessage(toFailureMessage(error));
        }
      } finally {
        if (!cancelled) {
          setStatus('idle');
        }
      }
    };

    fetchEntries();

    return () => {
      cancelled = true;
    };
  }, [action, offset]);

  const handleActionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setAction(event.target.value);
    setOffset(0);
  };

  const hasFailed = sessionExpired || errorMessage !== null;
  const showEntries = !hasFailed && status === 'idle' && entries.length > 0;

  return (
    <div>
      <label htmlFor='audit-action-filter' className='block text-sm text-sage-700'>
        Action
        <select
          id='audit-action-filter'
          value={action}
          onChange={handleActionChange}
          className={SELECT_CLASS}
        >
          <option value=''>All actions</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {sessionExpired && <SessionExpiredNotice className='mt-5' />}

      {!sessionExpired && errorMessage && (
        <p role='alert' className='mt-5 text-sm text-red-700'>
          {errorMessage}
        </p>
      )}

      {!hasFailed && status === 'loading' && (
        <p role='status' className='mt-5 text-sm text-sage-700/80'>
          Loading…
        </p>
      )}

      {!hasFailed && status === 'idle' && entries.length === 0 && (
        <p className='mt-5 text-sm text-sage-700/80'>No changes to show.</p>
      )}

      {showEntries && (
        <>
          <ul className='mt-5 flex flex-col gap-3'>
            {entries.map((entry) => (
              <li key={entry.id}>
                <AuditEntry entry={entry} />
              </li>
            ))}
          </ul>

          <div className='mt-4 flex flex-wrap items-center gap-x-4 gap-y-3'>
            <p className='text-sm text-sage-700/80'>
              {offset + 1}–{offset + entries.length} of {total}
            </p>

            <div className='ml-auto flex gap-3'>
              <button
                type='button'
                disabled={offset === 0}
                onClick={() => setOffset((current) => Math.max(current - PAGE_SIZE, 0))}
                className={PAGE_BUTTON_CLASS}
              >
                Newer
              </button>
              <button
                type='button'
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                className={PAGE_BUTTON_CLASS}
              >
                Older
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
