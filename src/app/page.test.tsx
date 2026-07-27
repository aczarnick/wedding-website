import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the landing page without throwing', () => {
    render(<Home />);

    expect(screen.getByText('Alex & Claire')).toBeInTheDocument();
    expect(screen.getAllByText('Ceremony').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reception').length).toBeGreaterThan(0);
    expect(screen.getByText('Travel Recommendations')).toBeInTheDocument();
    expect(screen.getAllByText('FAQs').length).toBeGreaterThan(0);
  });

  it('points every RSVP call-to-action at /rsvp', () => {
    render(<Home />);

    // Three sources: the hero call-to-action, the desktop header nav, and the
    // mobile drawer. The count is what proves the hero CTA is still rendered —
    // an href-only assertion would pass with it deleted.
    const rsvpLinks = screen.getAllByRole('link', { name: 'RSVP' });

    expect(rsvpLinks).toHaveLength(3);
    rsvpLinks.forEach((el) => {
      expect(el).toHaveAttribute('href', '/rsvp');
    });
  });
});
