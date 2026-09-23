import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShuttleSection } from './ShuttleSection';
import { SHUTTLE } from '@/constants/shuttle';

// "4:45\u00A0PM" → minutes since midnight, so ordering can be checked numerically.
const toMinutes = (time: string): number => {
  const [, h, m] = time.match(/^(\d{1,2}):(\d{2})\u00A0PM$/) ?? [];
  expect(h, `unparseable time "${time}"`).toBeDefined();
  return ((Number(h) % 12) + 12) * 60 + Number(m);
};

const isStrictlyIncreasing = (times: string[]) =>
  times.map(toMinutes).every((t, i, all) => i === 0 || t > all[i - 1]);

describe('ShuttleSection', () => {
  it('shows the parking warning, stop order, and seat limit', () => {
    render(<ShuttleSection />);

    expect(screen.getByText('Please ride the shuttle!')).toBeInTheDocument();
    expect(screen.getByText(/Parking at the farm is extremely limited/).textContent).toMatch(/^Please ride the shuttle! Parking/);
    expect(screen.getByText(/picks up at Baymont by Wyndham, then Cobblestone Inn & Suites/)).toBeInTheDocument();
    expect(screen.getByText(/seats 40 guests/)).toBeInTheDocument();
  });

  it('renders a row for every run in both directions', () => {
    render(<ShuttleSection />);

    const [toFarm, toHotels] = screen.getAllByRole('table');
    // +1 for each header row
    expect(toFarm.querySelectorAll('tr')).toHaveLength(SHUTTLE.toFarm.length + 1);
    expect(toHotels.querySelectorAll('tr')).toHaveLength(SHUTTLE.toHotels.length + 1);
    // Raw textContent: toHaveTextContent would normalize the non-breaking spaces away
    const rows = (table: HTMLElement) => [...table.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(rows(toFarm)[0]).toBe('3:30\u00A0PMBefore the ceremony3:45\u00A0PM');
    expect(rows(toHotels).at(-1)).toBe('11:30\u00A0PMLast ride of the night');
  });

  it('keeps the schedule in chronological order with a 15-minute ride', () => {
    expect(isStrictlyIncreasing(SHUTTLE.toFarm.map((run) => run.pickup))).toBe(true);
    expect(isStrictlyIncreasing(SHUTTLE.toHotels)).toBe(true);
    SHUTTLE.toFarm.forEach((run) => {
      expect(toMinutes(run.arrival) - toMinutes(run.pickup)).toBe(15);
    });
  });
});
