import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleSection } from './ScheduleSection';

describe('ScheduleSection', () => {
  it('lists ceremony, cocktail hour, and dinner in order with their times', () => {
    render(<ScheduleSection />);

    // Raw textContent: toHaveTextContent would normalize the non-breaking spaces away
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '4:30 PMCeremony',
      '5:00–6:00 PMCocktail hour',
      '6:00 PMDinner',
    ]);
  });

  it('tells guests to come ready to dance', () => {
    render(<ScheduleSection />);

    expect(screen.getByText('Come ready to dance!')).toBeInTheDocument();
  });
});
