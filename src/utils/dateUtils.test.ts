import { describe, it, expect, afterEach, vi } from 'vitest';
import { DaysUntilWedding } from './dateUtils';

describe('DaysUntilWedding', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the day-of message when today is the wedding day', () => {
    vi.setSystemTime(new Date('2026-10-10T00:00:00'));
    expect(DaysUntilWedding()).toBe('Today is the day!');
  });

  it('returns the singular message when the wedding is 1 day away', () => {
    vi.setSystemTime(new Date('2026-10-09T00:00:00'));
    expect(DaysUntilWedding()).toBe('1 Day to go!');
  });

  it('rounds a partial day up rather than down (11 hours before the wedding)', () => {
    vi.setSystemTime(new Date('2026-10-09T13:00:00'));
    expect(DaysUntilWedding()).toBe('1 Day to go!');
  });

  it('returns the plural message when the wedding is N days away', () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00'));
    expect(DaysUntilWedding()).toBe('9 Days to go!');
  });

  it('returns an empty string after the wedding date has passed', () => {
    vi.setSystemTime(new Date('2026-10-11T00:00:00'));
    expect(DaysUntilWedding()).toBe('');
  });
});
