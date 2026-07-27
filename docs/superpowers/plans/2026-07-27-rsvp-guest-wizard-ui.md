# RSVP Guest Wizard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public `/rsvp` guest wizard — name lookup, party disambiguation, a one-page editor for everyone's yes/no, song requests, added guests and a message, then submit and confirmation — on top of the guest API shipped in #64.

**Architecture:** `src/app/rsvp/page.tsx` is a static server shell (`<Header/>` + `<RsvpWizard/>`). `RsvpWizard` is a `'use client'` discriminated-union state machine that owns every API call and maps each error code to a state. All rules that can be decided without React live in pure functions (`src/lib/rsvp/draft.ts`), and all HTTP lives behind one module (`src/lib/rsvp/client.ts`) that doubles as the test seam.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Vitest + React Testing Library (jsdom).

**Design spec:** `docs/superpowers/specs/2026-07-27-rsvp-guest-wizard-ui-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No new npm dependencies.** `@testing-library/user-event` is **not** installed — interaction tests use `fireEvent` from `@testing-library/react`. Adding a dependency would force regenerating the lockfile inside the Linux image (`LEARNINGS.md`, 2026-07-25).
- **Tailwind utility classes only.** No custom CSS, no new colors. The palette is `sage-50`, `sage-100`, `sage-200`, `sage-700`, `sage-800` (`src/app/globals.css`); `font-serif` is inherited from the root layout.
- **Mobile-first**, `md:` breakpoint for desktop.
- **Path alias `@/` → `src/`.**
- **Component style matches `src/components/Header.tsx`:** named exports, arrow functions, `React.FC` or `React.FC<Props>`, single-quoted strings, props interface declared directly above the component.
- **`'use client'` only on components that use hooks.** In this feature that is exactly `RsvpWizard`, `PartyLookup`, and `PartyForm`. Presentational children are pulled into the client graph by their importer and must not carry the directive (`AGENTS.md`).
- **Client-safe imports:** nothing under `src/components/rsvp/` or in `src/lib/rsvp/{types,client,draft}.ts` may import `@/generated/prisma/client`, `@/lib/prisma`, `@/lib/rsvp/parties`, `@/lib/rsvp/policy`, `@/lib/rsvp/schemas`, or `@/lib/rsvp/errors`. Importing `@/lib/enums` is fine — it imports nothing.
- **Do not modify** `src/constants/events.ts` (`NAV_LINKS`), `src/components/Header.tsx`, or any file under `src/app/api/` — the nav entry belongs to #71 and the API is frozen at #64's behavior.
- **Copy rule:** the "can't find yourself" and closed-page paths say to contact **the bride or groom**. No mailto link, no email address, no phone number anywhere in this feature.
- **Verification gate** (CI order): `npm run lint && npm run check:images && npm test && npm run build`.
- **Commit style:** conventional commits, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` as the last line.
- **Working directory:** `.claude/worktrees/issue-67-guest-rsvp-wizard-ui` on branch `issue-67-guest-rsvp-wizard-ui`.

---

### Task 1: Prisma-free response types

Extract the API response interfaces out of `src/lib/rsvp/parties.ts` (which imports Prisma) into a module with no imports, so client code can type itself against the API without a Prisma import in the same statement.

**Files:**
- Create: `src/lib/rsvp/types.ts`
- Modify: `src/lib/rsvp/parties.ts` (remove the three `export interface` blocks at lines 21–45; add an import and a re-export)

**Interfaces:**
- Consumes: `RsvpStatus` from `@/lib/enums`
- Produces: `SubmittableRsvpStatus`, `PartySearchResult`, `PartyDetailGuest`, `PartyDetail`, `SubmitRsvpGuest`, `SubmitRsvpNewGuest`, `SubmitRsvpBody`, `GuestDraft`, `NewGuestDraft`

**This task has no behavior change, so there is no failing test to write first.** Moving types cannot be observed at runtime. Its gate is that the existing suite and the type-checking build both stay green — `npm run build` is the real check here, because neither `npm test` nor `npm run lint` typechecks (`LEARNINGS.md`, 2026-07-26).

- [ ] **Step 1: Create `src/lib/rsvp/types.ts`**

```ts
import type { RsvpStatus } from '@/lib/enums';

/** The two statuses a guest may submit; `pending` is a server-side initial state. */
export type SubmittableRsvpStatus = Exclude<RsvpStatus, 'pending'>;

export interface PartySearchResult {
  id: string;
  displayName: string;
  guestFirstNames: string[];
}

export interface PartyDetailGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
}

export interface PartyDetail {
  id: string;
  displayName: string;
  message: string | null;
  addGuestCap: number;
  addedGuestsRemaining: number;
  rsvpDeadline: string;
  guests: PartyDetailGuest[];
}

export interface SubmitRsvpGuest {
  id: string;
  rsvpStatus: SubmittableRsvpStatus;
  songRequest: string | null;
}

export interface SubmitRsvpNewGuest {
  firstName: string;
  lastName: string;
  rsvpStatus: SubmittableRsvpStatus;
  songRequest: string | null;
}

export interface SubmitRsvpBody {
  message: string | null;
  guests: SubmitRsvpGuest[];
  newGuests: SubmitRsvpNewGuest[];
}

/** One party guest's in-progress answers, before they are submitted. */
export interface GuestDraft {
  rsvpStatus: SubmittableRsvpStatus | null;
  songRequest: string;
}

/** A guest the party is adding, not yet persisted. */
export interface NewGuestDraft {
  /** Stable React key for the draft row. Client-side only; never sent to the server. */
  key: string;
  firstName: string;
  lastName: string;
  rsvpStatus: SubmittableRsvpStatus | null;
  songRequest: string;
}
```

- [ ] **Step 2: Point `src/lib/rsvp/parties.ts` at the new module**

Delete the `export interface PartySearchResult`, `export interface PartyDetailGuest`, and `export interface PartyDetail` blocks (currently lines 21–45). Add this import next to the existing imports at the top of the file:

```ts
import type { PartyDetail, PartyDetailGuest, PartySearchResult } from '@/lib/rsvp/types';
```

Then, where the interfaces used to be, re-export them so every existing importer (including #65's admin code) keeps working unchanged:

```ts
export type { PartyDetail, PartyDetailGuest, PartySearchResult };
```

Leave everything else in the file — `GUEST_ORDER`, `requireSettings`, `requireRsvpOpen`, `searchParties`, `getPartyDetail`, `submitRsvp`, and the internal `PartyRecord`/`GuestRecord` interfaces — untouched. `GuestRecord extends PartyDetailGuest` still resolves through the import.

- [ ] **Step 3: Verify nothing broke**

Run: `npm test && npm run build`
Expected: the whole existing suite passes and the build completes with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rsvp/types.ts src/lib/rsvp/parties.ts
git commit -m "refactor(rsvp): move guest API response types to a Prisma-free module

Client components need these interfaces; importing them from parties.ts
means importing a module that pulls in the Prisma client, one accidental
value import away from shipping Prisma to the browser.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Guest API client

One module wrapping the three endpoints, normalizing every failure — HTTP error, malformed body, unreachable network — into a single `RsvpApiError`. This is the only place in the feature that calls `fetch`, and the `vi.mock` seam for every later component test.

**Files:**
- Create: `src/lib/rsvp/client.ts`
- Test: `src/lib/rsvp/client.test.ts`

**Interfaces:**
- Consumes: `PartyDetail`, `PartySearchResult`, `SubmitRsvpBody` from `@/lib/rsvp/types` (Task 1)
- Produces:
  - `class RsvpApiError extends Error` with `readonly status: number`, `readonly code: string`, `readonly details: Record<string, unknown>`; constructor `(status, code, message, details = {})`
  - `searchParties(query: string): Promise<PartySearchResult[]>`
  - `fetchParty(partyId: string): Promise<PartyDetail>`
  - `submitRsvp(partyId: string, input: SubmitRsvpBody): Promise<PartyDetail>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rsvp/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RsvpApiError, fetchParty, searchParties, submitRsvp } from './client';
import type { PartyDetail, SubmitRsvpBody } from '@/lib/rsvp/types';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (response: Response | Promise<Response>) => {
  const spy = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const PARTY: PartyDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 5,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [],
};

const SUBMIT_BODY: SubmitRsvpBody = { message: null, guests: [], newGuests: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchParties', () => {
  it('URL-encodes the query and unwraps the parties array', async () => {
    const spy = stubFetch(jsonResponse(200, { parties: [{ id: 'a', displayName: 'A', guestFirstNames: ['Al'] }] }));

    const result = await searchParties('mary jo van der berg');

    expect(spy).toHaveBeenCalledWith('/api/parties/search?q=mary%20jo%20van%20der%20berg', undefined);
    expect(result).toEqual([{ id: 'a', displayName: 'A', guestFirstNames: ['Al'] }]);
  });

  it('returns an empty array when nothing matches', async () => {
    stubFetch(jsonResponse(200, { parties: [] }));

    await expect(searchParties('no body')).resolves.toEqual([]);
  });
});

describe('fetchParty', () => {
  it('requests the party by id', async () => {
    const spy = stubFetch(jsonResponse(200, PARTY));

    await expect(fetchParty(PARTY.id)).resolves.toEqual(PARTY);
    expect(spy).toHaveBeenCalledWith(`/api/parties/${PARTY.id}`, undefined);
  });
});

describe('submitRsvp', () => {
  it('PATCHes the body as JSON', async () => {
    const spy = stubFetch(jsonResponse(200, PARTY));

    await expect(submitRsvp(PARTY.id, SUBMIT_BODY)).resolves.toEqual(PARTY);
    expect(spy).toHaveBeenCalledWith(`/api/parties/${PARTY.id}/rsvp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SUBMIT_BODY),
    });
  });
});

