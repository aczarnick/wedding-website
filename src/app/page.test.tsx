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
});
