'use client';

import { useEffect, useState } from 'react';
import { requestJson } from '@/lib/http/apiClient';
import { isSessionExpired, toFailureMessage } from '@/lib/admin/requestError';
import { SessionExpiredNotice } from './SessionExpiredNotice';
import type { AdminSettings } from '@/lib/admin/settings';

type LoadStatus = 'loading' | 'idle';
type SaveStatus = 'idle' | 'saving';

const FIELD_CLASS =
  'mt-2 block w-full max-w-xs rounded-lg border border-sage-200 bg-white px-4 py-2.5 text-sage-800 outline-none focus:border-sage-700';

const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' };

/**
 * Builds a `datetime-local` field value from an ISO instant using LOCAL
 * wall-clock components. `toISOString().slice(0, 16)` would yield UTC and shift
 * the time the admin sees.
 */
function isoToLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parses a `datetime-local` field value (local wall clock, no zone) into an ISO
 * instant, or `null` while the field is empty or incomplete.
 */
function localInputValueToIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatStatusLine(rsvpDeadlineIso: string, now: Date): string {
  const deadline = new Date(rsvpDeadlineIso);

  if (deadline > now) {
    const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `RSVPs are open — ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
  }

  return `RSVPs closed on ${deadline.toLocaleString(undefined, DEADLINE_FORMAT)}`;
}

export const SettingsForm: React.FC = () => {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [loadSessionExpired, setLoadSessionExpired] = useState(false);

  const [baseline, setBaseline] = useState<AdminSettings | null>(null);
  const [deadlineField, setDeadlineField] = useState('');
  const [capField, setCapField] = useState('');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveSessionExpired, setSaveSessionExpired] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      setLoadStatus('loading');
      setLoadErrorMessage(null);
      setLoadSessionExpired(false);

      try {
        const settings = await requestJson<AdminSettings>('/api/admin/settings');
        if (cancelled) return;

        setBaseline(settings);
        setDeadlineField(isoToLocalInputValue(settings.rsvpDeadline));
        setCapField(String(settings.defaultAddGuestCap));
      } catch (error) {
        if (cancelled) return;

        if (isSessionExpired(error)) {
          setLoadSessionExpired(true);
        } else {
          setLoadErrorMessage(toFailureMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoadStatus('idle');
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const deadlineIso = localInputValueToIso(deadlineField);
  const deadlineChanged = baseline !== null && deadlineIso !== null && deadlineIso !== baseline.rsvpDeadline;
  const capChanged = baseline !== null && capField !== '' && Number(capField) !== baseline.defaultAddGuestCap;
  const isDirty = deadlineChanged || capChanged;

  const handleDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDeadlineField(event.target.value);
    setSaveSucceeded(false);
  };

  const handleCapChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCapField(event.target.value);
    setSaveSucceeded(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isDirty || saveStatus === 'saving') return;

    const patch: Partial<AdminSettings> = {};
    if (deadlineChanged && deadlineIso) patch.rsvpDeadline = deadlineIso;
    if (capChanged) patch.defaultAddGuestCap = Number(capField);

    setSaveStatus('saving');
    setSaveErrorMessage(null);
    setSaveSessionExpired(false);
    setSaveSucceeded(false);

    try {
      const updated = await requestJson<AdminSettings>('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      setBaseline(updated);
      setDeadlineField(isoToLocalInputValue(updated.rsvpDeadline));
      setCapField(String(updated.defaultAddGuestCap));
      setSaveSucceeded(true);
    } catch (error) {
      if (isSessionExpired(error)) {
        setSaveSessionExpired(true);
      } else {
        setSaveErrorMessage(toFailureMessage(error));
      }
    } finally {
      setSaveStatus('idle');
    }
  };

  if (loadSessionExpired) {
    return <SessionExpiredNotice />;
  }

  if (loadErrorMessage) {
    return (
      <p role='alert' className='text-sm text-red-700'>
        {loadErrorMessage}
      </p>
    );
  }

  if (loadStatus === 'loading' || baseline === null) {
    return (
      <p role='status' className='text-sm text-sage-700/80'>
        Loading…
      </p>
    );
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resolvedDeadlineText = deadlineIso
    ? new Date(deadlineIso).toLocaleString(undefined, DEADLINE_FORMAT)
    : null;

  return (
    <div>
      <p className='text-sm text-sage-700'>{formatStatusLine(baseline.rsvpDeadline, new Date())}</p>

      <form onSubmit={handleSubmit} className='mt-6 max-w-xs'>
        <label htmlFor='rsvp-deadline' className='block text-sm text-sage-700'>
          RSVP deadline
          <input
            id='rsvp-deadline'
            name='rsvp-deadline'
            type='datetime-local'
            value={deadlineField}
            onChange={handleDeadlineChange}
            className={FIELD_CLASS}
          />
        </label>
        {resolvedDeadlineText && (
          <p className='mt-2 text-xs text-sage-700/70'>
            Resolves to {resolvedDeadlineText} in your browser&apos;s local timezone ({timeZone}).
          </p>
        )}

        <label htmlFor='default-add-guest-cap' className='mt-5 block text-sm text-sage-700'>
          Default add-guest cap
          <input
            id='default-add-guest-cap'
            name='default-add-guest-cap'
            type='number'
            min='0'
            max='20'
            value={capField}
            onChange={handleCapChange}
            className={FIELD_CLASS}
          />
        </label>

        {saveSessionExpired && <SessionExpiredNotice className='mt-5' />}

        {!saveSessionExpired && saveErrorMessage && (
          <p role='alert' className='mt-5 text-sm text-red-700'>
            {saveErrorMessage}
          </p>
        )}

        {!saveSessionExpired && !saveErrorMessage && saveSucceeded && (
          <p role='status' className='mt-5 text-sm text-sage-700'>
            Settings saved.
          </p>
        )}

        <button
          type='submit'
          disabled={!isDirty || saveStatus === 'saving'}
          className='mt-5 rounded-lg bg-sage-700 px-4 py-2.5 text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
};
