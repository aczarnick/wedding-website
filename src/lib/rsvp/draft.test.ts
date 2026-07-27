import { describe, it, expect } from 'vitest';
import {
  buildSubmitBody,
  emptyNewGuestDraft,
  initialGuestDrafts,
  toSubmittableStatus,
} from './draft';
import type { GuestDraft, NewGuestDraft, PartyDetail } from '@/lib/rsvp/types';

const guest = (id: string, overrides: Partial<PartyDetail['guests'][number]> = {}) => ({
  id,
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'admin',
  ...overrides,
});

const party = (guests: PartyDetail['guests']): PartyDetail => ({
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 5,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests,
});

const answered = (overrides: Partial<GuestDraft> = {}): GuestDraft => ({
  rsvpStatus: 'attending',
  songRequest: '',
  ...overrides,
});

const newGuest = (overrides: Partial<NewGuestDraft> = {}): NewGuestDraft => ({
  ...emptyNewGuestDraft(),
  firstName: 'Sam',
  lastName: 'Rivera',
  rsvpStatus: 'attending',
  ...overrides,
});

describe('toSubmittableStatus', () => {
  it.each(['attending', 'declined'])('passes through %s', (status) => {
    expect(toSubmittableStatus(status)).toBe(status);
  });

  it.each(['pending', '', 'maybe'])('treats %j as unanswered', (status) => {
    expect(toSubmittableStatus(status)).toBeNull();
  });
});

describe('initialGuestDrafts', () => {
  it('seeds answered guests from their stored status and song', () => {
    const drafts = initialGuestDrafts(
      party([guest('g1', { rsvpStatus: 'declined', songRequest: 'September' })]),
    );

    expect(drafts.g1).toEqual({ rsvpStatus: 'declined', songRequest: 'September' });
  });

  it('seeds a pending guest as unanswered with an empty song', () => {
    const drafts = initialGuestDrafts(party([guest('g1')]));

    expect(drafts.g1).toEqual({ rsvpStatus: null, songRequest: '' });
  });
});

describe('emptyNewGuestDraft', () => {
  it('starts blank and unanswered with a unique key', () => {
    const first = emptyNewGuestDraft();
    const second = emptyNewGuestDraft();

    expect(first).toMatchObject({ firstName: '', lastName: '', rsvpStatus: null, songRequest: '' });
    expect(first.key).not.toBe(second.key);
  });
});

describe('buildSubmitBody', () => {
  it('builds the payload once every guest is answered', () => {
    const body = buildSubmitBody(
      party([guest('g1'), guest('g2')]),
      { g1: answered({ songRequest: ' September ' }), g2: answered({ rsvpStatus: 'declined' }) },
      [],
      '  Can not wait!  ',
    );

    expect(body).toEqual({
      message: 'Can not wait!',
      guests: [
        { id: 'g1', rsvpStatus: 'attending', songRequest: 'September' },
        { id: 'g2', rsvpStatus: 'declined', songRequest: null },
      ],
      newGuests: [],
    });
  });

  it('returns null while any guest is unanswered', () => {
    const body = buildSubmitBody(
      party([guest('g1'), guest('g2')]),
      { g1: answered(), g2: answered({ rsvpStatus: null }) },
      [],
      '',
    );

    expect(body).toBeNull();
  });

  it('returns null when a guest has no draft at all', () => {
    expect(buildSubmitBody(party([guest('g1')]), {}, [], '')).toBeNull();
  });

  it('drops a song request when the guest declines', () => {
    const body = buildSubmitBody(
      party([guest('g1')]),
      { g1: answered({ rsvpStatus: 'declined', songRequest: 'September' }) },
      [],
      '',
    );

    expect(body?.guests[0].songRequest).toBeNull();
  });

  it('sends an empty message as null', () => {
    const body = buildSubmitBody(party([guest('g1')]), { g1: answered() }, [], '   ');

    expect(body?.message).toBeNull();
  });

  it('trims new guest names and omits the client-side key', () => {
    const body = buildSubmitBody(
      party([guest('g1')]),
      { g1: answered() },
      [newGuest({ firstName: '  Sam ', lastName: ' Rivera  ' })],
      '',
    );

    expect(body?.newGuests).toEqual([
      { firstName: 'Sam', lastName: 'Rivera', rsvpStatus: 'attending', songRequest: null },
    ]);
  });

  it.each([
    ['a blank first name', { firstName: '  ' }],
    ['a blank last name', { lastName: '' }],
    ['no answer', { rsvpStatus: null }],
  ])('returns null when a new guest has %s', (_label, overrides) => {
    const body = buildSubmitBody(
      party([guest('g1')]),
      { g1: answered() },
      [newGuest(overrides)],
      '',
    );

    expect(body).toBeNull();
  });
});
