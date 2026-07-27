import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RsvpClosed } from './RsvpClosed';

describe('RsvpClosed', () => {
  it('names the date the guest list closed', () => {
    render(<RsvpClosed deadline='2026-09-10T00:00:00.000Z' />);

    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('directs the guest to the bride or groom, with no mailto', () => {
    render(<RsvpClosed deadline='2026-09-10T00:00:00.000Z' />);

    expect(screen.getByText(/contact the bride or groom/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /email/i })).not.toBeInTheDocument();
  });

  it.each([null, 'not-a-date'])('still renders when the deadline is %j', (deadline) => {
    render(<RsvpClosed deadline={deadline} />);

    expect(screen.getByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/our guest list is now closed/i)).toBeInTheDocument();
  });
});
