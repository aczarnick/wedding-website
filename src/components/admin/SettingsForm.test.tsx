import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsForm } from './SettingsForm';
import type { AdminSettings } from '@/lib/admin/settings';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Independent re-implementation of the component's ISO -> local-wall-clock conversion, to assert against without reaching into its internals. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const baseSettings: AdminSettings = {
  rsvpDeadline: '2026-09-01T23:59:00.000Z',
  defaultAddGuestCap: 5,
};

/** A fetch mock that serves `settings` on GET and merges the PATCH body into it on PATCH, mirroring the real API. */
function fetchMockFor(settings: AdminSettings): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const patch = JSON.parse(init.body as string) as Partial<AdminSettings>;
      return Promise.resolve(jsonResponse(200, { ...settings, ...patch }));
    }
    return Promise.resolve(jsonResponse(200, settings));
  });
}

const deadlineField = () => screen.getByLabelText(/rsvp deadline/i) as HTMLInputElement;
const capField = () => screen.getByLabelText(/default add-guest cap/i) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /save/i });

const lastCallBody = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> => {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse((init as RequestInit).body as string);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SettingsForm', () => {
  it('populates both fields from the loaded settings, converting the deadline to local wall-clock text', async () => {
    vi.stubGlobal('fetch', fetchMockFor(baseSettings));

    render(<SettingsForm />);

    await waitFor(() => expect(deadlineField()).toHaveValue(toLocalInputValue(baseSettings.rsvpDeadline)));
    expect(capField()).toHaveValue(5);
  });

  it('disables Save when the form is clean', async () => {
    vi.stubGlobal('fetch', fetchMockFor(baseSettings));

    render(<SettingsForm />);

    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('sends a PATCH with only the cap when just the cap is edited', async () => {
    const fetchMock = fetchMockFor(baseSettings);
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsForm />);
    await waitFor(() => expect(capField()).toHaveValue(5));

    fireEvent.change(capField(), { target: { value: '8' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = lastCallBody(fetchMock);
    expect(body).toEqual({ defaultAddGuestCap: 8 });
    expect(body).not.toHaveProperty('rsvpDeadline');
  });

  it('sends a deadline ISO string that round-trips back to the wall-clock time the user typed', async () => {
    const fetchMock = fetchMockFor(baseSettings);
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsForm />);
    await waitFor(() => expect(deadlineField()).toHaveValue(toLocalInputValue(baseSettings.rsvpDeadline)));

    fireEvent.change(deadlineField(), { target: { value: '2026-09-20T10:15' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = lastCallBody(fetchMock);
    expect(toLocalInputValue(body.rsvpDeadline as string)).toBe('2026-09-20T10:15');
  });

  it('re-disables Save after a successful save', async () => {
    const fetchMock = fetchMockFor(baseSettings);
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsForm />);
    await waitFor(() => expect(capField()).toHaveValue(5));

    fireEvent.change(capField(), { target: { value: '8' } });
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('reads open with the whole days remaining before the deadline', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      fetchMockFor({ rsvpDeadline: '2026-09-01T00:00:00.000Z', defaultAddGuestCap: 5 }),
    );

    render(<SettingsForm />);

    expect(await screen.findByText('RSVPs are open — 6 days remaining')).toBeInTheDocument();
  });

  it('uses the singular "day" when exactly one day remains', async () => {
    vi.setSystemTime(new Date('2026-08-31T00:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      fetchMockFor({ rsvpDeadline: '2026-09-01T00:00:00.000Z', defaultAddGuestCap: 5 }),
    );

    render(<SettingsForm />);

    expect(await screen.findByText('RSVPs are open — 1 day remaining')).toBeInTheDocument();
  });

  it('reads closed with the date it closed, once the deadline has passed', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      fetchMockFor({ rsvpDeadline: '2026-07-01T12:00:00.000Z', defaultAddGuestCap: 5 }),
    );

    render(<SettingsForm />);

    // The date renders in the browser's locale, so the assertion pins the
    // branch and the date rather than one locale's spelling of it.
    expect(await screen.findByText(/^RSVPs closed on .*2026/)).toBeInTheDocument();
  });

  it('surfaces the API error message when a save fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(200, baseSettings)))
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(400, { error: 'Deadline must be in the future', code: 'invalid_request' })),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsForm />);
    await waitFor(() => expect(capField()).toHaveValue(5));

    fireEvent.change(capField(), { target: { value: '8' } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Deadline must be in the future');
  });

  it('renders a session-expired message with a sign-in link on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', code: null })));

    render(<SettingsForm />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your session has expired.');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/signin');
  });

  it('renders a fixed message when the initial load cannot reach the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<SettingsForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
  });
});
