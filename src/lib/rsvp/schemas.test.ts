import { describe, expect, it } from 'vitest';
import { RSVP_STATUS } from '@/lib/enums';
import { searchQuerySchema, submitRsvpSchema } from '@/lib/rsvp/schemas';

const guestId = '3f9a1b2c-4d5e-4f60-8a1b-2c3d4e5f6071';

function validSubmission() {
  return {
    message: 'Cannot wait!',
    guests: [{ id: guestId, rsvpStatus: RSVP_STATUS.attending, songRequest: 'September' }],
    newGuests: [],
  };
}

describe('searchQuerySchema', () => {
  it('normalizes a valid query', () => {
    const result = searchQuerySchema.safeParse('  john   SMITH ');

    expect(result.success && result.data).toBe('john SMITH');
  });

  it('rejects a query under two characters', () => {
    expect(searchQuerySchema.safeParse('j').success).toBe(false);
  });

  it('rejects a single-token query', () => {
    expect(searchQuerySchema.safeParse('Smith').success).toBe(false);
  });
});

describe('submitRsvpSchema', () => {
  it('accepts a valid submission', () => {
    const result = submitRsvpSchema.safeParse(validSubmission());

    expect(result.success).toBe(true);
  });

  it('rejects the pending status', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      guests: [{ id: guestId, rsvpStatus: RSVP_STATUS.pending, songRequest: null }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      guests: [{ id: guestId, rsvpStatus: 'maybe', songRequest: null }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a guest id that is not a UUID', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      guests: [{ id: 'nope', rsvpStatus: RSVP_STATUS.attending, songRequest: null }],
    });

    expect(result.success).toBe(false);
  });

  it('turns a blank message into null', () => {
    const result = submitRsvpSchema.safeParse({ ...validSubmission(), message: '   ' });

    expect(result.success && result.data.message).toBe(null);
  });

  it('turns an omitted message into null', () => {
    const { message: _omitted, ...rest } = validSubmission();
    const result = submitRsvpSchema.safeParse(rest);

    expect(result.success && result.data.message).toBe(null);
  });

  it('trims a song request', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      guests: [{ id: guestId, rsvpStatus: RSVP_STATUS.attending, songRequest: '  September  ' }],
    });

    expect(result.success && result.data.guests[0].songRequest).toBe('September');
  });

  it('rejects a message over 1000 characters', () => {
    const result = submitRsvpSchema.safeParse({ ...validSubmission(), message: 'a'.repeat(1001) });

    expect(result.success).toBe(false);
  });

  it('rejects a song request over 200 characters', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      guests: [{ id: guestId, rsvpStatus: RSVP_STATUS.attending, songRequest: 'a'.repeat(201) }],
    });

    expect(result.success).toBe(false);
  });

  it('measures length after trimming', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      message: `  ${'a'.repeat(1000)}  `,
    });

    expect(result.success).toBe(true);
  });

  it('defaults newGuests to an empty array', () => {
    const { newGuests: _omitted, ...rest } = validSubmission();
    const result = submitRsvpSchema.safeParse(rest);

    expect(result.success && result.data.newGuests).toEqual([]);
  });

  it('accepts a new guest', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      newGuests: [
        {
          firstName: '  Sam  ',
          lastName: 'Rivera',
          rsvpStatus: RSVP_STATUS.attending,
          songRequest: null,
        },
      ],
    });

    expect(result.success && result.data.newGuests[0].firstName).toBe('Sam');
  });

  it('rejects a new guest with a blank name', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      newGuests: [
        {
          firstName: '   ',
          lastName: 'Rivera',
          rsvpStatus: RSVP_STATUS.attending,
          songRequest: null,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a new guest name over 100 characters', () => {
    const result = submitRsvpSchema.safeParse({
      ...validSubmission(),
      newGuests: [
        {
          firstName: 'a'.repeat(101),
          lastName: 'Rivera',
          rsvpStatus: RSVP_STATUS.attending,
          songRequest: null,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty guests array', () => {
    const result = submitRsvpSchema.safeParse({ ...validSubmission(), guests: [] });

    expect(result.success).toBe(false);
  });
});
