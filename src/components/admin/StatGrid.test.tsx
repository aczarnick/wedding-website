import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatGrid } from './StatGrid';
import type { SummaryStats } from '@/lib/admin/stats';

const stats: SummaryStats = {
  parties: 3,
  invited: 5,
  attending: 3,
  declined: 1,
  pending: 1,
  flagged: 0,
};

const cardFor = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

describe('StatGrid', () => {
  it('renders every stat against its own label', () => {
    render(<StatGrid stats={{ parties: 3, invited: 9, attending: 5, declined: 2, pending: 2, flagged: 4 }} />);

    expect(cardFor('Parties')).toHaveTextContent('3');
    expect(cardFor('Invited')).toHaveTextContent('9');
    expect(cardFor('Attending')).toHaveTextContent('5');
    expect(cardFor('Declined')).toHaveTextContent('2');
    expect(cardFor('Pending')).toHaveTextContent('2');
    expect(cardFor('Flagged')).toHaveTextContent('4');
  });

  it('renders a zero rather than leaving the tile blank', () => {
    render(<StatGrid stats={{ ...stats, attending: 0 }} />);

    expect(cardFor('Attending')).toHaveTextContent('0');
  });

  it('highlights flagged only when guests are waiting on moderation', () => {
    const { rerender } = render(<StatGrid stats={stats} />);

    expect(cardFor('Flagged').className).not.toContain('amber');

    rerender(<StatGrid stats={{ ...stats, flagged: 2 }} />);

    expect(cardFor('Flagged').className).toContain('amber');
  });
});
