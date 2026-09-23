import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShuttleSection } from './ShuttleSection';

describe('ShuttleSection', () => {
  it('shows the parking warning, stop order, and seat limit', () => {
    render(<ShuttleSection />);

    expect(screen.getByText(/Parking at the farm is extremely limited/).textContent).toMatch(/^Please ride the shuttle! Parking/);
    expect(screen.getByText(/picks up at Baymont by Wyndham, then Cobblestone Inn & Suites/)).toBeInTheDocument();
    expect(screen.getByText(/seats 40 guests/)).toBeInTheDocument();
  });

  it('spells out only the two pre-ceremony trips, then the hourly service and last rides', () => {
    render(<ShuttleSection />);

    // Raw textContent: toHaveTextContent would normalize the non-breaking spaces away
    const trips = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(trips).toEqual([
      'Hotel pickup 3:30\u00A0PM, arrives at the farm 3:45\u00A0PM',
      'Hotel pickup 4:00\u00A0PM, arrives at the farm 4:15\u00A0PMmay run a few minutes behind',
    ]);
    expect(screen.getByText(/every hour, on the hour/).textContent).toContain('starting at 5:00\u00A0PM');
    expect(screen.getByText(/last rides back to the hotels/).textContent).toContain('at 11:00\u00A0PM and 11:30\u00A0PM');
  });
});
