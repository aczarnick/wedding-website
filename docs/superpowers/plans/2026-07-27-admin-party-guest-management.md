# Admin party/guest management + moderation UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin/parties` (list, search, filter, full party + guest CRUD, add-guest cap, RSVP on a guest's behalf) and `/admin/moderation` (approve/remove flagged guest-added plus-ones) on top of the existing admin REST API.

**Architecture:** Thin server pages inside the existing `/admin` shell render client components. All reads and writes go through `/api/admin/*` via a new typed client (`src/lib/admin/client.ts`) built on a transport extracted out of `src/lib/rsvp/client.ts`. Search and filtering are pure client-side functions over the single list response. Every mutation is followed by a re-fetch rather than a local merge.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Vitest + React Testing Library.

Design spec: `docs/superpowers/specs/2026-07-27-admin-party-guest-management-design.md`

## Global Constraints

- Tailwind utility classes only; no custom CSS. Sage palette `sage-50`…`sage-800`, `font-serif` for display text.
- Path alias `@/` → `src/`. Import order in this repo: external packages, then `@/…`, then relative.
- `'use client'` only on components that use state or hooks.
- New admin routes must be **lowercase** — `src/proxy.ts` matches `/admin/:path*` case-sensitively.
- One top-level type/component per file; file named after it.
- Comments: XML/JSDoc `/** … */` only on exported APIs whose contract is non-obvious. No narration.
- Never call `window.confirm`/`alert` — a native dialog blocks browser-driven verification.
- Never assert on a bare `getByRole('alert')` in tests: the Next dev overlay matches it. Scope to the element under test.
- **Component tests drive the DOM with `fireEvent` from `@testing-library/react`, never `@testing-library/user-event`** — that package is not a dependency of this repo and must not be added; all nine pre-existing component test files use `fireEvent`. Typing is `fireEvent.change(el, { target: { value: 'x' } })` (it replaces the value, so no separate `clear` step is needed); selecting an option is the same call with the option's value. `fireEvent` is synchronous, so these calls are not awaited; keep `waitFor` only for assertions that depend on a resolved promise.
- **Add no dependency, and never run `npm install` on this machine** — it prunes cross-platform optional deps (`@emnapi/*`) from the lockfile and breaks CI's `npm ci`, and `npm ci --dry-run` does not exist to catch it. If a task appears to need a package, stop and report instead.
- The admin API is **not** modified by this plan. No changes under `src/app/api/`, `src/lib/admin/{parties,guests,settings,stats,route,schemas,projections,audit-log}.ts`.
- Verification gate, in CI order: `npm run lint && npm run check:images && npm test && npm run build`.

---

### Task 1: Extract the shared HTTP transport

`src/lib/rsvp/client.ts` holds a generic fetch/JSON/error helper the admin client needs identically. Move it to `src/lib/http/apiClient.ts` as `requestJson` + `ApiError` and rename the ~25 `RsvpApiError` references. Behaviour must not change.

