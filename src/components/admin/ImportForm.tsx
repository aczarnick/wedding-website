'use client';

import { useState } from 'react';
import { requestJson, ApiError } from '@/lib/http/apiClient';
import { isSessionExpired, toFailureMessage } from '@/lib/admin/requestError';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import { ImportResult, type ImportOutcome, type RowError } from './ImportResult';

interface ImportSummary {
  partiesCreated: number;
  guestsCreated: number;
}

type SubmitStatus = 'idle' | 'uploading';

const FILE_INPUT_CLASS =
  'mt-2 block w-full text-sm text-sage-800 file:mr-4 file:rounded-lg file:border-0 ' +
  'file:bg-sage-700 file:px-4 file:py-2.5 file:text-white hover:file:bg-sage-800';

function isRowError(value: unknown): value is RowError {
  const candidate = value as RowError | null;

  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.line === 'number' &&
    typeof candidate.reason === 'string'
  );
}

/**
 * `invalid_csv` carries `rowErrors`; `csv_too_large` does not. The shape is
 * checked rather than assumed, so a body that ever stops matching renders as a
 * message-only failure instead of crashing the report.
 */
function toRowErrors(value: unknown): RowError[] | undefined {
  return Array.isArray(value) && value.every(isRowError) ? value : undefined;
}

export const ImportForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setSessionExpired(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      return;
    }

    setStatus('uploading');
    setResult(null);
    setSessionExpired(false);

    try {
      const summary = await requestJson<ImportSummary>('/api/admin/import', {
        method: 'POST',
        body: file,
      });

      setResult({
        status: 'success',
        partiesCreated: summary.partiesCreated,
        guestsCreated: summary.guestsCreated,
      });
    } catch (error) {
      if (isSessionExpired(error)) {
        setSessionExpired(true);
      } else {
        setResult({
          status: 'failure',
          message: toFailureMessage(error),
          rowErrors:
            error instanceof ApiError ? toRowErrors(error.details.rowErrors) : undefined,
        });
      }
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className='mt-3'>
      <form onSubmit={handleSubmit}>
        <label htmlFor='import-file' className='block text-sm text-sage-700'>
          CSV file
          <input
            id='import-file'
            name='import-file'
            type='file'
            accept='.csv,text/csv'
            onChange={handleFileChange}
            className={FILE_INPUT_CLASS}
          />
        </label>

        <button
          type='submit'
          disabled={!file || status === 'uploading'}
          className='mt-5 rounded-lg bg-sage-700 px-4 py-2.5 text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {status === 'uploading' ? 'Importing…' : 'Import'}
        </button>
      </form>

      {sessionExpired && <SessionExpiredNotice className='mt-5' />}

      {result && <ImportResult result={result} />}
    </div>
  );
};
