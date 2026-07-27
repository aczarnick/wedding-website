import { describe, expect, it } from 'vitest';
import {
  auditQuerySchema,
  createGuestSchema,
  createPartySchema,
  guestListQuerySchema,
  moderateGuestSchema,
  updateGuestSchema,
  updatePartySchema,
  updateSettingsSchema,
} from '@/lib/admin/schemas';
import { RSVP_STATUS } from '@/lib/enums';

const partyId = '11111111-1111-4111-8111-111111111111';

describe('createPartySchema', () => {
  it('defaults the guest list to empty', () => {
    const parsed = createPartySchema.parse({ displayName: 'The Smith Family' });

    expect(parsed.guests).toEqual([]);
    expect(parsed.addGuestCap).toBeUndefined();
  });

  it('trims the display name and nulls a blank message', () => {
    const parsed = createPartySchema.parse({ displayName: '  Smiths  ', message: '   ' });

    expect(parsed.displayName).toBe('Smiths');
    expect(parsed.message).toBeNull();
  });

  it('accepts nested guests without a party id', () => {
    const parsed = createPartySchema.parse({
      displayName: 'Smiths',
      guests: [{ firstName: 'John', lastName: 'Smith' }],
    });

    expect(parsed.guests[0].rsvpStatus).toBe(RSVP_STATUS.pending);
  });

  it('rejects a negative cap', () => {
    expect(createPartySchema.safeParse({ displayName: 'Smiths', addGuestCap: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an empty display name', () => {
    expect(createPartySchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });
});

describe('updatePartySchema', () => {
  it('accepts a single field', () => {
    expect(updatePartySchema.parse({ addGuestCap: 3 })).toEqual({ addGuestCap: 3 });
  });

  it('rejects an empty patch', () => {
    expect(updatePartySchema.safeParse({}).success).toBe(false);
  });
});

describe('createGuestSchema', () => {
  it('requires a party id and defaults the status to pending', () => {
    const parsed = createGuestSchema.parse({ partyId, firstName: 'Ada', lastName: 'Lovelace' });

    expect(parsed.partyId).toBe(partyId);
    expect(parsed.rsvpStatus).toBe(RSVP_STATUS.pending);
    expect(parsed.songRequest).toBeNull();
  });

  it('rejects a non-uuid party id', () => {
    expect(
      createGuestSchema.safeParse({ partyId: 'nope', firstName: 'Ada', lastName: 'Lovelace' })
        .success,
    ).toBe(false);
  });
});

describe('updateGuestSchema', () => {
  it('accepts an admin setting a guest back to pending', () => {
    expect(updateGuestSchema.parse({ rsvpStatus: RSVP_STATUS.pending })).toEqual({
      rsvpStatus: RSVP_STATUS.pending,
    });
  });

  it('rejects an unknown status', () => {
    expect(updateGuestSchema.safeParse({ rsvpStatus: 'maybe' }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(updateGuestSchema.safeParse({}).success).toBe(false);
  });
});

describe('moderateGuestSchema', () => {
  it.each(['approve', 'remove'])('accepts %s', (action) => {
    expect(moderateGuestSchema.parse({ action }).action).toBe(action);
  });

  it('rejects anything else', () => {
    expect(moderateGuestSchema.safeParse({ action: 'ignore' }).success).toBe(false);
  });
});

describe('updateSettingsSchema', () => {
  it('parses an ISO deadline into a Date', () => {
    const parsed = updateSettingsSchema.parse({ rsvpDeadline: '2026-09-10T00:00:00.000Z' });

    expect(parsed.rsvpDeadline).toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });

  it('rejects a non-ISO deadline', () => {
    expect(updateSettingsSchema.safeParse({ rsvpDeadline: '2026-09-10' }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false);
  });
});

describe('auditQuerySchema', () => {
  it('applies defaults', () => {
    expect(auditQuerySchema.parse({})).toEqual({ limit: 100, offset: 0 });
  });

  it('coerces numeric strings from the query string', () => {
    expect(auditQuerySchema.parse({ limit: '25', offset: '50' })).toMatchObject({
      limit: 25,
      offset: 50,
    });
  });

  it('rejects a limit above the cap', () => {
    expect(auditQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(auditQuerySchema.safeParse({ action: 'exploded' }).success).toBe(false);
  });
});

describe('guestListQuerySchema', () => {
  it('reads the flagged filter as a boolean', () => {
    expect(guestListQuerySchema.parse({ flagged: 'true' }).flagged).toBe(true);
  });

  it('leaves the filter undefined when absent', () => {
    expect(guestListQuerySchema.parse({}).flagged).toBeUndefined();
  });
});
