import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditEntry } from './AuditEntry';
import type { AuditEntryView } from '@/lib/admin/audit';

const entry = (overrides: Partial<AuditEntryView> = {}): AuditEntryView => ({
  id: 'entry-1',
  partyId: 'party-1',
  guestId: null,
  action: 'party_updated',
  actorType: 'admin',
  actorEmail: 'admin@example.com',
  before: { displayName: 'Old Name' },
  after: { displayName: 'New Name' },
  ipAddress: '127.0.0.1',
  createdAt: '2026-07-20T15:30:00.000Z',
  ...overrides,
});

describe('AuditEntry', () => {
  it('renders the action label and actor email in the summary', () => {
    render(<AuditEntry entry={entry()} />);

    expect(screen.getByText('Party updated')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  it('falls back to the actor type when no actor email is recorded', () => {
    render(<AuditEntry entry={entry({ actorEmail: null, actorType: 'guest' })} />);

    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
  });

  it('renders a null before snapshot as a placeholder, not the string "null"', () => {
    const { container } = render(<AuditEntry entry={entry({ before: null })} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(container.textContent).not.toContain('null');
  });

  it('renders a present snapshot as formatted JSON', () => {
    const { container } = render(<AuditEntry entry={entry({ after: { displayName: 'New Name' } })} />);

    expect(container.textContent).toContain('"displayName": "New Name"');
  });

  it('renders the raw action string when it has no known label', () => {
    render(<AuditEntry entry={entry({ action: 'unknown_action' })} />);

    expect(screen.getByText('unknown_action')).toBeInTheDocument();
  });
});
