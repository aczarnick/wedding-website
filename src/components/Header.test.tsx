import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { NAV_LINKS } from '@/constants/events';

const EXPECTED_HREFS: Record<(typeof NAV_LINKS)[number], string> = {
  Details: '/#Details',
  Travel: '/#Travel',
  FAQs: '/#FAQs',
  Registry: '/registry',
  Gallery: '/gallery',
  RSVP: '/rsvp',
};

describe('Header', () => {
  // Only the resolved href is verified here, not next/link vs. plain <a> navigation
  // mechanics (client-side route vs. full page reload) — jsdom can't observe that distinction.
  it.each(NAV_LINKS)('renders every "%s" link with the correct href', (link) => {
    render(<Header />);

    const matches = screen.getAllByRole('link', { name: link });

    expect(matches.length).toBeGreaterThan(0);
    matches.forEach((el) => {
      expect(el).toHaveAttribute('href', EXPECTED_HREFS[link]);
    });
  });
});
