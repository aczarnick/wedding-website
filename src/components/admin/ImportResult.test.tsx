import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportResult } from './ImportResult';

describe('ImportResult', () => {
  it('renders the created counts on success', () => {
    render(<ImportResult result={{ status: 'success', partiesCreated: 3, guestsCreated: 7 }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Imported 3 parties and 7 guests.');
  });

  it('pluralises a single created party and guest correctly', () => {
    render(<ImportResult result={{ status: 'success', partiesCreated: 1, guestsCreated: 1 }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Imported 1 party and 1 guest.');
  });

  it('renders the message, the nothing-saved line, and every row error on failure', () => {
    render(
      <ImportResult
        result={{
          status: 'failure',
          message: 'Import rejected: 2 invalid rows',
          rowErrors: [
            { line: 3, reason: 'missing displayName' },
            { line: 8, reason: 'unknown rsvpStatus' },
          ],
        }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Import rejected: 2 invalid rows');
    expect(alert).toHaveTextContent('Nothing was saved.');
    expect(alert).toHaveTextContent('Line 3: missing displayName');
    expect(alert).toHaveTextContent('Line 8: unknown rsvpStatus');
  });

  it('renders a message-only failure with no row list when rowErrors is absent', () => {
    render(<ImportResult result={{ status: 'failure', message: 'The file exceeds the 5 MB limit' }} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The file exceeds the 5 MB limit');
    expect(alert).toHaveTextContent('Nothing was saved.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
