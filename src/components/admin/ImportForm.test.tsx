import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportForm } from './ImportForm';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function csvFile(): File {
  return new File(['displayName,firstName,lastName\n'], 'guests.csv', { type: 'text/csv' });
}

const chooseFile = () => {
  fireEvent.change(screen.getByLabelText(/csv file/i), { target: { files: [csvFile()] } });
};

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: /import/i }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImportForm', () => {
  it('keeps Import disabled until a file is chosen', () => {
    render(<ImportForm />);

    expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();

    chooseFile();

    expect(screen.getByRole('button', { name: /import/i })).toBeEnabled();
  });

  it('sends the raw file as the request body, not a FormData envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { partiesCreated: 3, guestsCreated: 7 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImportForm />);
    chooseFile();

    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(File);
  });

  it('renders both created counts on a 201', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { partiesCreated: 3, guestsCreated: 7 })));
    render(<ImportForm />);
    chooseFile();

    submit();

    expect(await screen.findByRole('status')).toHaveTextContent('Imported 3 parties and 7 guests.');
  });

  it('renders every row error and the nothing-saved statement on an invalid_csv 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: 'Import rejected: 2 invalid rows',
          code: 'invalid_csv',
          rowErrors: [
            { line: 3, reason: 'missing displayName' },
            { line: 8, reason: 'unknown rsvpStatus' },
          ],
          partiesCreated: 0,
          guestsCreated: 0,
        }),
      ),
    );
    render(<ImportForm />);
    chooseFile();

    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Import rejected: 2 invalid rows');
    expect(alert).toHaveTextContent('Nothing was saved.');
    expect(alert).toHaveTextContent('Line 3: missing displayName');
    expect(alert).toHaveTextContent('Line 8: unknown rsvpStatus');
  });

  it('renders the server message with no row list on a 413', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(413, {
          error: 'The file exceeds the 5 MB limit',
          code: 'csv_too_large',
          partiesCreated: 0,
          guestsCreated: 0,
        }),
      ),
    );
    render(<ImportForm />);
    chooseFile();

    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The file exceeds the 5 MB limit');
    expect(alert).toHaveTextContent('Nothing was saved.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a session-expired message with a sign-in link on a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', code: null })),
    );
    render(<ImportForm />);
    chooseFile();

    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your session has expired.');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/signin');
  });

  it('renders a fixed message on a rejected fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<ImportForm />);
    chooseFile();

    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the server. Please check your connection and try again.',
    );
  });

  it('clears the previous result when a new file is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { partiesCreated: 3, guestsCreated: 7 })));
    render(<ImportForm />);
    chooseFile();
    submit();
    expect(await screen.findByRole('status')).toBeInTheDocument();

    chooseFile();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
