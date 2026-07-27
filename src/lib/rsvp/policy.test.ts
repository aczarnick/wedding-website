import { describe, expect, it } from 'vitest';
import { GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  diffGuestIds,
  isPartyId,
  isRsvpOpen,
  nameSplitCandidates,
  normalizeName,
  toPartySnapshot,
} from '@/lib/rsvp/policy';

describe('normalizeName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeName('  John   Smith \n')).toBe('John Smith');
  });

  it('leaves an already-normal name untouched', () => {
    expect(normalizeName('John Smith')).toBe('John Smith');
  });
});

describe('nameSplitCandidates', () => {
  it('splits a two-token name one way', () => {
    expect(nameSplitCandidates('John Smith')).toEqual([{ firstName: 'John', lastName: 'Smith' }]);
  });

  it('produces every split point for a multi-part name', () => {
    expect(nameSplitCandidates('Mary Jo Van Der Berg')).toEqual([
      { firstName: 'Mary', lastName: 'Jo Van Der Berg' },
      { firstName: 'Mary Jo', lastName: 'Van Der Berg' },
      { firstName: 'Mary Jo Van', lastName: 'Der Berg' },
      { firstName: 'Mary Jo Van Der', lastName: 'Berg' },
    ]);
  });

  it('normalizes before splitting', () => {
    expect(nameSplitCandidates('  john   smith ')).toEqual([
      { firstName: 'john', lastName: 'smith' },
    ]);
  });

  it('returns nothing for a single token', () => {
    expect(nameSplitCandidates('Smith')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(nameSplitCandidates('   ')).toEqual([]);
  });
});

describe('isRsvpOpen', () => {
  const deadline = new Date('2026-09-10T00:00:00Z');

  it('is open before the deadline', () => {
    expect(isRsvpOpen(deadline, new Date('2026-09-09T23:59:59Z'))).toBe(true);
  });

  it('is closed exactly at the deadline', () => {
    expect(isRsvpOpen(deadline, new Date('2026-09-10T00:00:00Z'))).toBe(false);
  });

  it('is closed after the deadline', () => {
    expect(isRsvpOpen(deadline, new Date('2026-09-10T00:00:01Z'))).toBe(false);
  });
});

describe('isPartyId', () => {
  it('accepts a canonical UUID', () => {
    expect(isPartyId('3f9a1b2c-4d5e-4f60-8a1b-2c3d4e5f6071')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPartyId('3F9A1B2C-4D5E-4F60-8A1B-2C3D4E5F6071')).toBe(true);
  });

  it('rejects a non-UUID', () => {
    expect(isPartyId('not-a-uuid')).toBe(false);
  });

  it('rejects a UUID with surrounding whitespace', () => {
    expect(isPartyId(' 3f9a1b2c-4d5e-4f60-8a1b-2c3d4e5f6071 ')).toBe(false);
  });
});

describe('diffGuestIds', () => {
  it('matches when both sets are equal regardless of order', () => {
    expect(diffGuestIds(['a', 'b'], ['b', 'a'])).toEqual({
      matches: true,
      missing: [],
      unknown: [],
      duplicated: [],
    });
  });

  it('reports a guest omitted from the submission', () => {
    const diff = diffGuestIds(['a', 'b'], ['a']);

    expect(diff.matches).toBe(false);
    expect(diff.missing).toEqual(['b']);
  });

  it('reports a submitted id the party does not own', () => {
    const diff = diffGuestIds(['a'], ['a', 'z']);

    expect(diff.matches).toBe(false);
    expect(diff.unknown).toEqual(['z']);
  });

  it('reports a duplicated id once', () => {
    const diff = diffGuestIds(['a'], ['a', 'a', 'a']);

    expect(diff.matches).toBe(false);
    expect(diff.duplicated).toEqual(['a']);
  });
});

describe('countAddedGuests', () => {
  it('counts only guest-added sources', () => {
    const guests = [
      { source: GUEST_SOURCE.admin },
      { source: GUEST_SOURCE.guestAdded },
      { source: GUEST_SOURCE.guestAdded },
    ];

    expect(countAddedGuests(guests)).toBe(2);
  });
});

describe('checkAddGuestAllowance', () => {
  it('allows a request under the cap', () => {
    expect(checkAddGuestAllowance(5, 1, 2)).toEqual({
      cap: 5,
      used: 1,
      remaining: 4,
      allowed: true,
    });
  });

  it('allows a request exactly at the cap', () => {
    expect(checkAddGuestAllowance(5, 3, 2).allowed).toBe(true);
  });

  it('rejects a request over the cap', () => {
    expect(checkAddGuestAllowance(5, 4, 2).allowed).toBe(false);
  });

  it('clamps remaining at zero when the cap was lowered below current usage', () => {
    expect(checkAddGuestAllowance(2, 5, 0)).toEqual({
      cap: 2,
      used: 5,
      remaining: 0,
      allowed: true,
    });
  });

  it('rejects any addition once remaining is zero', () => {
    expect(checkAddGuestAllowance(2, 5, 1).allowed).toBe(false);
  });
});

describe('toPartySnapshot', () => {
  it('captures only the audited fields, ordered by id', () => {
    const snapshot = toPartySnapshot('hello', [
      {
        id: 'b',
        firstName: 'Jane',
        lastName: 'Smith',
        rsvpStatus: RSVP_STATUS.declined,
        songRequest: null,
      },
      {
        id: 'a',
        firstName: 'John',
        lastName: 'Smith',
        rsvpStatus: RSVP_STATUS.attending,
        songRequest: 'September',
      },
    ]);

    expect(snapshot).toEqual({
      message: 'hello',
      guests: [
        {
          id: 'a',
          firstName: 'John',
          lastName: 'Smith',
          rsvpStatus: RSVP_STATUS.attending,
          songRequest: 'September',
        },
        {
          id: 'b',
          firstName: 'Jane',
          lastName: 'Smith',
          rsvpStatus: RSVP_STATUS.declined,
          songRequest: null,
        },
      ],
    });
  });
});
