import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogViewer } from './AuditLogViewer';
import type { AuditEntryView } from '@/lib/admin/audit';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sampleEntry = (overrides: Partial<AuditEntryView> = {}): AuditEntryView => ({
  id: 'entry-1',
  partyId: null,
  guestId: null,
  action: 'party_created',
  actorType: 'admin',
  actorEmail: 'admin@example.com',
  before: null,
  after: { displayName: 'The Smiths' },
  ipAddress: null,
  createdAt: '2026-07-20T15:30:00.000Z',
  ...overrides,
});

const requestUrl = (fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string =>
  fetchMock.mock.calls[callIndex][0] as string;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuditLogViewer', () => {
  it('renders each entry returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { entries: [sampleEntry()], total: 1 })));

    render(<AuditLogViewer />);

    expect(await screen.findByText('Party created')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { entries: [], total: 0 })));

    render(<AuditLogViewer />);

    expect(await screen.findByText(/no changes to show/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /older/i })).not.toBeInTheDocument();
  });

  it('resets the offset to 0 and includes the action filter when the filter changes', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { entries: [sampleEntry()], total: 60 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AuditLogViewer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /older/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestUrl(fetchMock, 1)).toContain('offset=50');

    fireEvent.change(screen.getByLabelText(/action/i), { target: { value: 'party_created' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const filteredUrl = requestUrl(fetchMock, 2);
    expect(filteredUrl).toContain('action=party_created');
    expect(filteredUrl).toContain('offset=0');
  });

  it('advances the offset on Older and returns to it on Newer', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { entries: [sampleEntry()], total: 60 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AuditLogViewer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestUrl(fetchMock, 0)).toContain('offset=0');

    fireEvent.click(screen.getByRole('button', { name: /older/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestUrl(fetchMock, 1)).toContain('offset=50');

    fireEvent.click(screen.getByRole('button', { name: /newer/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(requestUrl(fetchMock, 2)).toContain('offset=0');
  });

  it('disables Newer at offset 0 and Older on the last page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { entries: [sampleEntry()], total: 60 }))),
    );
    render(<AuditLogViewer />);
    await screen.findByText('Party created');

    expect(screen.getByRole('button', { name: /newer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /older/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /older/i }));

    expect(await screen.findByText('51–51 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /older/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /newer/i })).toBeEnabled();
  });

  it('renders a session-expired message with a sign-in link on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', code: null })));

    render(<AuditLogViewer />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your session has expired.');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/signin');
  });

  it('renders a fixed message on a rejected fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<AuditLogViewer />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the server. Please check your connection and try again.',
    );
  });
});