**Files:**
- Create: `src/lib/http/apiClient.ts`
- Create: `src/lib/http/apiClient.test.ts`
- Modify: `src/lib/rsvp/client.ts` (delete the local transport, import the shared one)
- Modify: `src/lib/rsvp/client.test.ts` (drop the transport cases moved to `apiClient.test.ts`; rename the error class)
- Modify: `src/components/rsvp/RsvpWizard.tsx` (rename only)
- Modify: `src/components/rsvp/RsvpWizard.test.tsx` (rename only)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class ApiError extends Error` with `readonly status: number`, `readonly code: string`, `readonly details: Record<string, unknown>`; constructor `(status, code, message, details = {})`; `name === 'ApiError'`.
  - `requestJson<T>(url: string, init?: RequestInit): Promise<T>` — resolves the decoded JSON object, throws `ApiError` on a non-2xx response, on an unreachable server (`status: 0`, `code: 'network_error'`), or on a 2xx body that is not a JSON object.

- [ ] **Step 1: Write the failing test**

Create `src/lib/http/apiClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, requestJson } from './apiClient';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('passes the url and init straight through and returns the decoded body', async () => {
    const spy = stubFetch(jsonResponse(200, { ok: true }));

    await expect(requestJson('/api/thing', { method: 'DELETE' })).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('/api/thing', { method: 'DELETE' });
  });

  it('carries the server code, message and extra details on a failure', async () => {
    stubFetch(
      jsonResponse(403, {
        error: 'RSVPs are closed.',
        code: 'rsvp_closed',
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'rsvp_closed',
      message: 'RSVPs are closed.',
      details: { deadline: '2026-09-10T00:00:00.000Z' },
    });
  });

  it('falls back to unknown_error when the failure body is not JSON', async () => {
    stubFetch(new Response('<html>gateway blew up</html>', { status: 500 }));

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 500, code: 'unknown_error' });
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
  });

  it('reports an unreachable server as a network_error without a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('rejects a 2xx body that is not a JSON object', async () => {
    stubFetch(new Response('null', { status: 200 }));

    await expect(requestJson('/api/thing')).rejects.toMatchObject({ code: 'unknown_error' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/http/apiClient.test.ts`
Expected: FAIL — cannot resolve `./apiClient`.

- [ ] **Step 3: Create the shared transport**

Create `src/lib/http/apiClient.ts` — this is the code moved verbatim out of `src/lib/rsvp/client.ts`, with `RsvpApiError` renamed and `request` exported as `requestJson`:

```ts
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_ERROR_MESSAGE =
  'We could not reach the server. Please check your connection and try again.';

/** A failed JSON API call, carrying the server's machine-readable code. */
export class ApiError extends Error {
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
    this.name = 'ApiError';
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

const toApiError = (status: number, body: unknown): ApiError => {
  const payload: Record<string, unknown> = isRecord(body) ? body : {};
  const { error, code, ...details } = payload;

  return new ApiError(
    status,
    typeof code === 'string' ? code : 'unknown_error',
    typeof error === 'string' ? error : GENERIC_ERROR_MESSAGE,
    details,
  );
};

/** Fetches JSON, mapping every failure mode onto `ApiError`. */
export const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  if (!isRecord(body)) {
    throw new ApiError(response.status, 'unknown_error', GENERIC_ERROR_MESSAGE);
  }

  return body as T;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/http/apiClient.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite the RSVP client on top of it**

Replace the whole of `src/lib/rsvp/client.ts` with:

```ts
import { requestJson } from '@/lib/http/apiClient';
import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

export const searchParties = async (query: string): Promise<PartySearchResult[]> => {
  const body = await requestJson<{ parties: PartySearchResult[] }>(
    `/api/parties/search?q=${encodeURIComponent(query)}`,
  );

  return body.parties;
};

export const fetchParty = (partyId: string): Promise<PartyDetail> =>
  requestJson<PartyDetail>(`/api/parties/${partyId}`);

export const submitRsvp = (partyId: string, input: SubmitRsvpBody): Promise<PartyDetail> =>
  requestJson<PartyDetail>(`/api/parties/${partyId}/rsvp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
```

- [ ] **Step 6: Rename the error class at every call site**

`RsvpApiError` → `ApiError`, imported from `@/lib/http/apiClient`:

- `src/components/rsvp/RsvpWizard.tsx` — change the import on line 9 to keep `fetchParty, searchParties, submitRsvp` from `@/lib/rsvp/client` and add `import { ApiError } from '@/lib/http/apiClient';`. Rename all 9 uses (`asApiError`, `closedState`, `userMessage`, `handleFailure`, `reloadAfterConflict` signatures and the `instanceof` check).
- `src/components/rsvp/RsvpWizard.test.tsx` — rename all 13 constructor uses, and replace the import and mock block (lines 4–15) with the following. The `importActual` dance existed only to keep the real error class alongside the mocked functions; once the class lives in `@/lib/http/apiClient` — which is not mocked — the factory can be plain and synchronous:

```tsx
import { fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import { ApiError } from '@/lib/http/apiClient';
import type { PartyDetail } from '@/lib/rsvp/types';

vi.mock('@/lib/rsvp/client', () => ({
  searchParties: vi.fn(),
  fetchParty: vi.fn(),
  submitRsvp: vi.fn(),
}));
```
- `src/lib/rsvp/client.test.ts` — delete the entire `describe('error mapping', …)` block (now covered by `apiClient.test.ts`) and drop `RsvpApiError` from the import. Keep the `searchParties` / `fetchParty` / `submitRsvp` blocks, changing nothing else — they assert this module's URLs and bodies, which is still its job.

Verify no reference survives:

```bash
grep -rn "RsvpApiError" src && echo "STILL PRESENT — fix before continuing" || echo "clean"
```

- [ ] **Step 7: Run the full gate**

Run: `npm test 2>&1 | tail -20 && npm run lint && npm run build 2>&1 | tail -8`
Expected: all suites pass (RSVP wizard tests included), lint clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/http src/lib/rsvp/client.ts src/lib/rsvp/client.test.ts src/components/rsvp/RsvpWizard.tsx src/components/rsvp/RsvpWizard.test.tsx
git commit -m "refactor: extract shared JSON transport as ApiError/requestJson (#69)"
```

---

### Task 2: Admin API client and the mutation hook

**Files:**
- Create: `src/lib/admin/client.ts`
- Create: `src/lib/admin/client.test.ts`
- Create: `src/lib/admin/useAdminMutation.ts`

**Interfaces:**
- Consumes: `requestJson`, `ApiError` from `@/lib/http/apiClient` (Task 1). `AdminGuest`, `AdminParty` from `@/lib/admin/projections` (existing).
- Produces, from `@/lib/admin/client`:
  - `interface GuestFields { firstName: string; lastName: string; rsvpStatus: string; songRequest: string | null }`
  - `interface NewPartyBody { displayName: string; message: string | null; addGuestCap?: number; guests: GuestFields[] }`
  - `interface PartyPatch { displayName: string; message: string | null; addGuestCap?: number }`
  - `type ModerationDecision = 'approve' | 'remove'`
  - `fetchParties(): Promise<AdminParty[]>`
  - `createParty(input: NewPartyBody): Promise<AdminParty>`
  - `updateParty(partyId: string, input: PartyPatch): Promise<AdminParty>`
  - `deleteParty(partyId: string): Promise<AdminParty>`
  - `createGuest(input: GuestFields & { partyId: string }): Promise<AdminGuest>`
  - `updateGuest(guestId: string, input: GuestFields): Promise<AdminGuest>`
  - `deleteGuest(guestId: string): Promise<AdminGuest>`
  - `fetchFlaggedGuests(): Promise<AdminGuest[]>`
  - `moderateGuest(guestId: string, decision: ModerationDecision): Promise<AdminGuest>`
- Produces, from `@/lib/admin/useAdminMutation`:
  - `useAdminMutation(): { isSaving: boolean; errorMessage: string | null; run: (action: () => Promise<unknown>, onSuccess: () => void) => Promise<void> }`

The request bodies are declared here as plain interfaces rather than reusing the Zod-inferred types from `src/lib/admin/schemas.ts`: those are *output* types (defaults already applied), so `z.infer` would force the caller to supply fields the server fills in. This module owns the wire contract.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGuest,
  createParty,
  deleteGuest,
  deleteParty,
  fetchFlaggedGuests,
  fetchParties,
  moderateGuest,
  updateGuest,
  updateParty,
} from './client';
import type { GuestFields, NewPartyBody } from './client';

const PARTY_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';

const GUEST_FIELDS: GuestFields = {
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (body: unknown, status = 200) => {
  const spy = vi.fn(() => Promise.resolve(jsonResponse(status, body)));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchParties', () => {
  it('unwraps the parties array', async () => {
    const spy = stubFetch({ parties: [{ id: PARTY_ID }] });

    await expect(fetchParties()).resolves.toEqual([{ id: PARTY_ID }]);
    expect(spy).toHaveBeenCalledWith('/api/admin/parties', undefined);
  });
});

describe('fetchFlaggedGuests', () => {
  it('requests only flagged guests and unwraps them', async () => {
    const spy = stubFetch({ guests: [{ id: GUEST_ID }] });

    await expect(fetchFlaggedGuests()).resolves.toEqual([{ id: GUEST_ID }]);
    expect(spy).toHaveBeenCalledWith('/api/admin/guests?flagged=true', undefined);
  });
});

describe('party writes', () => {
  it('POSTs a new party with its guests', async () => {
    const input: NewPartyBody = {
      displayName: 'The Smith Family',
      message: null,
      addGuestCap: 2,
      guests: [GUEST_FIELDS],
    };
    const spy = stubFetch({ id: PARTY_ID }, 201);

    await createParty(input);

    expect(spy).toHaveBeenCalledWith('/api/admin/parties', jsonInit('POST', input));
  });

  it('PATCHes party fields by id', async () => {
    const spy = stubFetch({ id: PARTY_ID });

    await updateParty(PARTY_ID, { displayName: 'Renamed', message: 'Hi', addGuestCap: 3 });

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/parties/${PARTY_ID}`,
      jsonInit('PATCH', { displayName: 'Renamed', message: 'Hi', addGuestCap: 3 }),
    );
  });

  it('DELETEs a party without a body', async () => {
    const spy = stubFetch({ id: PARTY_ID });

    await deleteParty(PARTY_ID);

    expect(spy).toHaveBeenCalledWith(`/api/admin/parties/${PARTY_ID}`, { method: 'DELETE' });
  });
});

describe('guest writes', () => {
  it('POSTs a new guest with its party id', async () => {
    const spy = stubFetch({ id: GUEST_ID }, 201);

    await createGuest({ ...GUEST_FIELDS, partyId: PARTY_ID });

    expect(spy).toHaveBeenCalledWith(
      '/api/admin/guests',
      jsonInit('POST', { ...GUEST_FIELDS, partyId: PARTY_ID }),
    );
  });

  it('PATCHes guest fields, carrying the RSVP status an admin set', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await updateGuest(GUEST_ID, { ...GUEST_FIELDS, rsvpStatus: 'declined' });

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/guests/${GUEST_ID}`,
      jsonInit('PATCH', { ...GUEST_FIELDS, rsvpStatus: 'declined' }),
    );
  });

  it('DELETEs a guest without a body', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await deleteGuest(GUEST_ID);

    expect(spy).toHaveBeenCalledWith(`/api/admin/guests/${GUEST_ID}`, { method: 'DELETE' });
  });

  it('POSTs a moderation decision as an action object', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await moderateGuest(GUEST_ID, 'approve');

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/guests/${GUEST_ID}/moderate`,
      jsonInit('POST', { action: 'approve' }),
    );
  });
});

describe('failures', () => {
  it('surfaces the API error code', async () => {
    stubFetch({ error: 'This guest is not awaiting moderation', code: 'guest_not_flagged' }, 409);

    await expect(moderateGuest(GUEST_ID, 'remove')).rejects.toMatchObject({
      status: 409,
      code: 'guest_not_flagged',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/admin/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Write the client**

Create `src/lib/admin/client.ts`:

```ts
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';
import { requestJson } from '@/lib/http/apiClient';

/** The guest fields an admin may write, on create and update alike. */
export interface GuestFields {
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
}

export interface NewPartyBody {
  displayName: string;
  message: string | null;
  addGuestCap?: number;
  guests: GuestFields[];
}

export interface PartyPatch {
  displayName: string;
  message: string | null;
  addGuestCap?: number;
}

export type ModerationDecision = 'approve' | 'remove';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchParties = async (): Promise<AdminParty[]> => {
  const body = await requestJson<{ parties: AdminParty[] }>('/api/admin/parties');

  return body.parties;
};

export const createParty = (input: NewPartyBody): Promise<AdminParty> =>
  requestJson<AdminParty>('/api/admin/parties', jsonInit('POST', input));

export const updateParty = (partyId: string, input: PartyPatch): Promise<AdminParty> =>
  requestJson<AdminParty>(`/api/admin/parties/${partyId}`, jsonInit('PATCH', input));

export const deleteParty = (partyId: string): Promise<AdminParty> =>
  requestJson<AdminParty>(`/api/admin/parties/${partyId}`, { method: 'DELETE' });

export const createGuest = (input: GuestFields & { partyId: string }): Promise<AdminGuest> =>
  requestJson<AdminGuest>('/api/admin/guests', jsonInit('POST', input));

export const updateGuest = (guestId: string, input: GuestFields): Promise<AdminGuest> =>
  requestJson<AdminGuest>(`/api/admin/guests/${guestId}`, jsonInit('PATCH', input));

export const deleteGuest = (guestId: string): Promise<AdminGuest> =>
  requestJson<AdminGuest>(`/api/admin/guests/${guestId}`, { method: 'DELETE' });

export const fetchFlaggedGuests = async (): Promise<AdminGuest[]> => {
  const body = await requestJson<{ guests: AdminGuest[] }>('/api/admin/guests?flagged=true');

  return body.guests;
};

export const moderateGuest = (
  guestId: string,
  decision: ModerationDecision,
): Promise<AdminGuest> =>
  requestJson<AdminGuest>(
    `/api/admin/guests/${guestId}/moderate`,
    jsonInit('POST', { action: decision }),
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/admin/client.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add the mutation hook**

Every form and row action repeats the same saving/error/refresh cycle. Create `src/lib/admin/useAdminMutation.ts`:

```ts
'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/http/apiClient';

const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

interface AdminMutation {
  isSaving: boolean;
  errorMessage: string | null;
  run: (action: () => Promise<unknown>, onSuccess: () => void) => Promise<void>;
}

/**
 * Drives one admin write: tracks the in-flight flag, renders the server's
 * message on failure, and calls `onSuccess` only when the write committed.
 */
export const useAdminMutation = (): AdminMutation => {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, onSuccess: () => void) => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await action();
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, errorMessage, run };
};
```

- [ ] **Step 6: Run the gate**

Run: `npm test 2>&1 | tail -8 && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/client.ts src/lib/admin/client.test.ts src/lib/admin/useAdminMutation.ts
git commit -m "feat: admin API client and mutation hook (#69)"
```

---

### Task 3: Pure list derivation — search, filter, tallies

**Files:**
- Create: `src/lib/admin/partyList.ts`
- Create: `src/lib/admin/partyList.test.ts`

**Interfaces:**
- Consumes: `AdminGuest`, `AdminParty` from `@/lib/admin/projections`; `RSVP_STATUS` from `@/lib/enums`.
- Produces:
  - `const ALL_STATUSES = 'all'`
  - `interface GuestTally { total: number; attending: number; declined: number; pending: number; flagged: number }`
  - `interface PartyFilter { query: string; status: string }`
  - `summarizeGuests(guests: readonly AdminGuest[]): GuestTally`
  - `filterParties(parties: readonly AdminParty[], filter: PartyFilter): AdminParty[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/partyList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ALL_STATUSES, filterParties, summarizeGuests } from './partyList';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-id',
  partyId: 'party-id',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const party = (displayName: string, guests: AdminGuest[]): AdminParty => ({
  id: `party-${displayName}`,
  displayName,
  message: null,
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests,
});

const SMITHS = party('The Smith Family', [
  guest({ id: 'a', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending' }),
  guest({ id: 'b', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending' }),
]);

const RIVERAS = party('Alex Rivera & Guest', [
  guest({ id: 'c', firstName: 'Alex', lastName: 'Rivera', rsvpStatus: 'attending' }),
  guest({
    id: 'd',
    firstName: 'Sam',
    lastName: 'Rivera',
    rsvpStatus: 'pending',
    source: 'guest_added',
    flaggedForReview: true,
  }),
]);

const CHENS = party('The Chen Family', [
  guest({ id: 'e', firstName: 'Wei', lastName: 'Chen', rsvpStatus: 'declined' }),
]);

const ALL = [SMITHS, RIVERAS, CHENS];
const NO_FILTER = { query: '', status: ALL_STATUSES };

describe('summarizeGuests', () => {
  it('counts the total, each RSVP status and the flagged guests', () => {
    expect(summarizeGuests(RIVERAS.guests)).toEqual({
      total: 2,
      attending: 1,
      declined: 0,
      pending: 1,
      flagged: 1,
    });
  });

  it('returns zeroes for a party with no guests', () => {
    expect(summarizeGuests([])).toEqual({
      total: 0,
      attending: 0,
      declined: 0,
      pending: 0,
      flagged: 0,
    });
  });

  // Every counter takes a distinct value and flagged (2) differs from unflagged
  // (1), so a transposed status branch or an inverted flag check cannot pass.
  it('keeps the counters independent when several differ at once', () => {
    const guests = [
      guest({ id: 'f', rsvpStatus: 'attending', flaggedForReview: true }),
      guest({ id: 'g', rsvpStatus: 'declined', flaggedForReview: true }),
      guest({ id: 'h', rsvpStatus: 'declined' }),
    ];

    expect(summarizeGuests(guests)).toEqual({
      total: 3,
      attending: 1,
      declined: 2,
      pending: 0,
      flagged: 2,
    });
  });
});

describe('filterParties', () => {
  it('returns every party when nothing is filtered', () => {
    expect(filterParties(ALL, NO_FILTER)).toEqual(ALL);
  });

  it('matches the party display name case-insensitively', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'cHeN' })).toEqual([CHENS]);
  });

  it("matches a guest's name even when the party name does not contain it", () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'wei' })).toEqual([CHENS]);
  });

  it('matches across a full name spanning the first/last boundary', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'jane smith' })).toEqual([SMITHS]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: '   rivera  ' })).toEqual([RIVERAS]);
  });

  it('returns nothing when no party or guest matches', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'nobody' })).toEqual([]);
  });

  it('keeps parties having at least one guest with the selected status', () => {
    expect(filterParties(ALL, { ...NO_FILTER, status: 'declined' })).toEqual([CHENS]);
    expect(filterParties(ALL, { ...NO_FILTER, status: 'attending' })).toEqual([SMITHS, RIVERAS]);
  });

  it('applies the query and the status together', () => {
    expect(filterParties(ALL, { query: 'family', status: 'declined' })).toEqual([CHENS]);
  });

  it('excludes a guestless party from every status filter', () => {
    const empty = party('Nobody Yet', []);

    expect(filterParties([empty], { ...NO_FILTER, status: 'pending' })).toEqual([]);
    expect(filterParties([empty], NO_FILTER)).toEqual([empty]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/admin/partyList.test.ts`
Expected: FAIL — cannot resolve `./partyList`.

- [ ] **Step 3: Write the module**

Create `src/lib/admin/partyList.ts`:

```ts
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';
import { RSVP_STATUS } from '@/lib/enums';

/** Sentinel for "any RSVP status", distinct from the three real statuses. */
export const ALL_STATUSES = 'all';

export interface GuestTally {
  total: number;
  attending: number;
  declined: number;
  pending: number;
  flagged: number;
}

export interface PartyFilter {
  query: string;
  status: string;
}

export function summarizeGuests(guests: readonly AdminGuest[]): GuestTally {
  return guests.reduce<GuestTally>(
    (tally, guest) => ({
      total: tally.total + 1,
      attending: tally.attending + (guest.rsvpStatus === RSVP_STATUS.attending ? 1 : 0),
      declined: tally.declined + (guest.rsvpStatus === RSVP_STATUS.declined ? 1 : 0),
      pending: tally.pending + (guest.rsvpStatus === RSVP_STATUS.pending ? 1 : 0),
      flagged: tally.flagged + (guest.flaggedForReview ? 1 : 0),
    }),
    { total: 0, attending: 0, declined: 0, pending: 0, flagged: 0 },
  );
}

const matchesQuery = (party: AdminParty, needle: string): boolean =>
  party.displayName.toLowerCase().includes(needle) ||
  party.guests.some((guest) =>
    `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(needle),
  );

const matchesStatus = (party: AdminParty, status: string): boolean =>
  status === ALL_STATUSES || party.guests.some((guest) => guest.rsvpStatus === status);

/**
 * Narrows the list to the admin's search text and status filter. The search
 * spans guest names as well as the party's display name, because an admin
 * looking someone up knows the guest, not the label on the invitation.
 */
export function filterParties(
  parties: readonly AdminParty[],
  filter: PartyFilter,
): AdminParty[] {
  const needle = filter.query.trim().toLowerCase();

  return parties.filter(
    (party) =>
      (needle.length === 0 || matchesQuery(party, needle)) && matchesStatus(party, filter.status),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/admin/partyList.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/partyList.ts src/lib/admin/partyList.test.ts
git commit -m "feat: pure party search, status filter and guest tallies (#69)"
```

---

### Task 4: Status badge and two-step confirm button

**Files:**
- Create: `src/components/admin/RsvpStatusBadge.tsx`
- Create: `src/components/admin/ConfirmButton.tsx`
- Create: `src/components/admin/ConfirmButton.test.tsx`

**Interfaces:**
- Consumes: `RSVP_STATUS` from `@/lib/enums`.
- Produces:
  - `RsvpStatusBadge: React.FC<{ status: string }>` — renders the status word in a pill.
  - `ConfirmButton: React.FC<{ label: string; confirmPrompt: string; confirmLabel?: string; isBusy?: boolean; onConfirm: () => void }>` — renders `label`; once clicked, replaces itself in place with `confirmPrompt` plus a confirm and a cancel button. The confirm step stays open while `isBusy` so the caller can show progress and so a failed write leaves the prompt (and its error) visible.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/ConfirmButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmButton } from './ConfirmButton';

const setup = (props: Partial<React.ComponentProps<typeof ConfirmButton>> = {}) => {
  const onConfirm = vi.fn();

  render(
    <ConfirmButton
      label='Remove'
      confirmPrompt='Remove Jane Smith?'
      onConfirm={onConfirm}
      {...props}
    />,
  );

  return { onConfirm };
};

const clickButton = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('ConfirmButton', () => {
  it('does not act on the first click', () => {
    const { onConfirm } = setup();

    clickButton('Remove');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Jane Smith?')).toBeInTheDocument();
  });

  it('calls onConfirm once the prompt is confirmed', () => {
    const { onConfirm } = setup();

    clickButton('Remove');
    clickButton('Yes, remove');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('restores the original button on cancel without acting', () => {
    const { onConfirm } = setup();

    clickButton('Remove');
    clickButton('Cancel');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByText('Remove Jane Smith?')).not.toBeInTheDocument();
  });

  it('disables the confirm button while the write is in flight', () => {
    setup({ isBusy: true });

    clickButton('Remove');

    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
  });

  it('uses a custom confirm label when given one', () => {
    setup({ confirmLabel: 'Yes, delete party' });

    clickButton('Remove');

    expect(screen.getByRole('button', { name: 'Yes, delete party' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/admin/ConfirmButton.test.tsx`
Expected: FAIL — cannot resolve `./ConfirmButton`.

- [ ] **Step 3: Write the components**

Create `src/components/admin/ConfirmButton.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface ConfirmButtonProps {
  label: string;
  confirmPrompt: string;
  confirmLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
}

const ACTION_CLASSES =
  'rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800 disabled:opacity-60';

/**
 * Two-step destructive action. Deliberately not `window.confirm`: a native
 * dialog blocks every subsequent browser event, which breaks browser-driven
 * verification, and it cannot be asserted without stubbing a global. The
 * prompt stays open while the write is in flight so a failure remains visible
 * next to the error message the caller renders.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  label,
  confirmPrompt,
  confirmLabel = 'Yes, remove',
  isBusy = false,
  onConfirm,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button type='button' onClick={() => setIsConfirming(true)} className={ACTION_CLASSES}>
        {label}
      </button>
    );
  }

  return (
    <span className='flex flex-wrap items-center gap-2'>
      <span className='text-xs text-sage-800'>{confirmPrompt}</span>
      <button
        type='button'
        disabled={isBusy}
        onClick={onConfirm}
        className='rounded-md bg-sage-700 px-2 py-1 text-xs text-white hover:bg-sage-800 disabled:opacity-60'
      >
        {isBusy ? 'Removing…' : confirmLabel}
      </button>
      <button type='button' onClick={() => setIsConfirming(false)} className={ACTION_CLASSES}>
        Cancel
      </button>
    </span>
  );
};
```

Create `src/components/admin/RsvpStatusBadge.tsx`:

```tsx
import { RSVP_STATUS } from '@/lib/enums';

const PILL_CLASSES: Record<string, string> = {
  [RSVP_STATUS.attending]: 'bg-sage-700 text-white',
  [RSVP_STATUS.declined]: 'bg-sage-200 text-sage-800',
  [RSVP_STATUS.pending]: 'border border-sage-300 text-sage-700',
};

export const RsvpStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
      PILL_CLASSES[status] ?? PILL_CLASSES[RSVP_STATUS.pending]
    }`}
  >
    {status}
  </span>
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/ConfirmButton.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ConfirmButton.tsx src/components/admin/ConfirmButton.test.tsx src/components/admin/RsvpStatusBadge.tsx
git commit -m "feat: admin status badge and two-step confirm button (#69)"
```

---

### Task 5: Guest form, guest row, guest list

The guest form is where an admin records an RSVP on a guest's behalf — the `rsvpStatus` select is the point of the screen, not decoration. Unlike a guest, an admin may also set `pending`.

**Files:**
- Create: `src/components/admin/GuestForm.tsx`
- Create: `src/components/admin/GuestForm.test.tsx`
- Create: `src/components/admin/GuestRow.tsx`
- Create: `src/components/admin/GuestList.tsx`
- Create: `src/components/admin/GuestList.test.tsx`

**Interfaces:**
- Consumes: `GuestFields`, `createGuest`, `deleteGuest`, `updateGuest` from `@/lib/admin/client`; `useAdminMutation` from `@/lib/admin/useAdminMutation`; `ConfirmButton`, `RsvpStatusBadge` (Task 4); `RSVP_STATUS`, `GUEST_SOURCE` from `@/lib/enums`; `AdminGuest` from `@/lib/admin/projections`.
- Produces:
  - `GuestForm: React.FC<{ initialGuest?: AdminGuest; submitLabel: string; isSaving: boolean; errorMessage: string | null; onSubmit: (fields: GuestFields) => void; onCancel: () => void }>`
  - `GuestRow: React.FC<{ guest: AdminGuest; onChanged: () => void }>`
  - `GuestList: React.FC<{ partyId: string; guests: readonly AdminGuest[]; addGuestCap: number; onChanged: () => void }>`

- [ ] **Step 1: Write the failing GuestForm test**

Create `src/components/admin/GuestForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestForm } from './GuestForm';
import type { AdminGuest } from '@/lib/admin/projections';

const EXISTING: AdminGuest = {
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'Jane',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: 'September',
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const setup = (props: Partial<React.ComponentProps<typeof GuestForm>> = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  render(
    <GuestForm
      submitLabel='Add guest'
      isSaving={false}
      errorMessage={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );

  return { onSubmit, onCancel };
};

describe('GuestForm', () => {
  it('submits a trimmed new guest defaulting to pending with no song request', () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  John  ' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: ' Smith ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'John',
      lastName: 'Smith',
      rsvpStatus: 'pending',
      songRequest: null,
    });
  });

  it('records an RSVP on the guest’s behalf, including pending', () => {
    const { onSubmit } = setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Jane',
      lastName: 'Smith',
      rsvpStatus: 'declined',
      songRequest: 'September',
    });
    expect(screen.getByLabelText('RSVP status')).toHaveDisplayValue('Declined');
  });

  it('prefills every field from the guest being edited', () => {
    setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    expect(screen.getByLabelText('First name')).toHaveValue('Jane');
    expect(screen.getByLabelText('Last name')).toHaveValue('Smith');
    expect(screen.getByLabelText('Song request')).toHaveValue('September');
  });

  it('clears an emptied song request to null rather than an empty string', () => {
    const { onSubmit } = setup({ initialGuest: EXISTING, submitLabel: 'Save guest' });

    fireEvent.change(screen.getByLabelText('Song request'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ songRequest: null }));
  });

  it('will not submit without both names', () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add guest' })).toBeDisabled();
  });

  it('renders the server error next to the form', () => {
    setup({ errorMessage: 'Must be between 1 and 100 characters' });

    expect(screen.getByTestId('guest-form-error')).toHaveTextContent(
      'Must be between 1 and 100 characters',
    );
  });

  it('cancels without submitting', () => {
    const { onCancel, onSubmit } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/GuestForm.test.tsx`
Expected: FAIL — cannot resolve `./GuestForm`.

- [ ] **Step 3: Write GuestForm**

Create `src/components/admin/GuestForm.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import type { GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { RSVP_STATUS } from '@/lib/enums';

interface GuestFormProps {
  initialGuest?: AdminGuest;
  submitLabel: string;
  isSaving: boolean;
  errorMessage: string | null;
  onSubmit: (fields: GuestFields) => void;
  onCancel: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string;
}

const STATUS_LABELS: Record<string, string> = {
  [RSVP_STATUS.pending]: 'Pending',
  [RSVP_STATUS.attending]: 'Attending',
  [RSVP_STATUS.declined]: 'Declined',
};

const INPUT_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

const initialState = (guest?: AdminGuest): FormState => ({
  firstName: guest?.firstName ?? '',
  lastName: guest?.lastName ?? '',
  rsvpStatus: guest?.rsvpStatus ?? RSVP_STATUS.pending,
  songRequest: guest?.songRequest ?? '',
});

export const GuestForm: React.FC<GuestFormProps> = ({
  initialGuest,
  submitLabel,
  isSaving,
  errorMessage,
  onSubmit,
  onCancel,
}) => {
  const fieldId = useId();
  const [state, setState] = useState<FormState>(() => initialState(initialGuest));

  const firstName = state.firstName.trim();
  const lastName = state.lastName.trim();
  const canSubmit = firstName.length > 0 && lastName.length > 0 && !isSaving;

  const update = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      firstName,
      lastName,
      rsvpStatus: state.rsvpStatus,
      songRequest: state.songRequest.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className='rounded-lg border border-sage-200 bg-white p-4'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-first`}>
            First name
          </label>
          <input
            id={`${fieldId}-first`}
            type='text'
            value={state.firstName}
            onChange={(event) => update({ firstName: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-last`}>
            Last name
          </label>
          <input
            id={`${fieldId}-last`}
            type='text'
            value={state.lastName}
            onChange={(event) => update({ lastName: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-status`}>
            RSVP status
          </label>
          <select
            id={`${fieldId}-status`}
            value={state.rsvpStatus}
            onChange={(event) => update({ rsvpStatus: event.target.value })}
            className={INPUT_CLASSES}
          >
            {Object.values(RSVP_STATUS).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className='text-xs text-sage-700' htmlFor={`${fieldId}-song`}>
            Song request
          </label>
          <input
            id={`${fieldId}-song`}
            type='text'
            value={state.songRequest}
            onChange={(event) => update({ songRequest: event.target.value })}
            className={INPUT_CLASSES}
          />
        </div>
      </div>

      {errorMessage && (
        <p role='alert' data-testid='guest-form-error' className='mt-3 text-sm text-sage-800'>
          {errorMessage}
        </p>
      )}

      <div className='mt-4 flex items-center gap-3'>
        <button
          type='submit'
          disabled={!canSubmit}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/admin/GuestForm.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing GuestList test**

Create `src/components/admin/GuestList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuestList } from './GuestList';
import { createGuest, deleteGuest, updateGuest } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  deleteGuest: vi.fn(),
}));

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'Jane',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const ADDED = guest({
  id: 'guest-2',
  firstName: 'Sam',
  lastName: 'Plus-One',
  rsvpStatus: 'pending',
  source: 'guest_added',
  flaggedForReview: true,
});

const setup = (guests: AdminGuest[] = [guest({}), ADDED]) => {
  const onChanged = vi.fn();

  render(<GuestList partyId='party-1' guests={guests} addGuestCap={2} onChanged={onChanged} />);

  return { onChanged };
};

beforeEach(() => {
  vi.mocked(createGuest).mockReset().mockResolvedValue(guest({}));
  vi.mocked(updateGuest).mockReset().mockResolvedValue(guest({}));
  vi.mocked(deleteGuest).mockReset().mockResolvedValue(guest({}));
});

describe('GuestList', () => {
  it('lists each guest with its RSVP status', () => {
    setup();

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Sam Plus-One')).toBeInTheDocument();
    expect(screen.getByText('attending')).toBeInTheDocument();
  });

  it('marks a guest-added plus-one that is awaiting review', () => {
    setup();

    expect(screen.getByText('Added by guest')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
  });

  it('reports the add-guest cap and how much of it is used', () => {
    setup();

    expect(screen.getByText('Add-guest cap: 1 of 2 used')).toBeInTheDocument();
  });

  it('shows an empty state when the party has no guests', () => {
    setup([]);

    expect(screen.getByText('No guests on this invitation yet.')).toBeInTheDocument();
  });

  it('creates a guest against this party and refreshes', async () => {
    const { onChanged } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(createGuest).toHaveBeenCalledWith({
        partyId: 'party-1',
        firstName: 'New',
        lastName: 'Guest',
        rsvpStatus: 'pending',
        songRequest: null,
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('patches an edited guest by id and refreshes', async () => {
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(updateGuest).toHaveBeenCalledWith('guest-1', {
        firstName: 'Jane',
        lastName: 'Smith',
        rsvpStatus: 'declined',
        songRequest: null,
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('deletes a guest only after the confirmation is accepted', async () => {
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(deleteGuest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(deleteGuest).toHaveBeenCalledWith('guest-1'));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps the form open and shows the server message when a write fails', async () => {
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onChanged } = setup([]);

    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }));

    await waitFor(() =>
      expect(screen.getByTestId('guest-form-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  // GuestRow owns its own error paragraph, on a different code path from the
  // add-guest form above. Without this test a failed delete renders nothing.
  it('shows the row’s own error when a delete fails, and does not refresh', async () => {
    vi.mocked(deleteGuest).mockRejectedValue(
      new ApiError(404, 'guest_not_found', 'Guest not found'),
    );
    const { onChanged } = setup([guest({})]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() =>
      expect(screen.getByTestId('guest-row-error-guest-1')).toHaveTextContent('Guest not found'),
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/admin/GuestList.test.tsx`
Expected: FAIL — cannot resolve `./GuestList`.

- [ ] **Step 7: Write GuestRow and GuestList**

Create `src/components/admin/GuestRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
import { GuestForm } from './GuestForm';
import { RsvpStatusBadge } from './RsvpStatusBadge';
import { deleteGuest, updateGuest, type GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { GUEST_SOURCE } from '@/lib/enums';

interface GuestRowProps {
  guest: AdminGuest;
  onChanged: () => void;
}

export const GuestRow: React.FC<GuestRowProps> = ({ guest, onChanged }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { isSaving, errorMessage, run } = useAdminMutation();

  const save = (fields: GuestFields) => {
    void run(() => updateGuest(guest.id, fields), () => {
      setIsEditing(false);
      onChanged();
    });
  };

  const remove = () => {
    void run(() => deleteGuest(guest.id), onChanged);
  };

  if (isEditing) {
    return (
      <li className='py-2'>
        <GuestForm
          initialGuest={guest}
          submitLabel='Save guest'
          isSaving={isSaving}
          errorMessage={errorMessage}
          onSubmit={save}
          onCancel={() => setIsEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'>
      <span className='text-sm text-sage-800'>
        {guest.firstName} {guest.lastName}
      </span>

      <RsvpStatusBadge status={guest.rsvpStatus} />

      {guest.source === GUEST_SOURCE.guestAdded && (
        <span className='text-xs text-sage-700/80'>Added by guest</span>
      )}

      {guest.flaggedForReview && (
        <span className='rounded-full bg-sage-200 px-2 py-0.5 text-xs text-sage-800'>
          Awaiting review
        </span>
      )}

      {guest.songRequest && (
        <span className='text-xs text-sage-700/80'>♪ {guest.songRequest}</span>
      )}

      <span className='ml-auto flex items-center gap-1'>
        <button
          type='button'
          onClick={() => setIsEditing(true)}
          className='rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Edit
        </button>
        <ConfirmButton
          label='Remove'
          confirmPrompt={`Remove ${guest.firstName} ${guest.lastName}?`}
          isBusy={isSaving}
          onConfirm={remove}
        />
      </span>

      {errorMessage && (
        <p
          role='alert'
          data-testid={`guest-row-error-${guest.id}`}
          className='w-full text-sm text-sage-800'
        >
          {errorMessage}
        </p>
      )}
    </li>
  );
};
```

Create `src/components/admin/GuestList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { GuestForm } from './GuestForm';
import { GuestRow } from './GuestRow';
import { createGuest, type GuestFields } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { GUEST_SOURCE } from '@/lib/enums';

interface GuestListProps {
  partyId: string;
  guests: readonly AdminGuest[];
  addGuestCap: number;
  onChanged: () => void;
}

export const GuestList: React.FC<GuestListProps> = ({
  partyId,
  guests,
  addGuestCap,
  onChanged,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const { isSaving, errorMessage, run } = useAdminMutation();

  const addedByGuests = guests.filter((guest) => guest.source === GUEST_SOURCE.guestAdded).length;

  const add = (fields: GuestFields) => {
    void run(() => createGuest({ ...fields, partyId }), () => {
      setIsAdding(false);
      onChanged();
    });
  };

  return (
    <div>
      {guests.length === 0 ? (
        <p className='py-2 text-sm text-sage-700/80'>No guests on this invitation yet.</p>
      ) : (
        <ul className='divide-y divide-sage-200/70'>
          {guests.map((guest) => (
            <GuestRow key={guest.id} guest={guest} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <p className='mt-3 text-xs text-sage-700/80'>
        Add-guest cap: {addedByGuests} of {addGuestCap} used
      </p>

      <div className='mt-3'>
        {isAdding ? (
          <GuestForm
            submitLabel='Save guest'
            isSaving={isSaving}
            errorMessage={errorMessage}
            onSubmit={add}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          <button
            type='button'
            onClick={() => setIsAdding(true)}
            className='rounded-full border border-sage-300 px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
          >
            Add guest
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/admin/GuestList.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 9: Run the gate and commit**

```bash
npm test 2>&1 | tail -8 && npm run lint
git add src/components/admin/GuestForm.tsx src/components/admin/GuestForm.test.tsx src/components/admin/GuestRow.tsx src/components/admin/GuestList.tsx src/components/admin/GuestList.test.tsx
git commit -m "feat: admin guest form, row and list with RSVP-on-behalf editing (#69)"
```

---

### Task 6: Party fields, party edit form, new-party form

**Files:**
- Create: `src/components/admin/PartyFields.tsx`
- Create: `src/components/admin/PartyEditForm.tsx`
- Create: `src/components/admin/NewPartyForm.tsx`
- Create: `src/components/admin/NewPartyForm.test.tsx`
- Create: `src/components/admin/PartyEditForm.test.tsx`

**Interfaces:**
- Consumes: `createParty`, `updateParty`, `deleteParty`, `NewPartyBody`, `PartyPatch` from `@/lib/admin/client`; `useAdminMutation`; `ConfirmButton`; `AdminParty` from `@/lib/admin/projections`; `RSVP_STATUS` from `@/lib/enums`.
- Produces:
  - `interface PartyFieldValues { displayName: string; message: string; addGuestCap: string }` and `PartyFields: React.FC<{ values: PartyFieldValues; onChange: (values: PartyFieldValues) => void; capHint: string }>` — a controlled **fieldset**, not a form: both the create and the edit form own their own `<form>` and submit.
  - `toAddGuestCap(raw: string): number | undefined` (exported from `PartyFields.tsx`) — parses the cap input; a blank input yields `undefined`, meaning "leave it to the server".
  - `NewPartyForm: React.FC<{ onCreated: () => void; onCancel: () => void }>`
  - `PartyEditForm: React.FC<{ party: AdminParty; onSaved: () => void; onCancel: () => void }>`

`addGuestCap` is held as a string because the input is text-shaped: an empty box has to be distinguishable from `0`. Both forms always send `displayName` and `message`, so the server's `nonEmptyPatch` refinement can never see an empty patch.

- [ ] **Step 1: Write the failing NewPartyForm test**

Create `src/components/admin/NewPartyForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewPartyForm } from './NewPartyForm';
import { createParty } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';

vi.mock('@/lib/admin/client', () => ({ createParty: vi.fn() }));

const setup = () => {
  const onCreated = vi.fn();
  const onCancel = vi.fn();

  render(<NewPartyForm onCreated={onCreated} onCancel={onCancel} />);

  return { onCreated, onCancel };
};

beforeEach(() => {
  vi.mocked(createParty).mockReset().mockResolvedValue({
    id: 'party-1',
    displayName: 'The Smith Family',
    message: null,
    addGuestCap: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    guests: [],
  });
});

describe('NewPartyForm', () => {
  it('creates a party with its guests in one call and reports success', async () => {
    const { onCreated } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Guest 1 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another guest' }));
    fireEvent.change(screen.getByLabelText('Guest 2 first name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Guest 2 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith({
        displayName: 'The Smith Family',
        message: null,
        addGuestCap: undefined,
        guests: [
          { firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
          { firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
        ],
      }),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('sends the entered add-guest cap, including zero', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.change(screen.getByLabelText('Add-guest cap'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(expect.objectContaining({ addGuestCap: 0 })),
    );
  });

  it('omits a blank cap so the server default applies', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(
        expect.objectContaining({ addGuestCap: undefined }),
      ),
    );
  });

  it('allows a party with no guests yet', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aunt Marge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(expect.objectContaining({ guests: [] })),
    );
  });

  it('refuses to submit without a display name', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    expect(createParty).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create party' })).toBeDisabled();
  });

  it('refuses to submit a half-filled guest row rather than dropping it', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    expect(createParty).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-party-error')).toHaveTextContent(
      'Every guest needs both a first and a last name.',
    );
  });

  it('drops a removed guest row from the payload', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smith Family' } });
    fireEvent.change(screen.getByLabelText('Guest 1 first name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Guest 1 last name'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another guest' }));
    fireEvent.change(screen.getByLabelText('Guest 2 first name'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove guest 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(createParty).toHaveBeenCalledWith(
        expect.objectContaining({
          guests: [
            { firstName: 'John', lastName: 'Smith', rsvpStatus: 'pending', songRequest: null },
          ],
        }),
      ),
    );
  });

  it('shows the server message and does not report success when the create fails', async () => {
    vi.mocked(createParty).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onCreated } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));

    await waitFor(() =>
      expect(screen.getByTestId('new-party-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/NewPartyForm.test.tsx`
Expected: FAIL — cannot resolve `./NewPartyForm`.

- [ ] **Step 3: Write PartyFields**

Create `src/components/admin/PartyFields.tsx`:

```tsx
'use client';

import { useId } from 'react';

export interface PartyFieldValues {
  displayName: string;
  message: string;
  addGuestCap: string;
}

interface PartyFieldsProps {
  values: PartyFieldValues;
  onChange: (values: PartyFieldValues) => void;
  capHint: string;
}

const INPUT_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

/**
 * Parses the add-guest cap input. A blank box means "unspecified", which the
 * server resolves to `Settings.defaultAddGuestCap`; that is why the value is
 * held as a string, so an empty field stays distinguishable from `0`.
 */
export const toAddGuestCap = (raw: string): number | undefined => {
  const trimmed = raw.trim();

  return trimmed.length === 0 ? undefined : Number(trimmed);
};

export const PartyFields: React.FC<PartyFieldsProps> = ({ values, onChange, capHint }) => {
  const fieldId = useId();

  const update = (patch: Partial<PartyFieldValues>) => onChange({ ...values, ...patch });

  return (
    <div className='grid gap-3'>
      <div>
        <label className='text-xs text-sage-700' htmlFor={`${fieldId}-name`}>
          Display name
        </label>
        <input
          id={`${fieldId}-name`}
          type='text'
          value={values.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          className={INPUT_CLASSES}
        />
      </div>

      <div>
        <label className='text-xs text-sage-700' htmlFor={`${fieldId}-message`}>
          Message
        </label>
        <textarea
          id={`${fieldId}-message`}
          rows={2}
          value={values.message}
          onChange={(event) => update({ message: event.target.value })}
          className={INPUT_CLASSES}
        />
      </div>

      <div>
        <label className='text-xs text-sage-700' htmlFor={`${fieldId}-cap`}>
          Add-guest cap
        </label>
        <input
          id={`${fieldId}-cap`}
          type='number'
          min={0}
          max={20}
          value={values.addGuestCap}
          onChange={(event) => update({ addGuestCap: event.target.value })}
          className={`${INPUT_CLASSES} sm:w-32`}
        />
        <p className='mt-1 text-xs text-sage-700/80'>{capHint}</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Write NewPartyForm**

Create `src/components/admin/NewPartyForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { PartyFields, toAddGuestCap, type PartyFieldValues } from './PartyFields';
import { createParty, type GuestFields } from '@/lib/admin/client';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';
import { RSVP_STATUS } from '@/lib/enums';

interface NewPartyFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

interface GuestNameRow {
  firstName: string;
  lastName: string;
}

const EMPTY_FIELDS: PartyFieldValues = { displayName: '', message: '', addGuestCap: '' };
const EMPTY_ROW: GuestNameRow = { firstName: '', lastName: '' };
const HALF_FILLED_MESSAGE = 'Every guest needs both a first and a last name.';

const INPUT_CLASSES =
  'w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

const isBlank = (row: GuestNameRow) =>
  row.firstName.trim().length === 0 && row.lastName.trim().length === 0;

const isComplete = (row: GuestNameRow) =>
  row.firstName.trim().length > 0 && row.lastName.trim().length > 0;

const toGuestFields = (row: GuestNameRow): GuestFields => ({
  firstName: row.firstName.trim(),
  lastName: row.lastName.trim(),
  rsvpStatus: RSVP_STATUS.pending,
  songRequest: null,
});

export const NewPartyForm: React.FC<NewPartyFormProps> = ({ onCreated, onCancel }) => {
  const [fields, setFields] = useState<PartyFieldValues>(EMPTY_FIELDS);
  const [rows, setRows] = useState<GuestNameRow[]>([EMPTY_ROW]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const { isSaving, errorMessage, run } = useAdminMutation();

  const displayName = fields.displayName.trim();
  const canSubmit = displayName.length > 0 && !isSaving;

  const updateRow = (index: number, patch: Partial<GuestNameRow>) =>
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const entered = rows.filter((row) => !isBlank(row));

    if (entered.some((row) => !isComplete(row))) {
      setValidationMessage(HALF_FILLED_MESSAGE);
      return;
    }

    setValidationMessage(null);

    void run(
      () =>
        createParty({
          displayName,
          message: fields.message.trim() || null,
          addGuestCap: toAddGuestCap(fields.addGuestCap),
          guests: entered.map(toGuestFields),
        }),
      onCreated,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className='rounded-xl border border-sage-200 bg-white p-5 shadow-sm'
    >
      <h2 className='text-lg text-sage-800'>New party</h2>

      <div className='mt-4'>
        <PartyFields
          values={fields}
          onChange={setFields}
          capHint='Leave blank to use the default from settings.'
        />
      </div>

      <fieldset className='mt-5'>
        <legend className='text-xs text-sage-700'>Guests</legend>

        <ul className='mt-2 grid gap-2'>
          {rows.map((row, index) => (
            <li key={index} className='flex flex-wrap items-center gap-2'>
              <label className='sr-only' htmlFor={`guest-${index}-first`}>
                Guest {index + 1} first name
              </label>
              <input
                id={`guest-${index}-first`}
                type='text'
                placeholder='First name'
                value={row.firstName}
                onChange={(event) => updateRow(index, { firstName: event.target.value })}
                className={`${INPUT_CLASSES} sm:w-40`}
              />

              <label className='sr-only' htmlFor={`guest-${index}-last`}>
                Guest {index + 1} last name
              </label>
              <input
                id={`guest-${index}-last`}
                type='text'
                placeholder='Last name'
                value={row.lastName}
                onChange={(event) => updateRow(index, { lastName: event.target.value })}
                className={`${INPUT_CLASSES} sm:w-40`}
              />

              {rows.length > 1 && (
                <button
                  type='button'
                  onClick={() =>
                    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                  }
                  className='rounded-md px-2 py-1 text-xs text-sage-700 underline decoration-sage-300 hover:text-sage-800'
                >
                  Remove guest {index + 1}
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          type='button'
          onClick={() => setRows((current) => [...current, EMPTY_ROW])}
          className='mt-3 rounded-full border border-sage-300 px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
        >
          Add another guest
        </button>
      </fieldset>

      {(validationMessage ?? errorMessage) && (
        <p role='alert' data-testid='new-party-error' className='mt-4 text-sm text-sage-800'>
          {validationMessage ?? errorMessage}
        </p>
      )}

      <div className='mt-5 flex items-center gap-3'>
        <button
          type='submit'
          disabled={!canSubmit}
          className='rounded-full bg-sage-700 px-5 py-2 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Creating…' : 'Create party'}
        </button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/components/admin/NewPartyForm.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing PartyEditForm test**

Create `src/components/admin/PartyEditForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartyEditForm } from './PartyEditForm';
import { deleteParty, updateParty } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({ updateParty: vi.fn(), deleteParty: vi.fn() }));

const PARTY: AdminParty = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: 'So glad you can come',
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [
    {
      id: 'guest-1',
      partyId: 'party-1',
      firstName: 'John',
      lastName: 'Smith',
      rsvpStatus: 'attending',
      songRequest: null,
      source: 'admin',
      flaggedForReview: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const setup = (party: AdminParty = PARTY) => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();

  render(<PartyEditForm party={party} onSaved={onSaved} onCancel={onCancel} />);

  return { onSaved, onCancel };
};

beforeEach(() => {
  vi.mocked(updateParty).mockReset().mockResolvedValue(PARTY);
  vi.mocked(deleteParty).mockReset().mockResolvedValue(PARTY);
});

describe('PartyEditForm', () => {
  it('prefills the party fields', () => {
    setup();

    expect(screen.getByLabelText('Display name')).toHaveValue('The Smith Family');
    expect(screen.getByLabelText('Message')).toHaveValue('So glad you can come');
    expect(screen.getByLabelText('Add-guest cap')).toHaveValue(2);
  });

  it('patches the changed fields and reports success', async () => {
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'The Smiths' } });
    fireEvent.change(screen.getByLabelText('Add-guest cap'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(updateParty).toHaveBeenCalledWith('party-1', {
        displayName: 'The Smiths',
        message: 'So glad you can come',
        addGuestCap: 4,
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('clears an emptied message to null', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(updateParty).toHaveBeenCalledWith('party-1', expect.objectContaining({ message: null })),
    );
  });

  it('names the guest cascade in the delete confirmation and deletes only once accepted', async () => {
    const { onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));
    expect(screen.getByText('Remove this party and its 1 guest?')).toBeInTheDocument();
    expect(deleteParty).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete party' }));

    await waitFor(() => expect(deleteParty).toHaveBeenCalledWith('party-1'));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('pluralizes the cascade warning', () => {
    setup({ ...PARTY, guests: [...PARTY.guests, ...PARTY.guests] });

    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));

    expect(screen.getByText('Remove this party and its 2 guests?')).toBeInTheDocument();
  });

  it('shows the server message when the save fails', async () => {
    vi.mocked(updateParty).mockRejectedValue(
      new ApiError(400, 'invalid_request', 'Must be between 1 and 100 characters'),
    );
    const { onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Save party' }));

    await waitFor(() =>
      expect(screen.getByTestId('party-edit-error')).toHaveTextContent(
        'Must be between 1 and 100 characters',
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/components/admin/PartyEditForm.test.tsx`
Expected: FAIL — cannot resolve `./PartyEditForm`.

- [ ] **Step 8: Write PartyEditForm**

Create `src/components/admin/PartyEditForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
import { PartyFields, toAddGuestCap, type PartyFieldValues } from './PartyFields';
import { deleteParty, updateParty } from '@/lib/admin/client';
import type { AdminParty } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';

interface PartyEditFormProps {
  party: AdminParty;
  onSaved: () => void;
  onCancel: () => void;
}

const initialValues = (party: AdminParty): PartyFieldValues => ({
  displayName: party.displayName,
  message: party.message ?? '',
  addGuestCap: String(party.addGuestCap),
});

export const PartyEditForm: React.FC<PartyEditFormProps> = ({ party, onSaved, onCancel }) => {
  const [values, setValues] = useState<PartyFieldValues>(() => initialValues(party));
  const { isSaving, errorMessage, run } = useAdminMutation();

  const displayName = values.displayName.trim();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (displayName.length === 0 || isSaving) {
      return;
    }

    void run(
      () =>
        updateParty(party.id, {
          displayName,
          message: values.message.trim() || null,
          addGuestCap: toAddGuestCap(values.addGuestCap),
        }),
      onSaved,
    );
  };

  const guestCount = party.guests.length;
  const cascadeWarning = `Remove this party and its ${guestCount} ${
    guestCount === 1 ? 'guest' : 'guests'
  }?`;

  return (
    <form onSubmit={handleSubmit} className='rounded-lg border border-sage-200 bg-white p-4'>
      <PartyFields
        values={values}
        onChange={setValues}
        capHint='How many extra guests this party may add themselves.'
      />

      {errorMessage && (
        <p role='alert' data-testid='party-edit-error' className='mt-3 text-sm text-sage-800'>
          {errorMessage}
        </p>
      )}

      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <button
          type='submit'
          disabled={displayName.length === 0 || isSaving}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : 'Save party'}
        </button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-sage-700 underline decoration-sage-300 hover:text-sage-800'
        >
          Cancel
        </button>

        <span className='ml-auto'>
          <ConfirmButton
            label='Delete party'
            confirmPrompt={cascadeWarning}
            confirmLabel='Yes, delete party'
            isBusy={isSaving}
            onConfirm={() => void run(() => deleteParty(party.id), onSaved)}
          />
        </span>
      </div>
    </form>
  );
};
```

- [ ] **Step 9: Run it, run the gate, commit**

```bash
npx vitest run src/components/admin/PartyEditForm.test.tsx
npm test 2>&1 | tail -8 && npm run lint
git add src/components/admin/PartyFields.tsx src/components/admin/PartyEditForm.tsx src/components/admin/PartyEditForm.test.tsx src/components/admin/NewPartyForm.tsx src/components/admin/NewPartyForm.test.tsx
git commit -m "feat: admin party create and edit forms with cap and cascade warning (#69)"
```

Expected: PartyEditForm 6 tests pass; full suite green.

---

### Task 7: Party row, party manager, `/admin/parties`

**Files:**
- Create: `src/components/admin/PartyRow.tsx`
- Create: `src/components/admin/PartyManager.tsx`
- Create: `src/components/admin/PartyManager.test.tsx`
- Create: `src/app/admin/parties/page.tsx`
- Modify: `src/constants/admin.ts`

**Interfaces:**
- Consumes: `fetchParties` from `@/lib/admin/client`; `ALL_STATUSES`, `filterParties`, `summarizeGuests` from `@/lib/admin/partyList`; `GuestList` (Task 5); `PartyEditForm`, `NewPartyForm` (Task 6); `ApiError` from `@/lib/http/apiClient`; `RSVP_STATUS` from `@/lib/enums`.
- Produces:
  - `PartyRow: React.FC<{ party: AdminParty; isExpanded: boolean; onToggle: () => void; onChanged: () => void }>`
  - `PartyManager: React.FC` — loads the list on mount, owns search text, status filter, which row is expanded, and the create form.
  - `ADMIN_NAV_LINKS` gains `{ label: 'Parties', href: '/admin/parties' }`.

- [ ] **Step 1: Write the failing PartyManager test**

Create `src/components/admin/PartyManager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartyManager } from './PartyManager';
import { deleteParty, fetchParties } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  fetchParties: vi.fn(),
  createParty: vi.fn(),
  updateParty: vi.fn(),
  deleteParty: vi.fn(),
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  deleteGuest: vi.fn(),
}));

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const SMITHS: AdminParty = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [guest({}), guest({ id: 'guest-2', firstName: 'Jane', rsvpStatus: 'pending' })],
};

const CHENS: AdminParty = {
  id: 'party-2',
  displayName: 'The Chen Family',
  message: null,
  addGuestCap: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [
    guest({ id: 'guest-3', partyId: 'party-2', firstName: 'Wei', lastName: 'Chen', rsvpStatus: 'declined' }),
  ],
};

beforeEach(() => {
  vi.mocked(fetchParties).mockReset().mockResolvedValue([SMITHS, CHENS]);
  vi.mocked(deleteParty).mockReset().mockResolvedValue(SMITHS);
});


describe('PartyManager', () => {
  it('lists every party with its guest tally once loaded', async () => {
    render(<PartyManager />);

    expect(await screen.findByText('The Smith Family')).toBeInTheDocument();
    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.getByText('2 guests · 1 attending · 1 pending')).toBeInTheDocument();
    expect(screen.getByText('1 guest · 1 declined')).toBeInTheDocument();
  });

  it('filters by the search box across party and guest names', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('Search parties and guests'), { target: { value: 'wei' } });

    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.queryByText('The Smith Family')).not.toBeInTheDocument();
  });

  it('filters by RSVP status', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('RSVP status'), { target: { value: 'declined' } });

    expect(screen.getByText('The Chen Family')).toBeInTheDocument();
    expect(screen.queryByText('The Smith Family')).not.toBeInTheDocument();
  });

  it('reports when nothing matches the current search', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.change(screen.getByLabelText('Search parties and guests'), { target: { value: 'nobody' } });

    expect(screen.getByText('No parties match this search.')).toBeInTheDocument();
  });

  it('reveals a party’s guests when its row is expanded', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /The Smith Family/ }));

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('The Smith Family');
  });

  it('re-fetches the list after a party is deleted', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.click(screen.getByRole('button', { name: /The Smith Family/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete party' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete party' }));

    await waitFor(() => expect(fetchParties).toHaveBeenCalledTimes(2));
  });

  it('opens the create form and closes it again on cancel', async () => {
    render(<PartyManager />);
    await screen.findByText('The Smith Family');

    fireEvent.click(screen.getByRole('button', { name: 'New party' }));
    expect(screen.getByRole('heading', { name: 'New party' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'New party' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no parties at all', async () => {
    vi.mocked(fetchParties).mockResolvedValue([]);
    render(<PartyManager />);

    expect(await screen.findByText('No parties yet. Create the first one.')).toBeInTheDocument();
  });

  it('surfaces a load failure with a retry that re-fetches', async () => {
    vi.mocked(fetchParties).mockRejectedValueOnce(
      new ApiError(500, 'server_error', 'The guest list is unavailable.'),
    );
    render(<PartyManager />);

    expect(await screen.findByTestId('party-list-error')).toHaveTextContent(
      'The guest list is unavailable.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('The Smith Family')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/PartyManager.test.tsx`
Expected: FAIL — cannot resolve `./PartyManager`.

- [ ] **Step 3: Write PartyRow**

Create `src/components/admin/PartyRow.tsx`:

```tsx
'use client';

import { GuestList } from './GuestList';
import { PartyEditForm } from './PartyEditForm';
import type { AdminParty } from '@/lib/admin/projections';
import { summarizeGuests, type GuestTally } from '@/lib/admin/partyList';

interface PartyRowProps {
  party: AdminParty;
  isExpanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}

const tallyText = (tally: GuestTally): string => {
  const parts = [`${tally.total} ${tally.total === 1 ? 'guest' : 'guests'}`];

  if (tally.attending > 0) {
    parts.push(`${tally.attending} attending`);
  }

  if (tally.declined > 0) {
    parts.push(`${tally.declined} declined`);
  }

  if (tally.pending > 0) {
    parts.push(`${tally.pending} pending`);
  }

  return parts.join(' · ');
};

export const PartyRow: React.FC<PartyRowProps> = ({
  party,
  isExpanded,
  onToggle,
  onChanged,
}) => {
  const tally = summarizeGuests(party.guests);

  return (
    <li className='border-b border-sage-200/70 last:border-b-0'>
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={isExpanded}
        className='flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-1 py-3 text-left hover:bg-sage-100/60'
      >
        <span aria-hidden='true' className='text-xs text-sage-700'>
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className='text-sage-800'>{party.displayName}</span>
        {tally.flagged > 0 && (
          <span className='rounded-full bg-sage-200 px-2 py-0.5 text-xs text-sage-800'>
            {tally.flagged} awaiting review
          </span>
        )}
        <span className='ml-auto text-xs text-sage-700/80'>{tallyText(tally)}</span>
      </button>

      {isExpanded && (
        <div className='grid gap-4 px-1 pb-5'>
          <PartyEditForm party={party} onSaved={onChanged} onCancel={onToggle} />
          <GuestList
            partyId={party.id}
            guests={party.guests}
            addGuestCap={party.addGuestCap}
            onChanged={onChanged}
          />
        </div>
      )}
    </li>
  );
};
```

- [ ] **Step 4: Write PartyManager**

Create `src/components/admin/PartyManager.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { NewPartyForm } from './NewPartyForm';
import { PartyRow } from './PartyRow';
import { fetchParties } from '@/lib/admin/client';
import { ALL_STATUSES, filterParties } from '@/lib/admin/partyList';
import type { AdminParty } from '@/lib/admin/projections';
import { RSVP_STATUS } from '@/lib/enums';
import { ApiError } from '@/lib/http/apiClient';

const LOAD_ERROR_MESSAGE = 'We could not load the guest list. Please try again.';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_STATUSES, label: 'All statuses' },
  { value: RSVP_STATUS.attending, label: 'Attending' },
  { value: RSVP_STATUS.declined, label: 'Declined' },
  { value: RSVP_STATUS.pending, label: 'Pending' },
];

const CONTROL_CLASSES =
  'mt-1 w-full rounded-md border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800 focus:border-sage-700 focus:outline-none';

export const PartyManager: React.FC = () => {
  const [parties, setParties] = useState<AdminParty[] | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadErrorMessage(null);

    try {
      setParties(await fetchParties());
    } catch (error) {
      setLoadErrorMessage(error instanceof ApiError ? error.message : LOAD_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = () => {
    setIsCreating(false);
    void load();
  };

  if (loadErrorMessage) {
    return (
      <div>
        <p role='alert' data-testid='party-list-error' className='text-sm text-sage-800'>
          {loadErrorMessage}
        </p>
        <button
          type='button'
          onClick={() => void load()}
          className='mt-3 rounded-full border border-sage-300 px-4 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
        >
          Try again
        </button>
      </div>
    );
  }

  if (parties === null) {
    return <p className='text-sm text-sage-700/80'>Loading the guest list…</p>;
  }

  const visible = filterParties(parties, { query, status });

  return (
    <div>
      <div className='flex flex-wrap items-end gap-4'>
        <div className='min-w-56 flex-1'>
          <label className='text-xs text-sage-700' htmlFor='party-search'>
            Search parties and guests
          </label>
          <input
            id='party-search'
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={CONTROL_CLASSES}
          />
        </div>

        <div className='w-40'>
          <label className='text-xs text-sage-700' htmlFor='party-status'>
            RSVP status
          </label>
          <select
            id='party-status'
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={CONTROL_CLASSES}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!isCreating && (
          <button
            type='button'
            onClick={() => setIsCreating(true)}
            className='rounded-full bg-sage-700 px-5 py-2 text-sm text-white hover:bg-sage-800'
          >
            New party
          </button>
        )}
      </div>

      {isCreating && (
        <div className='mt-6'>
          <NewPartyForm onCreated={handleCreated} onCancel={() => setIsCreating(false)} />
        </div>
      )}

      <p className='mt-6 text-xs text-sage-700/80'>
        {visible.length} of {parties.length} {parties.length === 1 ? 'party' : 'parties'}
      </p>

      {parties.length === 0 && (
        <p className='mt-4 text-sm text-sage-700/80'>No parties yet. Create the first one.</p>
      )}

      {parties.length > 0 && visible.length === 0 && (
        <p className='mt-4 text-sm text-sage-700/80'>No parties match this search.</p>
      )}

      <ul className='mt-2'>
        {visible.map((party) => (
          <PartyRow
            key={party.id}
            party={party}
            isExpanded={expandedPartyId === party.id}
            onToggle={() =>
              setExpandedPartyId((current) => (current === party.id ? null : party.id))
            }
            onChanged={() => void load()}
          />
        ))}
      </ul>
    </div>
  );
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/PartyManager.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 6: Add the page and the nav link**

Create `src/app/admin/parties/page.tsx`:

```tsx
import { PartyManager } from '@/components/admin/PartyManager';

export const dynamic = 'force-dynamic';

const AdminPartiesPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Parties</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Search the guest list, edit invitations, and record RSVPs on a guest&rsquo;s behalf.
    </p>

    <div className='mt-8'>
      <PartyManager />
    </div>
  </section>
);

export default AdminPartiesPage;
```

Replace the `ADMIN_NAV_LINKS` declaration and its comment in `src/constants/admin.ts`:

```ts
/**
 * Drives the admin console navigation. Issue #70 (import/export, change log,
 * settings) appends its routes here.
 */
export const ADMIN_NAV_LINKS: readonly AdminNavLink[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Parties', href: '/admin/parties' },
];
```

- [ ] **Step 7: Run the gate and commit**

```bash
npm test 2>&1 | tail -8 && npm run lint && npm run build 2>&1 | tail -8
git add src/components/admin/PartyRow.tsx src/components/admin/PartyManager.tsx src/components/admin/PartyManager.test.tsx src/app/admin/parties src/constants/admin.ts
git commit -m "feat: /admin/parties list with search, filter and inline CRUD (#69)"
```

Expected: suite green, lint clean, build succeeds with `/admin/parties` in the route list.

---

### Task 8: Moderation queue and `/admin/moderation`

**Files:**
- Create: `src/components/admin/ModerationCard.tsx`
- Create: `src/components/admin/ModerationQueue.tsx`
- Create: `src/components/admin/ModerationQueue.test.tsx`
- Create: `src/app/admin/moderation/page.tsx`
- Modify: `src/constants/admin.ts`

**Interfaces:**
- Consumes: `fetchFlaggedGuests`, `fetchParties`, `moderateGuest` from `@/lib/admin/client`; `ConfirmButton`; `useAdminMutation`; `ApiError`.
- Produces:
  - `ModerationCard: React.FC<{ guest: AdminGuest; partyName: string; onResolved: () => void }>`
  - `ModerationQueue: React.FC`
  - `ADMIN_NAV_LINKS` gains `{ label: 'Moderation', href: '/admin/moderation' }`.

The queue needs both endpoints: the flagged-guest payload carries only `partyId`, and the question being answered is which party added this person.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/ModerationQueue.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModerationQueue } from './ModerationQueue';
import { fetchFlaggedGuests, fetchParties, moderateGuest } from '@/lib/admin/client';
import { ApiError } from '@/lib/http/apiClient';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

vi.mock('@/lib/admin/client', () => ({
  fetchFlaggedGuests: vi.fn(),
  fetchParties: vi.fn(),
  moderateGuest: vi.fn(),
}));

const FLAGGED: AdminGuest = {
  id: 'guest-9',
  partyId: 'party-2',
  firstName: 'Sam',
  lastName: 'Rivera',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'guest_added',
  flaggedForReview: true,
  createdAt: '2026-02-03T00:00:00.000Z',
  updatedAt: '2026-02-03T00:00:00.000Z',
};

const PARTY: AdminParty = {
  id: 'party-2',
  displayName: 'Alex Rivera & Guest',
  message: null,
  addGuestCap: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests: [FLAGGED],
};

beforeEach(() => {
  vi.mocked(fetchFlaggedGuests).mockReset().mockResolvedValue([FLAGGED]);
  vi.mocked(fetchParties).mockReset().mockResolvedValue([PARTY]);
  vi.mocked(moderateGuest).mockReset().mockResolvedValue(FLAGGED);
});


describe('ModerationQueue', () => {
  it('names the guest and the party that added them', async () => {
    render(<ModerationQueue />);

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByText('Added to Alex Rivera & Guest')).toBeInTheDocument();
  });

  it('states that approving still counts against the add-guest cap', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    expect(
      screen.getByText(
        'Approving keeps this guest counted against the party’s add-guest cap.',
      ),
    ).toBeInTheDocument();
  });

  it('approves without a confirmation step and refreshes', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(moderateGuest).toHaveBeenCalledWith('guest-9', 'approve'));
    await waitFor(() => expect(fetchFlaggedGuests).toHaveBeenCalledTimes(2));
  });

  it('removes only after the confirmation is accepted', async () => {
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(moderateGuest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(moderateGuest).toHaveBeenCalledWith('guest-9', 'remove'));
  });

  it('shows the empty state when nothing is awaiting review', async () => {
    vi.mocked(fetchFlaggedGuests).mockResolvedValue([]);
    render(<ModerationQueue />);

    expect(await screen.findByText('Nothing is awaiting review.')).toBeInTheDocument();
  });

  it('falls back to a neutral label when the party cannot be resolved', async () => {
    vi.mocked(fetchParties).mockResolvedValue([]);
    render(<ModerationQueue />);

    expect(await screen.findByText('Added to an unknown party')).toBeInTheDocument();
  });

  it('surfaces a guest already resolved elsewhere', async () => {
    vi.mocked(moderateGuest).mockRejectedValue(
      new ApiError(409, 'guest_not_flagged', 'This guest is not awaiting moderation'),
    );
    render(<ModerationQueue />);
    await screen.findByText('Sam Rivera');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(screen.getByTestId('moderation-error-guest-9')).toHaveTextContent(
        'This guest is not awaiting moderation',
      ),
    );
  });

  it('surfaces a load failure with a retry', async () => {
    vi.mocked(fetchFlaggedGuests).mockRejectedValueOnce(
      new ApiError(500, 'server_error', 'The queue is unavailable.'),
    );
    render(<ModerationQueue />);

    expect(await screen.findByTestId('moderation-load-error')).toHaveTextContent(
      'The queue is unavailable.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/ModerationQueue.test.tsx`
Expected: FAIL — cannot resolve `./ModerationQueue`.

- [ ] **Step 3: Write ModerationCard**

Create `src/components/admin/ModerationCard.tsx`:

```tsx
'use client';

import { ConfirmButton } from './ConfirmButton';
import { moderateGuest } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { useAdminMutation } from '@/lib/admin/useAdminMutation';

interface ModerationCardProps {
  guest: AdminGuest;
  partyName: string;
  onResolved: () => void;
}

const addedOn = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export const ModerationCard: React.FC<ModerationCardProps> = ({
  guest,
  partyName,
  onResolved,
}) => {
  const { isSaving, errorMessage, run } = useAdminMutation();

  return (
    <li className='rounded-xl border border-sage-200 bg-white p-5'>
      <p className='text-sage-800'>
        {guest.firstName} {guest.lastName}
      </p>
      <p className='mt-1 text-sm text-sage-700/80'>Added to {partyName}</p>
      <p className='mt-1 text-xs text-sage-700/80'>Added {addedOn(guest.createdAt)}</p>

      <p className='mt-3 text-xs text-sage-700/80'>
        Approving keeps this guest counted against the party&rsquo;s add-guest cap.
      </p>

      {errorMessage && (
        <p
          role='alert'
          data-testid={`moderation-error-${guest.id}`}
          className='mt-3 text-sm text-sage-800'
        >
          {errorMessage}
        </p>
      )}

      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <button
          type='button'
          disabled={isSaving}
          onClick={() => void run(() => moderateGuest(guest.id, 'approve'), onResolved)}
          className='rounded-full bg-sage-700 px-4 py-1.5 text-sm text-white hover:bg-sage-800 disabled:opacity-60'
        >
          {isSaving ? 'Saving…' : 'Approve'}
        </button>

        <ConfirmButton
          label='Remove'
          confirmPrompt={`Remove ${guest.firstName} ${guest.lastName} from ${partyName}?`}
          isBusy={isSaving}
          onConfirm={() => void run(() => moderateGuest(guest.id, 'remove'), onResolved)}
        />
      </div>
    </li>
  );
};
```

- [ ] **Step 4: Write ModerationQueue**

Create `src/components/admin/ModerationQueue.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ModerationCard } from './ModerationCard';
import { fetchFlaggedGuests, fetchParties } from '@/lib/admin/client';
import type { AdminGuest } from '@/lib/admin/projections';
import { ApiError } from '@/lib/http/apiClient';

const LOAD_ERROR_MESSAGE = 'We could not load the moderation queue. Please try again.';
const UNKNOWN_PARTY = 'an unknown party';

interface QueueData {
  flagged: AdminGuest[];
  partyNames: Record<string, string>;
}

export const ModerationQueue: React.FC = () => {
  const [data, setData] = useState<QueueData | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErrorMessage(null);

    try {
      const [flagged, parties] = await Promise.all([fetchFlaggedGuests(), fetchParties()]);

      setData({
        flagged,
        partyNames: Object.fromEntries(parties.map((party) => [party.id, party.displayName])),
      });
    } catch (error) {
      setLoadErrorMessage(error instanceof ApiError ? error.message : LOAD_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadErrorMessage) {
    return (
      <div>
        <p role='alert' data-testid='moderation-load-error' className='text-sm text-sage-800'>
          {loadErrorMessage}
        </p>
        <button
          type='button'
          onClick={() => void load()}
          className='mt-3 rounded-full border border-sage-300 px-4 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) {
    return <p className='text-sm text-sage-700/80'>Loading the queue…</p>;
  }

  if (data.flagged.length === 0) {
    return <p className='text-sm text-sage-700/80'>Nothing is awaiting review.</p>;
  }

  return (
    <ul className='grid gap-4'>
      {data.flagged.map((guest) => (
        <ModerationCard
          key={guest.id}
          guest={guest}
          partyName={data.partyNames[guest.partyId] ?? UNKNOWN_PARTY}
          onResolved={() => void load()}
        />
      ))}
    </ul>
  );
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/ModerationQueue.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Add the page and the nav link**

Create `src/app/admin/moderation/page.tsx`:

```tsx
import { ModerationQueue } from '@/components/admin/ModerationQueue';

export const dynamic = 'force-dynamic';

const AdminModerationPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Moderation</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Plus-ones guests added themselves, waiting on your approval.
    </p>

    <div className='mt-8'>
      <ModerationQueue />
    </div>
  </section>
);

export default AdminModerationPage;
```

Append the moderation link to `ADMIN_NAV_LINKS` in `src/constants/admin.ts`:

```ts
export const ADMIN_NAV_LINKS: readonly AdminNavLink[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Parties', href: '/admin/parties' },
  { label: 'Moderation', href: '/admin/moderation' },
];
```

- [ ] **Step 7: Run the full gate and commit**

```bash
npm run lint && npm run check:images && npm test 2>&1 | tail -12 && npm run build 2>&1 | tail -10
git add src/components/admin/ModerationCard.tsx src/components/admin/ModerationQueue.tsx src/components/admin/ModerationQueue.test.tsx src/app/admin/moderation src/constants/admin.ts
git commit -m "feat: /admin/moderation queue for flagged guest-added plus-ones (#69)"
```

Expected: every gate step green; `/admin/parties` and `/admin/moderation` both listed in the build output.

---

### Task 9: Document the screens

**Files:**
- Modify: `AGENTS.md` (the `### Admin console UI` section)

- [ ] **Step 1: Extend the Admin console UI section**

Insert the following after the paragraph ending "…`getSummaryStats()` … every count filters `deletedAt: null` on the guest *and* its party." and before the `Design:` line, then add the new design-doc reference:

```markdown
`/admin/parties` and `/admin/moderation` are the management screens. Both are thin
server pages rendering one client component, and every read and write goes through
`/api/admin/*` via `src/lib/admin/client.ts` — never through the services directly.
Routing mutations through the API keeps `handleAdminRequest()` as the single audited
entry path, so no second code path can write without an `actorEmail`.

Search and the status filter are **client-side** (`filterParties` in
`src/lib/admin/partyList.ts`): `GET /api/admin/parties` already returns every live
party with its live guests nested, so the whole screen is one request. Search spans
guest names as well as the party display name.

Every mutation is followed by a re-fetch rather than a local merge, because the server
orders parties by `displayName` and guests by `(createdAt, id)` — reproducing that
ordering on the client would be a second source of truth. Expanded-row state is keyed
by party id, so it survives the refresh.

Destructive actions use `ConfirmButton`, never `window.confirm`: a native dialog blocks
every subsequent browser event, which breaks browser-driven verification of these
screens. Deleting a party warns that the delete cascades to its guests, matching
`softDeleteParty`.

The moderation queue fetches flagged guests **and** parties, because
`GET /api/admin/guests?flagged=true` carries only `partyId` and the question a moderator
is answering is which party added the plus-one. Approving clears the flag but leaves
`source = guest_added`, so the guest still counts against that party's add-guest cap —
the card says so, since it is otherwise invisible. A guest resolved elsewhere returns
**409 `guest_not_flagged`**, shown inline.

The per-party `addGuestCap` is edited here; the global `Settings.defaultAddGuestCap`
belongs to the settings screen (#70). `src/lib/http/apiClient.ts` holds the shared
`requestJson`/`ApiError` transport used by both the admin and the guest RSVP clients.
```

Then change the `Design:` line to list both documents:

```markdown
Design: `docs/superpowers/specs/2026-07-27-admin-dashboard-shell-design.md`,
`docs/superpowers/specs/2026-07-27-admin-party-guest-management-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document the admin management screens (#69)"
```

---

## Verification beyond the gate

After Task 9, the orchestrator (not a task subagent) runs:

1. **Full gate in CI order** — `npm run lint && npm run check:images && npm test && npm run build`.
2. **Browser verification** against the local database (`npm run db:up`, `npm run db:seed`; the seed carries three parties and one flagged plus-one, Sam Rivera in "Alex Rivera & Guest"). Drive it per the `run-wedding-website` skill and prove **both** auth directions:
   - Signed out, `/admin/parties` and `/admin/moderation` redirect to `/signin`.
   - Signed in: create a party with two guests; search for a guest by name; filter by status; expand a party; rename it and change its add-guest cap; add a guest; set a guest's RSVP to attending; remove a guest; delete a party; approve one flagged guest and remove another.
   - Scope every assertion to the app's own DOM — a bare `getByRole('alert')` also matches the Next dev overlay.
   - Re-seed afterwards (`npm run db:seed`) so the database is left as found.
3. **Screenshots** for the PR: `/admin/parties` collapsed and expanded, the new-party form, `/admin/moderation`, and mobile widths of the list and the queue.
4. **Container parity** — `podman build -t czw:ci .` once, after any review fixes land.