describe('error mapping', () => {
  it('carries the server code, message and extra details', async () => {
    stubFetch(jsonResponse(403, {
      error: 'RSVPs are closed.',
      code: 'rsvp_closed',
      deadline: '2026-09-10T00:00:00.000Z',
    }));

    const error = await fetchParty(PARTY.id).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RsvpApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'rsvp_closed',
      message: 'RSVPs are closed.',
      details: { deadline: '2026-09-10T00:00:00.000Z' },
    });
  });

  it('falls back to unknown_error when the failure body is not JSON', async () => {
    stubFetch(new Response('<html>gateway blew up</html>', { status: 500 }));

    const error = await fetchParty(PARTY.id).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 500, code: 'unknown_error' });
  });

  it('reports an unreachable server as network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    const error = await fetchParty(PARTY.id).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/rsvp/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rsvp/client.ts`:

```ts
import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_ERROR_MESSAGE =
  'We could not reach the server. Please check your connection and try again.';

/** A failed call to the guest RSVP API, carrying the server's machine-readable code. */
export class RsvpApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'RsvpApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toApiError = (status: number, body: unknown): RsvpApiError => {
  const payload: Record<string, unknown> = isRecord(body) ? body : {};
  const { error, code, ...details } = payload;

  return new RsvpApiError(
    status,
    typeof code === 'string' ? code : 'unknown_error',
    typeof error === 'string' ? error : GENERIC_ERROR_MESSAGE,
    details,
  );
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new RsvpApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  if (!isRecord(body)) {
    throw new RsvpApiError(response.status, 'unknown_error', GENERIC_ERROR_MESSAGE);
  }

  return body as T;
};

export const searchParties = async (query: string): Promise<PartySearchResult[]> => {
  const body = await request<{ parties: PartySearchResult[] }>(
    `/api/parties/search?q=${encodeURIComponent(query)}`,
  );

  return body.parties;
};

export const fetchParty = (partyId: string): Promise<PartyDetail> =>
  request<PartyDetail>(`/api/parties/${partyId}`);

export const submitRsvp = (partyId: string, input: SubmitRsvpBody): Promise<PartyDetail> =>
  request<PartyDetail>(`/api/parties/${partyId}/rsvp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/rsvp/client.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rsvp/client.ts src/lib/rsvp/client.test.ts
git commit -m "feat(rsvp): add a typed client for the guest API

Normalizes HTTP failures, non-JSON bodies and unreachable-network errors
into one RsvpApiError so callers handle a single error type.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure draft rules

The rules that turn form state into a submit payload, with no React and no `fetch`. `buildSubmitBody` returning `SubmitRsvpBody | null` makes one function the single source of truth for both "is Submit enabled" and "what gets sent", so the two cannot drift apart.

**Files:**
- Create: `src/lib/rsvp/draft.ts`
- Test: `src/lib/rsvp/draft.test.ts`

**Interfaces:**
- Consumes: `RSVP_STATUS` from `@/lib/enums`; `GuestDraft`, `NewGuestDraft`, `PartyDetail`, `SubmitRsvpBody`, `SubmitRsvpGuest`, `SubmitRsvpNewGuest`, `SubmittableRsvpStatus` from `@/lib/rsvp/types`
- Produces:
  - `toSubmittableStatus(status: string): SubmittableRsvpStatus | null`
  - `initialGuestDrafts(party: PartyDetail): Record<string, GuestDraft>`
  - `emptyNewGuestDraft(): NewGuestDraft`
  - `buildSubmitBody(party, guestDrafts, newGuests, message): SubmitRsvpBody | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rsvp/draft.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/rsvp/draft.test.ts`
Expected: FAIL — cannot resolve `./draft`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rsvp/draft.ts`:

```ts
import { RSVP_STATUS } from '@/lib/enums';
import type {
  GuestDraft,
  NewGuestDraft,
  PartyDetail,
  SubmitRsvpBody,
  SubmitRsvpGuest,
  SubmitRsvpNewGuest,
  SubmittableRsvpStatus,
} from '@/lib/rsvp/types';

const SUBMITTABLE_STATUSES = new Set<string>([RSVP_STATUS.attending, RSVP_STATUS.declined]);

/**
 * Narrows a stored status to one a guest may submit. `pending` — and any value
 * a later migration introduces — becomes `null`, which the form renders as
 * unanswered rather than guessing on the guest's behalf.
 */
export const toSubmittableStatus = (status: string): SubmittableRsvpStatus | null =>
  SUBMITTABLE_STATUSES.has(status) ? (status as SubmittableRsvpStatus) : null;

/** Seeds one draft per party guest from their currently stored answers. */
export const initialGuestDrafts = (party: PartyDetail): Record<string, GuestDraft> =>
  Object.fromEntries(
    party.guests.map((guest) => [
      guest.id,
      {
        rsvpStatus: toSubmittableStatus(guest.rsvpStatus),
        songRequest: guest.songRequest ?? '',
      },
    ]),
  );

export const emptyNewGuestDraft = (): NewGuestDraft => ({
  key: crypto.randomUUID(),
  firstName: '',
  lastName: '',
  rsvpStatus: null,
  songRequest: '',
});

const resolveSongRequest = (draft: GuestDraft | NewGuestDraft): string | null => {
  if (draft.rsvpStatus !== RSVP_STATUS.attending) {
    return null;
  }

  const trimmed = draft.songRequest.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Builds the submit payload, or `null` when the draft is incomplete. One
 * function decides both whether Submit is enabled and what it sends, so the
 * button state and the request body cannot disagree.
 */
export const buildSubmitBody = (
  party: PartyDetail,
  guestDrafts: Record<string, GuestDraft>,
  newGuests: NewGuestDraft[],
  message: string,
): SubmitRsvpBody | null => {
  const guests: SubmitRsvpGuest[] = [];

  for (const guest of party.guests) {
    const draft = guestDrafts[guest.id];

    if (!draft || draft.rsvpStatus === null) {
      return null;
    }

    guests.push({
      id: guest.id,
      rsvpStatus: draft.rsvpStatus,
      songRequest: resolveSongRequest(draft),
    });
  }

  const addedGuests: SubmitRsvpNewGuest[] = [];

  for (const draft of newGuests) {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();

    if (draft.rsvpStatus === null || firstName.length === 0 || lastName.length === 0) {
      return null;
    }

    addedGuests.push({
      firstName,
      lastName,
      rsvpStatus: draft.rsvpStatus,
      songRequest: resolveSongRequest(draft),
    });
  }

  const trimmedMessage = message.trim();

  return {
    message: trimmedMessage.length > 0 ? trimmedMessage : null,
    guests,
    newGuests: addedGuests,
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/rsvp/draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rsvp/draft.ts src/lib/rsvp/draft.test.ts
git commit -m "feat(rsvp): add pure draft-to-payload rules for the wizard

buildSubmitBody returns null exactly when the draft is incomplete, so the
Submit button's enabled state and the request body come from one function.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Guest row components

The three presentational pieces the editor repeats: the Attending/Declined toggle, an existing guest's row, and a draft added-guest's row. None of them use hooks, so none carry `'use client'`.

**Files:**
- Create: `src/components/rsvp/RsvpStatusToggle.tsx`
- Create: `src/components/rsvp/GuestRsvpFields.tsx`
- Create: `src/components/rsvp/AddedGuestFields.tsx`
- Test: `src/components/rsvp/RsvpStatusToggle.test.tsx`
- Test: `src/components/rsvp/GuestRsvpFields.test.tsx`
- Test: `src/components/rsvp/AddedGuestFields.test.tsx`

**Interfaces:**
- Consumes: `RSVP_STATUS` from `@/lib/enums`; `GuestDraft`, `NewGuestDraft`, `PartyDetailGuest`, `SubmittableRsvpStatus` from `@/lib/rsvp/types`; `emptyNewGuestDraft` from `@/lib/rsvp/draft` (tests only)
- Produces:
  - `RsvpStatusToggle: React.FC<{ name: string; legend: string; value: SubmittableRsvpStatus | null; onChange: (status: SubmittableRsvpStatus) => void }>`
  - `GuestRsvpFields: React.FC<{ guest: PartyDetailGuest; draft: GuestDraft; onChange: (draft: GuestDraft) => void }>`
  - `AddedGuestFields: React.FC<{ position: number; draft: NewGuestDraft; onChange: (draft: NewGuestDraft) => void; onRemove: () => void }>`

`RsvpStatusToggle` is extracted at its second use rather than its third because it carries accessibility structure — a labelled radio group — not just repeated markup.

- [ ] **Step 1: Write the failing test for `RsvpStatusToggle`**

Create `src/components/rsvp/RsvpStatusToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RsvpStatusToggle } from './RsvpStatusToggle';

const renderToggle = (value: 'attending' | 'declined' | null, onChange = vi.fn()) => {
  render(
    <RsvpStatusToggle name='status-g1' legend='Will John Smith attend?' value={value} onChange={onChange} />,
  );
  return onChange;
};

describe('RsvpStatusToggle', () => {
  it('offers exactly Attending and Declined', () => {
    renderToggle(null);

    expect(screen.getByRole('radio', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Declined' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('checks neither option when unanswered', () => {
    renderToggle(null);

    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
  });

  it('checks the current value', () => {
    renderToggle('declined');

    expect(screen.getByRole('radio', { name: 'Declined' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Attending' })).not.toBeChecked();
  });

  it('reports the chosen status', () => {
    const onChange = renderToggle(null);

    fireEvent.click(screen.getByRole('radio', { name: 'Attending' }));

    expect(onChange).toHaveBeenCalledWith('attending');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/RsvpStatusToggle.test.tsx`
Expected: FAIL — cannot resolve `./RsvpStatusToggle`.

- [ ] **Step 3: Implement `RsvpStatusToggle`**

Create `src/components/rsvp/RsvpStatusToggle.tsx`:

```tsx
import { RSVP_STATUS } from '@/lib/enums';
import type { SubmittableRsvpStatus } from '@/lib/rsvp/types';

interface RsvpStatusToggleProps {
  name: string;
  legend: string;
  value: SubmittableRsvpStatus | null;
  onChange: (status: SubmittableRsvpStatus) => void;
}

const OPTIONS: { status: SubmittableRsvpStatus; label: string }[] = [
  { status: RSVP_STATUS.attending, label: 'Attending' },
  { status: RSVP_STATUS.declined, label: 'Declined' },
];

export const RsvpStatusToggle: React.FC<RsvpStatusToggleProps> = ({
  name,
  legend,
  value,
  onChange,
}) => (
  <fieldset className='mt-3'>
    <legend className='sr-only'>{legend}</legend>
    <div className='flex gap-3'>
      {OPTIONS.map(({ status, label }) => (
        <label
          key={status}
          className={`flex-1 cursor-pointer rounded-full border px-4 py-2 text-center text-sm transition-colors ${
            value === status
              ? 'border-sage-700 bg-sage-700 text-white'
              : 'border-sage-200 bg-white text-sage-700 hover:border-sage-700'
          }`}
        >
          <input
            type='radio'
            className='sr-only'
            name={name}
            value={status}
            checked={value === status}
            onChange={() => onChange(status)}
          />
          {label}
        </label>
      ))}
    </div>
  </fieldset>
);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/RsvpStatusToggle.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for `GuestRsvpFields`**

Create `src/components/rsvp/GuestRsvpFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestRsvpFields } from './GuestRsvpFields';
import type { GuestDraft, PartyDetailGuest } from '@/lib/rsvp/types';

const GUEST: PartyDetailGuest = {
  id: 'g1',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'admin',
};

const renderFields = (draft: GuestDraft, onChange = vi.fn()) => {
  render(<GuestRsvpFields guest={GUEST} draft={draft} onChange={onChange} />);
  return onChange;
};

describe('GuestRsvpFields', () => {
  it('shows the guest full name', () => {
    renderFields({ rsvpStatus: null, songRequest: '' });

    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('hides the song request before the guest has answered', () => {
    renderFields({ rsvpStatus: null, songRequest: '' });

    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();
  });

  it('hides the song request when the guest declines', () => {
    renderFields({ rsvpStatus: 'declined', songRequest: '' });

    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();
  });

  it('shows the song request once the guest is attending', () => {
    renderFields({ rsvpStatus: 'attending', songRequest: 'September' });

    expect(screen.getByLabelText(/song request/i)).toHaveValue('September');
  });

  it('reports a status change without discarding the typed song', () => {
    const onChange = renderFields({ rsvpStatus: 'attending', songRequest: 'September' });

    fireEvent.click(screen.getByRole('radio', { name: 'Declined' }));

    expect(onChange).toHaveBeenCalledWith({ rsvpStatus: 'declined', songRequest: 'September' });
  });

  it('reports a song request change', () => {
    const onChange = renderFields({ rsvpStatus: 'attending', songRequest: '' });

    fireEvent.change(screen.getByLabelText(/song request/i), { target: { value: 'Dancing Queen' } });

    expect(onChange).toHaveBeenCalledWith({ rsvpStatus: 'attending', songRequest: 'Dancing Queen' });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/GuestRsvpFields.test.tsx`
Expected: FAIL — cannot resolve `./GuestRsvpFields`.

- [ ] **Step 7: Implement `GuestRsvpFields`**

Create `src/components/rsvp/GuestRsvpFields.tsx`:

```tsx
import { RSVP_STATUS } from '@/lib/enums';
import { RsvpStatusToggle } from './RsvpStatusToggle';
import type { GuestDraft, PartyDetailGuest } from '@/lib/rsvp/types';

interface GuestRsvpFieldsProps {
  guest: PartyDetailGuest;
  draft: GuestDraft;
  onChange: (draft: GuestDraft) => void;
}

export const GuestRsvpFields: React.FC<GuestRsvpFieldsProps> = ({ guest, draft, onChange }) => {
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const songRequestId = `guest-${guest.id}-song-request`;

  return (
    <div className='border-b border-sage-200 py-5 last:border-b-0'>
      <p className='text-lg text-sage-800'>{fullName}</p>

      <RsvpStatusToggle
        name={`guest-${guest.id}-status`}
        legend={`Will ${fullName} attend?`}
        value={draft.rsvpStatus}
        onChange={(rsvpStatus) => onChange({ ...draft, rsvpStatus })}
      />

      {draft.rsvpStatus === RSVP_STATUS.attending && (
        <div className='mt-3'>
          <label className='text-sm text-sage-700' htmlFor={songRequestId}>
            Song request for {fullName} (optional)
          </label>
          <input
            id={songRequestId}
            type='text'
            maxLength={200}
            value={draft.songRequest}
            onChange={(event) => onChange({ ...draft, songRequest: event.target.value })}
            className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none'
          />
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/GuestRsvpFields.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 9: Write the failing test for `AddedGuestFields`**

Create `src/components/rsvp/AddedGuestFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddedGuestFields } from './AddedGuestFields';
import { emptyNewGuestDraft } from '@/lib/rsvp/draft';
import type { NewGuestDraft } from '@/lib/rsvp/types';

const draftWith = (overrides: Partial<NewGuestDraft> = {}): NewGuestDraft => ({
  ...emptyNewGuestDraft(),
  ...overrides,
});

describe('AddedGuestFields', () => {
  it('labels the row by its position', () => {
    render(
      <AddedGuestFields position={2} draft={draftWith()} onChange={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('Additional guest 2')).toBeInTheDocument();
  });

  it('reports first and last name edits', () => {
    const onChange = vi.fn();
    const draft = draftWith();
    render(
      <AddedGuestFields position={1} draft={draft} onChange={onChange} onRemove={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Rivera' } });

    expect(onChange).toHaveBeenNthCalledWith(1, { ...draft, firstName: 'Sam' });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...draft, lastName: 'Rivera' });
  });

  it('shows the song request only once the added guest is attending', () => {
    const { rerender } = render(
      <AddedGuestFields position={1} draft={draftWith()} onChange={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/song request/i)).not.toBeInTheDocument();

    rerender(
      <AddedGuestFields
        position={1}
        draft={draftWith({ rsvpStatus: 'attending' })}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/song request/i)).toBeInTheDocument();
  });

  it('removes the row on request', () => {
    const onRemove = vi.fn();
    render(
      <AddedGuestFields position={1} draft={draftWith()} onChange={vi.fn()} onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove additional guest 1' }));

    expect(onRemove).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/AddedGuestFields.test.tsx`
Expected: FAIL — cannot resolve `./AddedGuestFields`.

- [ ] **Step 11: Implement `AddedGuestFields`**

Create `src/components/rsvp/AddedGuestFields.tsx`:

```tsx
import { RSVP_STATUS } from '@/lib/enums';
import { RsvpStatusToggle } from './RsvpStatusToggle';
import type { NewGuestDraft } from '@/lib/rsvp/types';

interface AddedGuestFieldsProps {
  position: number;
  draft: NewGuestDraft;
  onChange: (draft: NewGuestDraft) => void;
  onRemove: () => void;
}

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

export const AddedGuestFields: React.FC<AddedGuestFieldsProps> = ({
  position,
  draft,
  onChange,
  onRemove,
}) => {
  const label = `Additional guest ${position}`;
  const firstNameId = `new-guest-${draft.key}-first-name`;
  const lastNameId = `new-guest-${draft.key}-last-name`;
  const songRequestId = `new-guest-${draft.key}-song-request`;

  return (
    <div className='mt-5 rounded-md border border-sage-200 bg-white/60 p-4'>
      <div className='flex items-center justify-between'>
        <p className='text-sage-800'>{label}</p>
        <button type='button' onClick={onRemove} className='text-sm text-sage-700 underline'>
          Remove {label.toLowerCase()}
        </button>
      </div>

      <div className='mt-3 flex flex-col gap-3 md:flex-row'>
        <div className='flex-1'>
          <label className='text-sm text-sage-700' htmlFor={firstNameId}>
            First name
          </label>
          <input
            id={firstNameId}
            type='text'
            maxLength={100}
            value={draft.firstName}
            onChange={(event) => onChange({ ...draft, firstName: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <div className='flex-1'>
          <label className='text-sm text-sage-700' htmlFor={lastNameId}>
            Last name
          </label>
          <input
            id={lastNameId}
            type='text'
            maxLength={100}
            value={draft.lastName}
            onChange={(event) => onChange({ ...draft, lastName: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <RsvpStatusToggle
        name={`new-guest-${draft.key}-status`}
        legend={`Will ${label.toLowerCase()} attend?`}
        value={draft.rsvpStatus}
        onChange={(rsvpStatus) => onChange({ ...draft, rsvpStatus })}
      />

      {draft.rsvpStatus === RSVP_STATUS.attending && (
        <div className='mt-3'>
          <label className='text-sm text-sage-700' htmlFor={songRequestId}>
            Song request for {label.toLowerCase()} (optional)
          </label>
          <input
            id={songRequestId}
            type='text'
            maxLength={200}
            value={draft.songRequest}
            onChange={(event) => onChange({ ...draft, songRequest: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      )}
    </div>
  );
};
```

Note the `Remove {label.toLowerCase()}` button text — it makes the accessible name unique per row (`Remove additional guest 1`), which is what lets a test target one row's remove button when several are on screen.

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/AddedGuestFields.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 13: Commit**

```bash
git add src/components/rsvp/RsvpStatusToggle.tsx src/components/rsvp/RsvpStatusToggle.test.tsx \
        src/components/rsvp/GuestRsvpFields.tsx src/components/rsvp/GuestRsvpFields.test.tsx \
        src/components/rsvp/AddedGuestFields.tsx src/components/rsvp/AddedGuestFields.test.tsx
git commit -m "feat(rsvp): add guest row components for the wizard editor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Finding your party

The two screens before the editor: the name lookup form and the disambiguation list. Both are controlled by the wizard — they render what they are given and report intent upward.

**Files:**
- Create: `src/components/rsvp/PartyLookup.tsx`
- Create: `src/components/rsvp/PartyPicker.tsx`
- Test: `src/components/rsvp/PartyLookup.test.tsx`
- Test: `src/components/rsvp/PartyPicker.test.tsx`

**Interfaces:**
- Consumes: `PartySearchResult` from `@/lib/rsvp/types`
- Produces:
  - `PartyLookup: React.FC<{ isSearching: boolean; errorMessage: string | null; showNotFound: boolean; onSearch: (query: string) => void }>`
  - `PartyPicker: React.FC<{ matches: PartySearchResult[]; onSelect: (partyId: string) => void; onStartOver: () => void }>`

- [ ] **Step 1: Write the failing test for `PartyLookup`**

Create `src/components/rsvp/PartyLookup.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyLookup } from './PartyLookup';

const renderLookup = (props: Partial<React.ComponentProps<typeof PartyLookup>> = {}) => {
  const onSearch = vi.fn();
  render(
    <PartyLookup
      isSearching={false}
      errorMessage={null}
      showNotFound={false}
      onSearch={onSearch}
      {...props}
    />,
  );
  return onSearch;
};

describe('PartyLookup', () => {
  it('submits the typed name', () => {
    const onSearch = renderLookup();

    fireEvent.change(screen.getByLabelText(/first and last name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find my invitation/i }));

    expect(onSearch).toHaveBeenCalledWith('John Smith');
  });

  it('shows the error message from the server', () => {
    renderLookup({ errorMessage: 'Enter a first and last name' });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a first and last name');
  });

  it('points an unmatched guest at the bride or groom, with no mailto', () => {
    renderLookup({ showNotFound: true });

    expect(screen.getByText(/contact the bride or groom/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('hides the not-found message until a search has come back empty', () => {
    renderLookup();

    expect(screen.queryByText(/contact the bride or groom/i)).not.toBeInTheDocument();
  });

  it('disables the button while a search is in flight', () => {
    renderLookup({ isSearching: true });

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/PartyLookup.test.tsx`
Expected: FAIL — cannot resolve `./PartyLookup`.

- [ ] **Step 3: Implement `PartyLookup`**

Create `src/components/rsvp/PartyLookup.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface PartyLookupProps {
  isSearching: boolean;
  errorMessage: string | null;
  showNotFound: boolean;
  onSearch: (query: string) => void;
}

export const PartyLookup: React.FC<PartyLookupProps> = ({
  isSearching,
  errorMessage,
  showNotFound,
  onSearch,
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <section className='w-full max-w-md'>
      <h1 className='text-center text-3xl text-sage-800'>RSVP</h1>
      <p className='mt-3 text-center text-xs uppercase tracking-[0.4em] text-sage-700/70'>
        Find your invitation
      </p>

      <form className='mt-8' onSubmit={handleSubmit}>
        <label className='text-sm text-sage-700' htmlFor='party-search'>
          Enter your first and last name
        </label>
        <input
          id='party-search'
          type='text'
          autoComplete='name'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sage-800 focus:border-sage-700 focus:outline-none'
        />

        {errorMessage && (
          <p role='alert' className='mt-2 text-sm text-sage-800'>
            {errorMessage}
          </p>
        )}

        <button
          type='submit'
          disabled={isSearching}
          className='mt-5 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800 disabled:opacity-60'
        >
          {isSearching ? 'Searching…' : 'Find my invitation'}
        </button>
      </form>

      {showNotFound && (
        <p className='mt-6 text-center text-sm text-sage-700'>
          We could not find that name on our guest list. Please double-check the spelling, or
          contact the bride or groom and we will get you sorted.
        </p>
      )}
    </section>
  );
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/PartyLookup.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for `PartyPicker`**

Create `src/components/rsvp/PartyPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyPicker } from './PartyPicker';
import type { PartySearchResult } from '@/lib/rsvp/types';

const MATCHES: PartySearchResult[] = [
  { id: 'p1', displayName: 'The Smith Family', guestFirstNames: ['John', 'Jane'] },
  { id: 'p2', displayName: 'John Smith & Guest', guestFirstNames: ['John', 'Dana'] },
];

describe('PartyPicker', () => {
  it('lists every match with its member first names', () => {
    render(<PartyPicker matches={MATCHES} onSelect={vi.fn()} onStartOver={vi.fn()} />);

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John, Jane')).toBeInTheDocument();
    expect(screen.getByText('John Smith & Guest')).toBeInTheDocument();
    expect(screen.getByText('John, Dana')).toBeInTheDocument();
  });

  it('reports the chosen party id', () => {
    const onSelect = vi.fn();
    render(<PartyPicker matches={MATCHES} onSelect={onSelect} onStartOver={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /John Smith & Guest/ }));

    expect(onSelect).toHaveBeenCalledWith('p2');
  });

  it('offers a way back to the search', () => {
    const onStartOver = vi.fn();
    render(<PartyPicker matches={MATCHES} onSelect={vi.fn()} onStartOver={onStartOver} />);

    fireEvent.click(screen.getByRole('button', { name: /search for a different name/i }));

    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/PartyPicker.test.tsx`
Expected: FAIL — cannot resolve `./PartyPicker`.

- [ ] **Step 7: Implement `PartyPicker`**

Create `src/components/rsvp/PartyPicker.tsx`:

```tsx
import type { PartySearchResult } from '@/lib/rsvp/types';

interface PartyPickerProps {
  matches: PartySearchResult[];
  onSelect: (partyId: string) => void;
  onStartOver: () => void;
}

export const PartyPicker: React.FC<PartyPickerProps> = ({ matches, onSelect, onStartOver }) => (
  <section className='w-full max-w-md'>
    <h1 className='text-center text-3xl text-sage-800'>Which one is you?</h1>
    <p className='mt-3 text-center text-sm text-sage-700'>
      We found more than one match. Pick the group you belong to.
    </p>

    <ul className='mt-8 space-y-3'>
      {matches.map((match) => (
        <li key={match.id}>
          <button
            type='button'
            onClick={() => onSelect(match.id)}
            className='w-full rounded-md border border-sage-200 bg-white px-4 py-3 text-left transition-colors hover:border-sage-700'
          >
            <span className='block text-sage-800'>{match.displayName}</span>
            <span className='block text-sm text-sage-700'>{match.guestFirstNames.join(', ')}</span>
          </button>
        </li>
      ))}
    </ul>

    <button
      type='button'
      onClick={onStartOver}
      className='mt-6 w-full text-sm text-sage-700 underline'
    >
      Search for a different name
    </button>
  </section>
);
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/PartyPicker.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/rsvp/PartyLookup.tsx src/components/rsvp/PartyLookup.test.tsx \
        src/components/rsvp/PartyPicker.tsx src/components/rsvp/PartyPicker.test.tsx
git commit -m "feat(rsvp): add name lookup and party disambiguation screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The one-page editor

Everything a party edits on one screen with a single Submit: each guest's status and song, added guests up to the cap, and the message to the couple.

**Files:**
- Create: `src/components/rsvp/PartyForm.tsx`
- Test: `src/components/rsvp/PartyForm.test.tsx`

**Interfaces:**
- Consumes: `GuestRsvpFields`, `AddedGuestFields` (Task 4); `buildSubmitBody`, `emptyNewGuestDraft`, `initialGuestDrafts` from `@/lib/rsvp/draft` (Task 3); `GuestDraft`, `NewGuestDraft`, `PartyDetail`, `SubmitRsvpBody` from `@/lib/rsvp/types`
- Produces: `PartyForm: React.FC<{ party: PartyDetail; notice: string | null; errorMessage: string | null; isSubmitting: boolean; onSubmit: (body: SubmitRsvpBody) => void }>`

`PartyForm` seeds its state from `party` **once**, on mount. The wizard resets it after a conflict refetch by changing its `key`, which is React's standard remount-to-reset idiom — the alternative, syncing props into state with an effect, is the classic source of stale-draft bugs.

- [ ] **Step 1: Write the failing test**

Create `src/components/rsvp/PartyForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PartyForm } from './PartyForm';
import type { PartyDetail } from '@/lib/rsvp/types';

const party = (overrides: Partial<PartyDetail> = {}): PartyDetail => ({
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 2,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
    { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
  ],
  ...overrides,
});

const renderForm = (overrides: Partial<React.ComponentProps<typeof PartyForm>> = {}) => {
  const onSubmit = vi.fn();
  render(
    <PartyForm
      party={party()}
      notice={null}
      errorMessage={null}
      isSubmitting={false}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return onSubmit;
};

const answer = (guestName: string, choice: 'Attending' | 'Declined') => {
  const row = screen.getByText(guestName).closest('div');
  if (!row) throw new Error(`No row found for ${guestName}`);
  fireEvent.click(within(row).getByRole('radio', { name: choice }));
};

describe('PartyForm', () => {
  it('shows the party name and every guest', () => {
    renderForm();

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('preselects stored answers and prefills the message', () => {
    renderForm({
      party: party({
        message: 'See you there',
        guests: [
          { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending', songRequest: 'September', source: 'admin' },
        ],
      }),
    });

    expect(screen.getByRole('radio', { name: 'Attending' })).toBeChecked();
    expect(screen.getByLabelText(/song request/i)).toHaveValue('September');
    expect(screen.getByLabelText(/message to the couple/i)).toHaveValue('See you there');
  });

  it('keeps Submit disabled until every guest is answered', () => {
    renderForm();
    const submit = screen.getByRole('button', { name: /submit rsvp/i });

    expect(submit).toBeDisabled();
    expect(screen.getByText(/please answer for everyone/i)).toBeInTheDocument();

    answer('John Smith', 'Attending');
    expect(submit).toBeDisabled();

    answer('Jane Smith', 'Declined');
    expect(submit).toBeEnabled();
    expect(screen.queryByText(/please answer for everyone/i)).not.toBeInTheDocument();
  });

  it('submits the whole party state', () => {
    const onSubmit = renderForm();

    answer('John Smith', 'Attending');
    answer('Jane Smith', 'Declined');
    fireEvent.change(screen.getByLabelText(/message to the couple/i), {
      target: { value: 'Can not wait' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      message: 'Can not wait',
      guests: [
        { id: 'g1', rsvpStatus: 'attending', songRequest: null },
        { id: 'g2', rsvpStatus: 'declined', songRequest: null },
      ],
      newGuests: [],
    });
  });

  it('counts down the remaining additions and hides the control at the cap', () => {
    renderForm();
    const addButton = () => screen.queryByRole('button', { name: /add a guest/i });

    expect(addButton()).toHaveTextContent('2 left');

    fireEvent.click(addButton()!);
    expect(addButton()).toHaveTextContent('1 left');

    fireEvent.click(addButton()!);
    expect(addButton()).not.toBeInTheDocument();
  });

  it('never offers to add a guest when no additions remain', () => {
    renderForm({ party: party({ addedGuestsRemaining: 0 }) });

    expect(screen.queryByRole('button', { name: /add a guest/i })).not.toBeInTheDocument();
  });

  it('removes a draft guest and restores its slot', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: /add a guest/i }));
    expect(screen.getByText('Additional guest 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove additional guest 1' }));

    expect(screen.queryByText('Additional guest 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a guest/i })).toHaveTextContent('2 left');
  });

  it('blocks submission until an added guest is complete', () => {
    renderForm();
    answer('John Smith', 'Attending');
    answer('Jane Smith', 'Attending');

    fireEvent.click(screen.getByRole('button', { name: /add a guest/i }));

    expect(screen.getByRole('button', { name: /submit rsvp/i })).toBeDisabled();
  });

  it('warns that added guests are reviewed by the couple', () => {
    renderForm();

    expect(screen.getByText(/reviewed by the couple/i)).toBeInTheDocument();
  });

  it('renders a notice and an error when given them', () => {
    renderForm({ notice: 'Your party was updated', errorMessage: 'Something went wrong' });

    expect(screen.getByRole('status')).toHaveTextContent('Your party was updated');
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('disables Submit while a submission is in flight', () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });
});
```

The `answer()` helper walks up from a guest's name to its containing row before
querying, because both guest rows render radios with the same accessible names
(`Attending` / `Declined`). A bare `getByRole('radio', { name: 'Attending' })`
would find two and throw.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/PartyForm.test.tsx`
Expected: FAIL — cannot resolve `./PartyForm`.

- [ ] **Step 3: Implement `PartyForm`**

Create `src/components/rsvp/PartyForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { AddedGuestFields } from './AddedGuestFields';
import { GuestRsvpFields } from './GuestRsvpFields';
import { buildSubmitBody, emptyNewGuestDraft, initialGuestDrafts } from '@/lib/rsvp/draft';
import type { GuestDraft, NewGuestDraft, PartyDetail, SubmitRsvpBody } from '@/lib/rsvp/types';

interface PartyFormProps {
  party: PartyDetail;
  notice: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (body: SubmitRsvpBody) => void;
}

export const PartyForm: React.FC<PartyFormProps> = ({
  party,
  notice,
  errorMessage,
  isSubmitting,
  onSubmit,
}) => {
  const [guestDrafts, setGuestDrafts] = useState<Record<string, GuestDraft>>(() =>
    initialGuestDrafts(party),
  );
  const [newGuests, setNewGuests] = useState<NewGuestDraft[]>([]);
  const [message, setMessage] = useState(party.message ?? '');

  const submitBody = buildSubmitBody(party, guestDrafts, newGuests, message);
  const remainingAdditions = party.addedGuestsRemaining - newGuests.length;

  const updateGuestDraft = (guestId: string, draft: GuestDraft) => {
    setGuestDrafts((current) => ({ ...current, [guestId]: draft }));
  };

  const updateNewGuest = (draft: NewGuestDraft) => {
    setNewGuests((current) => current.map((item) => (item.key === draft.key ? draft : item)));
  };

  const removeNewGuest = (key: string) => {
    setNewGuests((current) => current.filter((item) => item.key !== key));
  };

  const addNewGuest = () => {
    setNewGuests((current) => [...current, emptyNewGuestDraft()]);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitBody) {
      onSubmit(submitBody);
    }
  };

  return (
    <form className='w-full max-w-lg' onSubmit={handleSubmit}>
      <h1 className='text-center text-3xl text-sage-800'>{party.displayName}</h1>
      <p className='mt-3 text-center text-xs uppercase tracking-[0.4em] text-sage-700/70'>
        Your RSVP
      </p>

      {notice && (
        <p
          role='status'
          className='mt-6 rounded-md border border-sage-200 bg-sage-100 px-4 py-3 text-sm text-sage-800'
        >
          {notice}
        </p>
      )}

      <div className='mt-6'>
        {party.guests.map((guest) => (
          <GuestRsvpFields
            key={guest.id}
            guest={guest}
            draft={guestDrafts[guest.id]}
            onChange={(draft) => updateGuestDraft(guest.id, draft)}
          />
        ))}
      </div>

      {newGuests.map((draft, index) => (
        <AddedGuestFields
          key={draft.key}
          position={index + 1}
          draft={draft}
          onChange={updateNewGuest}
          onRemove={() => removeNewGuest(draft.key)}
        />
      ))}

      {remainingAdditions > 0 && (
        <button
          type='button'
          onClick={addNewGuest}
          className='mt-5 w-full rounded-md border border-dashed border-sage-200 px-4 py-3 text-sm text-sage-700 transition-colors hover:border-sage-700'
        >
          + Add a guest ({remainingAdditions} left)
        </button>
      )}

      <p className='mt-3 text-xs text-sage-700/80'>
        Guests you add are reviewed by the couple, and can only be removed by them.
      </p>

      <div className='mt-8'>
        <label className='text-sm text-sage-700' htmlFor='party-message'>
          Message to the couple (optional)
        </label>
        <textarea
          id='party-message'
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className='mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none'
        />
      </div>

      {errorMessage && (
        <p role='alert' className='mt-4 text-sm text-sage-800'>
          {errorMessage}
        </p>
      )}

      <button
        type='submit'
        disabled={submitBody === null || isSubmitting}
        className='mt-6 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800 disabled:opacity-60'
      >
        {isSubmitting ? 'Sending…' : 'Submit RSVP'}
      </button>

      {submitBody === null && (
        <p className='mt-3 text-center text-sm text-sage-700'>
          Please answer for everyone in your party before submitting.
        </p>
      )}
    </form>
  );
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/PartyForm.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/rsvp/PartyForm.tsx src/components/rsvp/PartyForm.test.tsx
git commit -m "feat(rsvp): add the one-page party RSVP editor

Statuses, song requests, added guests and the message all submit as one
declarative payload, matching the API's whole-party PATCH.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Confirmation and closed states

The two terminal screens: the post-submit summary a guest can reopen, and the closed page shown once the deadline has passed.

**Files:**
- Create: `src/components/rsvp/RsvpConfirmation.tsx`
- Create: `src/components/rsvp/RsvpClosed.tsx`
- Test: `src/components/rsvp/RsvpConfirmation.test.tsx`
- Test: `src/components/rsvp/RsvpClosed.test.tsx`

**Interfaces:**
- Consumes: `RSVP_STATUS`, `GUEST_SOURCE` from `@/lib/enums`; `PartyDetail` from `@/lib/rsvp/types`
- Produces:
  - `RsvpConfirmation: React.FC<{ party: PartyDetail; onEdit: () => void }>`
  - `RsvpClosed: React.FC<{ deadline: string | null }>`

`RsvpClosed` takes `deadline` as `string | null` because it comes from the 403 error body's `details.deadline`, which is typed `unknown` — a malformed or absent value must degrade to a message without a date, not crash the page.

- [ ] **Step 1: Write the failing test for `RsvpConfirmation`**

Create `src/components/rsvp/RsvpConfirmation.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RsvpConfirmation } from './RsvpConfirmation';
import type { PartyDetail } from '@/lib/rsvp/types';

const PARTY: PartyDetail = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: 'Can not wait!',
  addGuestCap: 5,
  addedGuestsRemaining: 1,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending', songRequest: 'September', source: 'admin' },
    { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'declined', songRequest: null, source: 'admin' },
  ],
};

describe('RsvpConfirmation', () => {
  it('summarizes who is attending and who declined', () => {
    render(<RsvpConfirmation party={PARTY} onEdit={vi.fn()} />);

    expect(screen.getByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('echoes the message back', () => {
    render(<RsvpConfirmation party={PARTY} onEdit={vi.fn()} />);

    expect(screen.getByText('Can not wait!')).toBeInTheDocument();
  });

  it('flags added guests as awaiting review', () => {
    render(
      <RsvpConfirmation
        party={{
          ...PARTY,
          guests: [{ ...PARTY.guests[0], source: 'guest_added' }],
        }}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/reviewed by the couple/i)).toBeInTheDocument();
  });

  it('says nothing about review when the party added nobody', () => {
    render(<RsvpConfirmation party={PARTY} onEdit={vi.fn()} />);

    expect(screen.queryByText(/reviewed by the couple/i)).not.toBeInTheDocument();
  });

  it('reopens the editor on request', () => {
    const onEdit = vi.fn();
    render(<RsvpConfirmation party={PARTY} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit your response/i }));

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/RsvpConfirmation.test.tsx`
Expected: FAIL — cannot resolve `./RsvpConfirmation`.

- [ ] **Step 3: Implement `RsvpConfirmation`**

Create `src/components/rsvp/RsvpConfirmation.tsx`:

```tsx
import Link from 'next/link';
import { GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import type { PartyDetail, PartyDetailGuest } from '@/lib/rsvp/types';

interface RsvpConfirmationProps {
  party: PartyDetail;
  onEdit: () => void;
}

const fullName = (guest: PartyDetailGuest): string => `${guest.firstName} ${guest.lastName}`;

const GuestList: React.FC<{ heading: string; guests: PartyDetailGuest[] }> = ({
  heading,
  guests,
}) => {
  if (guests.length === 0) {
    return null;
  }

  return (
    <div className='mt-6'>
      <p className='text-sm uppercase tracking-[0.2em] text-sage-700/70'>{heading}</p>
      <ul className='mt-2 space-y-1'>
        {guests.map((guest) => (
          <li key={guest.id} className='text-sage-800'>
            {fullName(guest)}
            {guest.songRequest && (
              <span className='block text-sm text-sage-700'>♪ {guest.songRequest}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const RsvpConfirmation: React.FC<RsvpConfirmationProps> = ({ party, onEdit }) => {
  const attending = party.guests.filter((guest) => guest.rsvpStatus === RSVP_STATUS.attending);
  const declined = party.guests.filter((guest) => guest.rsvpStatus === RSVP_STATUS.declined);
  const hasAddedGuests = party.guests.some((guest) => guest.source === GUEST_SOURCE.guestAdded);

  return (
    <section className='w-full max-w-md'>
      <h1 className='text-center text-3xl text-sage-800'>Thank you!</h1>
      <p className='mt-3 text-center text-sm text-sage-700'>
        We have your RSVP for <span className='text-sage-800'>{party.displayName}</span>. You can
        come back and change it any time before the deadline.
      </p>

      <GuestList heading='Attending' guests={attending} />
      <GuestList heading='Unable to attend' guests={declined} />

      {party.message && (
        <div className='mt-6'>
          <p className='text-sm uppercase tracking-[0.2em] text-sage-700/70'>Your message</p>
          <p className='mt-2 text-sage-800'>{party.message}</p>
        </div>
      )}

      {hasAddedGuests && (
        <p className='mt-6 text-sm text-sage-700'>
          Guests you added are reviewed by the couple before they are final.
        </p>
      )}

      <button
        type='button'
        onClick={onEdit}
        className='mt-8 w-full rounded-full bg-sage-700 px-6 py-3 text-white transition-colors hover:bg-sage-800'
      >
        Edit your response
      </button>

      <Link href='/' className='mt-4 block text-center text-sm text-sage-700 underline'>
        Back to the wedding site
      </Link>
    </section>
  );
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/RsvpConfirmation.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for `RsvpClosed`**

Create `src/components/rsvp/RsvpClosed.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RsvpClosed } from './RsvpClosed';

describe('RsvpClosed', () => {
  it('names the date the guest list closed', () => {
    render(<RsvpClosed deadline='2026-09-10T00:00:00.000Z' />);

    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('directs the guest to the bride or groom, with no mailto', () => {
    render(<RsvpClosed deadline='2026-09-10T00:00:00.000Z' />);

    expect(screen.getByText(/contact the bride or groom/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /email/i })).not.toBeInTheDocument();
  });

  it.each([null, 'not-a-date'])('still renders when the deadline is %j', (deadline) => {
    render(<RsvpClosed deadline={deadline} />);

    expect(screen.getByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/our guest list is now closed/i)).toBeInTheDocument();
  });
});
```

Note: the date is formatted from a UTC midnight timestamp, and the test asserts on the formatted string. Vitest runs in the machine's timezone, so a timezone behind UTC would render September 9. Format in UTC (`timeZone: 'UTC'`) so the rendered date matches the deadline the server stored, regardless of where the guest is.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/RsvpClosed.test.tsx`
Expected: FAIL — cannot resolve `./RsvpClosed`.

- [ ] **Step 7: Implement `RsvpClosed`**

Create `src/components/rsvp/RsvpClosed.tsx`:

```tsx
import Link from 'next/link';

interface RsvpClosedProps {
  deadline: string | null;
}

/**
 * Formats the deadline in UTC so every guest sees the same date the server
 * stored, rather than one shifted by their own timezone.
 */
const formatDeadline = (deadline: string | null): string | null => {
  if (!deadline) {
    return null;
  }

  const parsed = new Date(deadline);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const RsvpClosed: React.FC<RsvpClosedProps> = ({ deadline }) => {
  const closedOn = formatDeadline(deadline);

  return (
    <section className='w-full max-w-md text-center'>
      <h1 className='text-3xl text-sage-800'>RSVPs are closed</h1>

      <p className='mt-6 text-sage-700'>
        {closedOn
          ? `Thank you — our guest list closed on ${closedOn}.`
          : 'Thank you — our guest list is now closed.'}
      </p>

      <p className='mt-4 text-sm text-sage-700'>
        If you need to make a change, please contact the bride or groom.
      </p>

      <Link href='/' className='mt-8 block text-sm text-sage-700 underline'>
        Back to the wedding site
      </Link>
    </section>
  );
};
```

The `it.each([null, 'not-a-date'])` case expects "our guest list is now closed" — which is exactly the fallback branch above. The valid-date case renders "closed on September 10, 2026".

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/RsvpClosed.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/rsvp/RsvpConfirmation.tsx src/components/rsvp/RsvpConfirmation.test.tsx \
        src/components/rsvp/RsvpClosed.tsx src/components/rsvp/RsvpClosed.test.tsx
git commit -m "feat(rsvp): add confirmation and deadline-closed screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The wizard and the route

The state machine that wires the screens together and owns every API call, plus the page that mounts it.

**Files:**
- Create: `src/components/rsvp/RsvpWizard.tsx`
- Create: `src/app/rsvp/page.tsx`
- Test: `src/components/rsvp/RsvpWizard.test.tsx`

**Interfaces:**
- Consumes: every component from Tasks 4–7; `RsvpApiError`, `fetchParty`, `searchParties`, `submitRsvp` from `@/lib/rsvp/client` (Task 2); `PartyDetail`, `PartySearchResult`, `SubmitRsvpBody` from `@/lib/rsvp/types`; `Header` from `@/components/Header`
- Produces: `RsvpWizard: React.FC` (no props), default-exported `RsvpPage`

- [ ] **Step 1: Write the failing test**

Create `src/components/rsvp/RsvpWizard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RsvpWizard } from './RsvpWizard';
import { RsvpApiError, fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import type { PartyDetail } from '@/lib/rsvp/types';

vi.mock('@/lib/rsvp/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rsvp/client')>('@/lib/rsvp/client');
  return {
    RsvpApiError: actual.RsvpApiError,
    searchParties: vi.fn(),
    fetchParty: vi.fn(),
    submitRsvp: vi.fn(),
  };
});

const searchPartiesMock = vi.mocked(searchParties);
const fetchPartyMock = vi.mocked(fetchParty);
const submitRsvpMock = vi.mocked(submitRsvp);

const PARTY: PartyDetail = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 2,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [
    { id: 'g1', firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
  ],
};

const search = (name = 'John Smith') => {
  fireEvent.change(screen.getByLabelText(/first and last name/i), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /find my invitation/i }));
};

const answer = (guestName: string, choice: 'Attending' | 'Declined') => {
  const row = screen.getByText(guestName).closest('div');
  if (!row) throw new Error(`No row found for ${guestName}`);
  fireEvent.click(within(row).getByRole('radio', { name: choice }));
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RsvpWizard', () => {
  it('starts on the lookup form', () => {
    render(<RsvpWizard />);

    expect(screen.getByLabelText(/first and last name/i)).toBeInTheDocument();
  });

  it('skips the picker when exactly one party matches', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('button', { name: /submit rsvp/i })).toBeInTheDocument();
    expect(fetchPartyMock).toHaveBeenCalledWith(PARTY.id);
  });

  it('shows the picker for several matches and opens the chosen party', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: 'p1', displayName: 'The Smith Family', guestFirstNames: ['John', 'Jane'] },
      { id: 'p2', displayName: 'John Smith & Guest', guestFirstNames: ['John', 'Dana'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    render(<RsvpWizard />);

    search();

    fireEvent.click(await screen.findByRole('button', { name: /John Smith & Guest/ }));

    await waitFor(() => expect(fetchPartyMock).toHaveBeenCalledWith('p2'));
  });

  it('shows the not-found state when nothing matches', async () => {
    searchPartiesMock.mockResolvedValue([]);
    render(<RsvpWizard />);

    search('Nobody Here');

    expect(await screen.findByText(/contact the bride or groom/i)).toBeInTheDocument();
  });

  it('surfaces a search validation error inline', async () => {
    searchPartiesMock.mockRejectedValue(
      new RsvpApiError(400, 'invalid_request', 'Enter a first and last name'),
    );
    render(<RsvpWizard />);

    search('John');

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a first and last name');
  });

  it('goes to the closed page when the search reports the deadline has passed', async () => {
    searchPartiesMock.mockRejectedValue(
      new RsvpApiError(403, 'rsvp_closed', 'RSVPs are closed.', {
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('heading', { name: /rsvps are closed/i })).toBeInTheDocument();
    expect(screen.getByText(/September 10, 2026/)).toBeInTheDocument();
  });

  it('confirms a successful submit and can reopen the editor', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockResolvedValue({
      ...PARTY,
      guests: [{ ...PARTY.guests[0], rsvpStatus: 'attending' }],
    });
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('heading', { name: /thank you/i })).toBeInTheDocument();
    expect(submitRsvpMock).toHaveBeenCalledWith(PARTY.id, {
      message: null,
      guests: [{ id: 'g1', rsvpStatus: 'attending', songRequest: null }],
      newGuests: [],
    });

    fireEvent.click(screen.getByRole('button', { name: /edit your response/i }));

    expect(await screen.findByRole('button', { name: /submit rsvp/i })).toBeInTheDocument();
  });

  it('reloads the party and warns when it changed underneath', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    const refreshed: PartyDetail = {
      ...PARTY,
      guests: [
        ...PARTY.guests,
        { id: 'g2', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null, source: 'admin' },
      ],
    };
    fetchPartyMock.mockResolvedValueOnce(PARTY).mockResolvedValueOnce(refreshed);
    submitRsvpMock.mockRejectedValue(
      new RsvpApiError(409, 'party_changed', 'Your party changed.'),
    );
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/updated by the couple/i);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit rsvp/i })).toBeDisabled();
  });

  it('returns to lookup when the party has disappeared', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockRejectedValue(
      new RsvpApiError(404, 'party_not_found', 'Party not found'),
    );
    render(<RsvpWizard />);

    search();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    expect(screen.getByLabelText(/first and last name/i)).toBeInTheDocument();
  });

  it('keeps the draft and shows a retry message when the network drops', async () => {
    searchPartiesMock.mockResolvedValue([
      { id: PARTY.id, displayName: PARTY.displayName, guestFirstNames: ['John'] },
    ]);
    fetchPartyMock.mockResolvedValue(PARTY);
    submitRsvpMock.mockRejectedValue(new RsvpApiError(0, 'network_error', 'We could not reach the server.'));
    render(<RsvpWizard />);

    search();
    await screen.findByRole('button', { name: /submit rsvp/i });
    answer('John Smith', 'Attending');
    fireEvent.click(screen.getByRole('button', { name: /submit rsvp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole('radio', { name: 'Attending' })).toBeChecked();
  });
});
```

The `party_changed` test asserts the disabled Submit deliberately: the refetched party has a second, unanswered guest, so a reset draft is exactly what leaves the button disabled. That is what proves the draft was reset rather than carried over.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/rsvp/RsvpWizard.test.tsx`
Expected: FAIL — cannot resolve `./RsvpWizard`.

- [ ] **Step 3: Implement `RsvpWizard`**

> **Correction (applied in commit `3da2781`).** The code block below was found
> defective in review and does not match what shipped. It contradicts this
> plan's own error-handling table in two places, and the table governs:
>
> 1. `handleSubmit` lets a `404 party_not_found` fall through to the generic
>    branch, stranding the guest in an editor for a party that no longer
>    exists. All three handlers must share one error mapper so `rsvp_closed`
>    and `party_not_found` map identically by construction.
> 2. `reloadAfterConflict` reports *every* non-403 refetch failure as
>    `PARTY_MISSING_MESSAGE` and discards the draft. Only `party_not_found`
>    may do that; any other failure must stay in `editing` with the original
>    `party` and an **unchanged** `formKey`, which is what preserves the draft.
>
> The shipped version also adds a `default:` exhaustiveness guard on the state
> switch (React 19's `FunctionComponent` may return `undefined`, so falling off
> the end is not a compile error) and a `useRef` request-generation guard in
> `openParty` against double-clicks in the picker.

Create `src/components/rsvp/RsvpWizard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { PartyForm } from './PartyForm';
import { PartyLookup } from './PartyLookup';
import { PartyPicker } from './PartyPicker';
import { RsvpClosed } from './RsvpClosed';
import { RsvpConfirmation } from './RsvpConfirmation';
import { RsvpApiError, fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

type WizardState =
  | { step: 'lookup'; errorMessage: string | null; showNotFound: boolean }
  | { step: 'picking'; matches: PartySearchResult[] }
  | {
      step: 'editing';
      party: PartyDetail;
      notice: string | null;
      errorMessage: string | null;
      formKey: number;
    }
  | { step: 'confirmed'; party: PartyDetail }
  | { step: 'closed'; deadline: string | null };

const LOOKUP_START: WizardState = { step: 'lookup', errorMessage: null, showNotFound: false };

const PARTY_CHANGED_NOTICE =
  'Your party was updated by the couple, so we reloaded it. Please check the answers below and submit again.';
const PARTY_MISSING_MESSAGE =
  'That invitation is no longer available. Please contact the bride or groom.';
const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

const asApiError = (error: unknown): RsvpApiError =>
  error instanceof RsvpApiError
    ? error
    : new RsvpApiError(0, 'unknown_error', UNEXPECTED_MESSAGE);

const closedState = (error: RsvpApiError): WizardState => ({
  step: 'closed',
  deadline: typeof error.details.deadline === 'string' ? error.details.deadline : null,
});

const lookupWithError = (message: string): WizardState => ({
  step: 'lookup',
  errorMessage: message,
  showNotFound: false,
});

export const RsvpWizard: React.FC = () => {
  const [state, setState] = useState<WizardState>(LOOKUP_START);
  const [isBusy, setIsBusy] = useState(false);

  const openParty = async (partyId: string) => {
    setIsBusy(true);

    try {
      const party = await fetchParty(partyId);
      setState({ step: 'editing', party, notice: null, errorMessage: null, formKey: 0 });
    } catch (caught) {
      const error = asApiError(caught);

      if (error.code === 'rsvp_closed') {
        setState(closedState(error));
        return;
      }

      setState(
        lookupWithError(error.code === 'party_not_found' ? PARTY_MISSING_MESSAGE : error.message),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSearch = async (query: string) => {
    setIsBusy(true);

    try {
      const matches = await searchParties(query);

      if (matches.length === 0) {
        setState({ step: 'lookup', errorMessage: null, showNotFound: true });
        return;
      }

      if (matches.length === 1) {
        await openParty(matches[0].id);
        return;
      }

      setState({ step: 'picking', matches });
    } catch (caught) {
      const error = asApiError(caught);
      setState(error.code === 'rsvp_closed' ? closedState(error) : lookupWithError(error.message));
    } finally {
      setIsBusy(false);
    }
  };

  const reloadAfterConflict = async (party: PartyDetail, formKey: number, conflict: RsvpApiError) => {
    try {
      const refreshed = await fetchParty(party.id);
      setState({
        step: 'editing',
        party: refreshed,
        notice: conflict.code === 'party_changed' ? PARTY_CHANGED_NOTICE : conflict.message,
        errorMessage: null,
        formKey: formKey + 1,
      });
    } catch (caught) {
      const error = asApiError(caught);
      setState(error.code === 'rsvp_closed' ? closedState(error) : lookupWithError(PARTY_MISSING_MESSAGE));
    }
  };

  const handleSubmit = async (body: SubmitRsvpBody) => {
    if (state.step !== 'editing') {
      return;
    }

    const { party, formKey } = state;
    setIsBusy(true);

    try {
      const updated = await submitRsvp(party.id, body);
      setState({ step: 'confirmed', party: updated });
    } catch (caught) {
      const error = asApiError(caught);

      if (error.code === 'rsvp_closed') {
        setState(closedState(error));
        return;
      }

      if (error.code === 'party_changed' || error.code === 'add_guest_cap_exceeded') {
        await reloadAfterConflict(party, formKey, error);
        return;
      }

      setState({ step: 'editing', party, notice: null, errorMessage: error.message, formKey });
    } finally {
      setIsBusy(false);
    }
  };

  switch (state.step) {
    case 'lookup':
      return (
        <PartyLookup
          isSearching={isBusy}
          errorMessage={state.errorMessage}
          showNotFound={state.showNotFound}
          onSearch={handleSearch}
        />
      );

    case 'picking':
      return (
        <PartyPicker
          matches={state.matches}
          onSelect={openParty}
          onStartOver={() => setState(LOOKUP_START)}
        />
      );

    case 'editing':
      return (
        <PartyForm
          key={state.formKey}
          party={state.party}
          notice={state.notice}
          errorMessage={state.errorMessage}
          isSubmitting={isBusy}
          onSubmit={handleSubmit}
        />
      );

    case 'confirmed':
      return (
        <RsvpConfirmation
          party={state.party}
          onEdit={() =>
            setState({
              step: 'editing',
              party: state.party,
              notice: null,
              errorMessage: null,
              formKey: 0,
            })
          }
        />
      );

    case 'closed':
      return <RsvpClosed deadline={state.deadline} />;
  }
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/rsvp/RsvpWizard.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Create the route**

Create `src/app/rsvp/page.tsx`, matching `/gallery`'s shell:

```tsx
import { Header } from '@/components/Header';
import { RsvpWizard } from '@/components/rsvp/RsvpWizard';

const RsvpPage = () => {
  return (
    <div className='min-h-screen flex flex-col bg-sage-50/30'>
      <Header />

      <main className='flex-1 flex flex-col items-center px-6 py-12'>
        <RsvpWizard />
      </main>
    </div>
  );
};

export default RsvpPage;
```

This page reads no data, so it stays a static server shell — the closed state is discovered from the search call's 403, not preloaded. Do **not** add `force-dynamic` or a Prisma call here; `next build` and `docker build` run without `DATABASE_URL`.

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npm run check:images && npm test && npm run build`
Expected: all green, and the build output lists `/rsvp` as a static route.

- [ ] **Step 7: Commit**

```bash
git add src/components/rsvp/RsvpWizard.tsx src/components/rsvp/RsvpWizard.test.tsx src/app/rsvp/page.tsx
git commit -m "feat(rsvp): add the /rsvp guest wizard route and state machine

Closes the lookup -> pick -> edit -> submit -> confirm flow, mapping each
guest API error code to a wizard state, including the post-deadline
closed page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Prove it in a browser

A green gate does not prove rendered behavior (`LEARNINGS.md`, 2026-07-25). Drive the real app against the seeded local database.

**Files:** none — this task produces evidence, not code.

**Interfaces:**
- Consumes: the running app and the local SQL Server container from Phase 0

- [ ] **Step 1: Confirm the database is up and seeded**

The `czw-rsvp-db` container listens on host port **14330** and `.env` is already present in this worktree. Run:

```bash
npm run db:migrate:deploy && npm run db:seed
```

If `docker` is a dangling symlink on this machine, use `export PATH="/opt/podman/bin:$PATH"` and podman (`LEARNINGS.md`, machine quirks).

- [ ] **Step 2: Note a real party's guest names from the seed**

Run `npm run db:studio`, or query the `Guest` table, and record one guest's exact first and last name to search for. The wizard requires an exact full-name match.

- [ ] **Step 3: Drive the happy path**

Start the app per the `run-wedding-website` skill and walk `/rsvp` in a real browser:

1. Search the seeded guest's full name.
2. If several parties match, pick one; if one matches, confirm you land straight on the editor.
3. Confirm Submit is disabled until every guest is answered.
4. Answer everyone, type a song request for an attending guest, and confirm the field disappears when you switch that guest to Declined.
5. Add a guest, confirm the remaining count decrements, remove it, confirm the count restores, then add one for real.
6. Type a message and submit.
7. Confirm the confirmation screen lists the right people, echoes the message, and mentions review for the added guest.
8. Click "Edit your response", confirm your answers are preselected, and submit again — the second submit must succeed, proving the guest set reconciliation accepts the now-larger party.

Capture a screenshot of the editor and of the confirmation.

- [ ] **Step 4: Prove the closed state, then restore**

Move the deadline into the past, reload `/rsvp`, search, and confirm the closed page renders with the right date. **Then put the deadline back and re-seed** — a verification script that mutates shared state must restore it (`LEARNINGS.md`, 2026-07-26):

```bash
npm run db:seed
```

Verify afterwards that `/rsvp` search works again before moving on.

- [ ] **Step 5: Check the mobile layout**

Resize to a ~390px-wide viewport and confirm the editor, the add-guest control, and the status toggles are all usable with no horizontal scrolling.

- [ ] **Step 6: Re-run the full gate and commit any fixes**

Run: `npm run lint && npm run check:images && npm test && npm run build`
Expected: all green. Commit any fixes the browser pass surfaced.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: closed-page state → Tasks 7, 8, 9 Step 4; single-route client state → Task 8; one-page editor → Task 6; contact-the-couple copy → Tasks 5, 7 (asserted with a no-mailto assertion in both); `types.ts` extraction → Task 1; API client → Task 2; pure draft rules → Task 3; error-handling table → Task 8's tests, one per code; form rules → Tasks 4 and 6; styling → Global Constraints; testing → every task's tests plus Task 9.

**Placeholders.** None — every code step contains the file's full content, and every test step contains runnable assertions.

**Type consistency.** `SubmittableRsvpStatus`, `GuestDraft`, `NewGuestDraft` (including its `key`), `PartyDetail`, `SubmitRsvpBody`, and `RsvpApiError`'s `(status, code, message, details)` shape are defined in Tasks 1–3 and used unchanged in Tasks 4–8. `buildSubmitBody`'s four parameters match its call site in `PartyForm`. `RsvpClosed` takes `deadline: string | null` in both its test and its consumer.

**Known trade-offs, recorded rather than hidden.**
- A `409 add_guest_cap_exceeded` refetches and therefore resets the draft, same as `party_changed`. It only occurs when an admin lowers the cap mid-session, and a partial merge would have to guess whose edit wins.
- `PartyForm` remounts via `key` to reset. The alternative — syncing props to state in an effect — is the more common bug.
