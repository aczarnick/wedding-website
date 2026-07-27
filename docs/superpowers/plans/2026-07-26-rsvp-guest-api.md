# RSVP Guest API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three public RSVP endpoints — party search, party read, and transactional RSVP submit — for issue #64.

**Architecture:** Pure policy functions (`src/lib/rsvp/policy.ts`) hold every rule decidable without a database, so cap enforcement, the deadline lock, and name matching are unit-tested in CI where no database exists. A service layer (`src/lib/rsvp/parties.ts`) takes the Prisma client as an explicit argument and owns the transaction. Route handlers only parse, call, and map errors to status codes.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript strict, Prisma 7 + `@prisma/adapter-mssql` against SQL Server, zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-rsvp-guest-api-design.md`

## Global Constraints

- Path alias `@/` → `src/`. Use it for every cross-directory import.
- **Never read `process.env` at module top level.** Env vars are read inside functions — `next build` and `docker build` run without secrets and evaluate every imported module.
- Prisma's `mode: 'insensitive'` is PostgreSQL/MongoDB-only and raises a validation error on `sqlserver`. Never use it. Case-insensitivity comes from the SQL Server collation (`SQL_Latin1_General_CP1_CI_AS`).
- zod 4 API: field errors come from the top-level `z.flattenError(error)`. The zod 3 `error.flatten()` instance method does not exist.
- String columns are `NVARCHAR(1000)`. Validation caps: names 1–100, `songRequest` ≤ 200, `message` ≤ 1000 — measured **after** trimming.
- Writable RSVP statuses are `attending` and `declined` only. `pending` is never accepted from a guest.
- `flaggedForReview` is never included in any response from these endpoints.
- Enum string values come from `src/lib/enums.ts` (`RSVP_STATUS`, `GUEST_SOURCE`, `ACTOR_TYPE`, `AUDIT_ACTION`) — never inline the literals.
- One top-level type per file; name the file after the type. XML/JSDoc `<summary>` comments on exported APIs only; no narration comments on private code.
- Error response body shape is exactly `{ "error": string, "code": string, ...details }`.
- Verification gate, in CI order: `npm run lint && npm run check:images && npm test && npm run build`.
- Work happens in the worktree `.claude/worktrees/issue-64-guest-api` on branch `issue-64-guest-api`.

---

### Task 1: Lazy Prisma client + zod as a direct dependency

`src/lib/prisma.ts` currently reads `DATABASE_URL` and throws at module top level. No route handler can import it until that changes — `next build` would fail. zod is present in the tree only transitively via `eslint-config-next`; runtime code needs it as a direct dependency.

**Files:**
- Modify: `src/lib/prisma.ts` (full rewrite, 25 lines)
- Modify: `package.json`, `package-lock.json` (add zod dependency)
- Test: `src/lib/prisma.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `getPrismaClient(): PrismaClient` from `@/lib/prisma` — memoized, throws `Error('DATABASE_URL is not set')` when the env var is missing or empty. Every later task calls this in route handlers.

- [ ] **Step 1: Add zod as a direct dependency, regenerating the lockfile inside the Linux image**

The lockfile must not be regenerated on macOS — `npm install` here prunes cross-platform `@emnapi/*` optional dependencies and breaks CI's `npm ci` (see `.claude/skills/ship-it/LEARNINGS.md`).

```bash
export PATH="/opt/podman/bin:$PATH"
podman run --rm -v "$PWD":/app -w /app node:24-alpine \
  npm install --package-lock-only --save zod
npm ci
```

Confirm zod moved into `dependencies`:

```bash
node -e "console.log(require('./package.json').dependencies.zod)"
```

Expected: a version string beginning with `^4`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/prisma.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getPrismaClient', () => {
  it('imports without throwing when DATABASE_URL is unset', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(import('@/lib/prisma')).resolves.toHaveProperty('getPrismaClient');
  });

  it('throws when called without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getPrismaClient } = await import('@/lib/prisma');

    expect(() => getPrismaClient()).toThrow('DATABASE_URL is not set');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/prisma.test.ts`
Expected: FAIL — the import itself throws `DATABASE_URL is not set`, because the current module reads the env var at top level.

- [ ] **Step 4: Rewrite `src/lib/prisma.ts`**

```ts
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let cachedClient: PrismaClient | undefined;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  return new PrismaClient({
    adapter: new PrismaMssql(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

/**
 * Returns the shared Prisma client, creating it on first use.
 * The connection string is read here rather than at module scope so that
 * `next build` and `docker build`, which run without secrets, can import
 * modules that depend on the database.
 */
export function getPrismaClient(): PrismaClient {
  cachedClient ??= globalForPrisma.prisma ?? createClient();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = cachedClient;
  }

  return cachedClient;
}
```

The production path memoizes in the module-level `cachedClient`; the `globalThis` handoff exists only to survive dev-server hot reloads, matching the previous behavior.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/prisma.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify nothing else imported the old export**

Run: `grep -rn "from '@/lib/prisma'" src test prisma --include=*.ts --include=*.tsx`
Expected: only `src/lib/prisma.test.ts`. `prisma/seed.ts` and `test/db/seed.test.ts` construct their own clients and must be left alone.

- [ ] **Step 7: Run the gate and commit**

```bash
npm run lint && npm test && npm run build
git add package.json package-lock.json src/lib/prisma.ts src/lib/prisma.test.ts
git commit -m "refactor(db): make the Prisma client lazy; add zod dependency"
```

---

### Task 2: Pure RSVP policy

Every rule that does not need a database. These tests are the ones that actually run in CI.

**Files:**
- Create: `src/lib/rsvp/policy.ts`
- Test: `src/lib/rsvp/policy.test.ts`

**Interfaces:**
- Consumes: `GUEST_SOURCE` from `@/lib/enums`.
- Produces, all from `@/lib/rsvp/policy`:
  - `normalizeName(value: string): string`
  - `nameSplitCandidates(query: string): NameCandidate[]` where `NameCandidate = { firstName: string; lastName: string }`
  - `isRsvpOpen(deadline: Date, now: Date): boolean`
  - `isPartyId(value: string): boolean`
  - `diffGuestIds(existingIds: readonly string[], submittedIds: readonly string[]): GuestSetDiff` where `GuestSetDiff = { matches: boolean; missing: string[]; unknown: string[]; duplicated: string[] }`
  - `checkAddGuestAllowance(cap: number, existingAddedCount: number, requestedCount: number): AddGuestAllowance` where `AddGuestAllowance = { cap: number; used: number; remaining: number; allowed: boolean }`
  - `countAddedGuests(guests: readonly { source: string }[]): number`
  - `toPartySnapshot(message: string | null, guests: readonly SnapshotGuest[]): PartySnapshot` where `SnapshotGuest = { id: string; firstName: string; lastName: string; rsvpStatus: string; songRequest: string | null }` and `PartySnapshot = { message: string | null; guests: SnapshotGuest[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rsvp/policy.test.ts`:

```ts
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
    expect(nameSplitCandidates('  john   smith ')).toEqual([{ firstName: 'john', lastName: 'smith' }]);
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
    expect(checkAddGuestAllowance(5, 1, 2)).toEqual({ cap: 5, used: 1, remaining: 4, allowed: true });
  });

  it('allows a request exactly at the cap', () => {
    expect(checkAddGuestAllowance(5, 3, 2).allowed).toBe(true);
  });

  it('rejects a request over the cap', () => {
    expect(checkAddGuestAllowance(5, 4, 2).allowed).toBe(false);
  });

  it('clamps remaining at zero when the cap was lowered below current usage', () => {
    expect(checkAddGuestAllowance(2, 5, 0)).toEqual({ cap: 2, used: 5, remaining: 0, allowed: true });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rsvp/policy.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/policy`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rsvp/policy.ts`:

```ts
import { GUEST_SOURCE } from '@/lib/enums';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NameCandidate {
  firstName: string;
  lastName: string;
}

export interface GuestSetDiff {
  matches: boolean;
  missing: string[];
  unknown: string[];
  duplicated: string[];
}

export interface AddGuestAllowance {
  cap: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

export interface SnapshotGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
}

export interface PartySnapshot {
  message: string | null;
  guests: SnapshotGuest[];
}

/** Trims a name and collapses runs of internal whitespace to single spaces. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Splits a full name at every internal space, yielding each possible
 * first-name/last-name pairing. Multi-part surnames resolve without the caller
 * having to guess where the surname begins.
 */
export function nameSplitCandidates(query: string): NameCandidate[] {
  const tokens = normalizeName(query).split(' ').filter(Boolean);

  if (tokens.length < 2) {
    return [];
  }

  return tokens.slice(1).map((_, index) => ({
    firstName: tokens.slice(0, index + 1).join(' '),
    lastName: tokens.slice(index + 1).join(' '),
  }));
}

/** True while `now` is strictly before the deadline. */
export function isRsvpOpen(deadline: Date, now: Date): boolean {
  return now.getTime() < deadline.getTime();
}

/** True when the value is a canonical UUID, the only shape a party id can take. */
export function isPartyId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Compares the guest ids a submission declares against the ids the party
 * actually owns. A submission must name every current guest exactly once.
 */
export function diffGuestIds(
  existingIds: readonly string[],
  submittedIds: readonly string[],
): GuestSetDiff {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  const unknown: string[] = [];

  for (const id of submittedIds) {
    if (seen.has(id)) {
      duplicated.add(id);
      continue;
    }

    seen.add(id);

    if (!existing.has(id)) {
      unknown.push(id);
    }
  }

  const missing = existingIds.filter((id) => !seen.has(id));

  return {
    matches: missing.length === 0 && unknown.length === 0 && duplicated.size === 0,
    missing,
    unknown,
    duplicated: [...duplicated],
  };
}

/** Counts the guests a party added itself, the only ones the cap governs. */
export function countAddedGuests(guests: readonly { source: string }[]): number {
  return guests.filter((guest) => guest.source === GUEST_SOURCE.guestAdded).length;
}

/**
 * Resolves how many guests a party may still add. `remaining` clamps at zero:
 * an admin can lower a cap below a party's current additions, which blocks
 * further additions rather than producing a negative allowance.
 */
export function checkAddGuestAllowance(
  cap: number,
  existingAddedCount: number,
  requestedCount: number,
): AddGuestAllowance {
  const remaining = Math.max(0, cap - existingAddedCount);

  return { cap, used: existingAddedCount, remaining, allowed: requestedCount <= remaining };
}

/**
 * Reduces a party to the fields the change log records, ordered by guest id so
 * a before/after pair diffs cleanly.
 */
export function toPartySnapshot(
  message: string | null,
  guests: readonly SnapshotGuest[],
): PartySnapshot {
  return {
    message,
    guests: [...guests]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, firstName, lastName, rsvpStatus, songRequest }) => ({
        id,
        firstName,
        lastName,
        rsvpStatus,
        songRequest,
      })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rsvp/policy.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/lib/rsvp/policy.ts src/lib/rsvp/policy.test.ts
git commit -m "feat(rsvp): add pure RSVP policy functions"
```

---

### Task 3: Request schemas

**Files:**
- Create: `src/lib/rsvp/schemas.ts`
- Test: `src/lib/rsvp/schemas.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `@/lib/rsvp/policy`; `RSVP_STATUS` from `@/lib/enums`.
- Produces, from `@/lib/rsvp/schemas`:
  - `searchQuerySchema` — a zod schema parsing `string` → normalized `string`
  - `submitRsvpSchema` — a zod schema producing `SubmitRsvpInput`
  - `type SubmitRsvpInput = { message: string | null; guests: { id: string; rsvpStatus: 'attending' | 'declined'; songRequest: string | null }[]; newGuests: { firstName: string; lastName: string; rsvpStatus: 'attending' | 'declined'; songRequest: string | null }[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rsvp/schemas.test.ts`:

```ts
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
        { firstName: '   ', lastName: 'Rivera', rsvpStatus: RSVP_STATUS.attending, songRequest: null },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rsvp/schemas.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/schemas`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rsvp/schemas.ts`:

```ts
import { z } from 'zod';
import { RSVP_STATUS } from '@/lib/enums';
import { normalizeName } from '@/lib/rsvp/policy';

const SUBMITTABLE_STATUSES = [RSVP_STATUS.attending, RSVP_STATUS.declined] as const;

const submittableStatus = z.enum(SUBMITTABLE_STATUSES);

function optionalText(maxLength: number) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || value.length <= maxLength, {
      message: `Must be ${maxLength} characters or fewer`,
    });
}

const requiredName = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 1 && value.length <= 100, {
    message: 'Must be between 1 and 100 characters',
  });

/** Parses the `q` search parameter into a normalized full name. */
export const searchQuerySchema = z
  .string()
  .transform(normalizeName)
  .refine((value) => value.length >= 2, { message: 'Enter at least 2 characters' })
  .refine((value) => value.includes(' '), { message: 'Enter a first and last name' });

/** Parses the full declarative party state a guest submits. */
export const submitRsvpSchema = z.object({
  message: optionalText(1000),
  guests: z
    .array(
      z.object({
        id: z.uuid(),
        rsvpStatus: submittableStatus,
        songRequest: optionalText(200),
      }),
    )
    .min(1),
  newGuests: z
    .array(
      z.object({
        firstName: requiredName,
        lastName: requiredName,
        rsvpStatus: submittableStatus,
        songRequest: optionalText(200),
      }),
    )
    .default([]),
});

export type SubmitRsvpInput = z.infer<typeof submitRsvpSchema>;
```

If the installed zod rejects the top-level `z.uuid()`, use `z.string().uuid()` instead — the rest of the schema is unaffected.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rsvp/schemas.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/lib/rsvp/schemas.ts src/lib/rsvp/schemas.test.ts
git commit -m "feat(rsvp): add request schemas for search and submit"
```

---

### Task 4: Error type and client IP

**Files:**
- Create: `src/lib/rsvp/errors.ts`
- Create: `src/lib/rsvp/clientIp.ts`
- Test: `src/lib/rsvp/errors.test.ts`
- Test: `src/lib/rsvp/clientIp.test.ts`

**Interfaces:**
- Consumes: `z` from `zod`.
- Produces:
  - From `@/lib/rsvp/errors`: `class RsvpError extends Error` with `constructor(status: number, code: RsvpErrorCode, message: string, details?: Record<string, unknown>)` and readonly fields `status`, `code`, `details`; `errorResponse(error: unknown): Response`; `invalidRequest(error: ZodError): RsvpError`; `type RsvpErrorCode = 'invalid_request' | 'rsvp_closed' | 'party_not_found' | 'party_changed' | 'add_guest_cap_exceeded' | 'settings_missing'`
  - From `@/lib/rsvp/clientIp`: `clientIpAddress(request: Request): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rsvp/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RsvpError, errorResponse, invalidRequest } from '@/lib/rsvp/errors';

describe('errorResponse', () => {
  it('renders an RsvpError as its status and code', async () => {
    const response = errorResponse(new RsvpError(404, 'party_not_found', 'Party not found'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Party not found',
      code: 'party_not_found',
    });
  });

  it('merges details into the body', async () => {
    const response = errorResponse(
      new RsvpError(403, 'rsvp_closed', 'RSVPs are closed', { deadline: '2026-09-10T00:00:00.000Z' }),
    );

    await expect(response.json()).resolves.toEqual({
      error: 'RSVPs are closed',
      code: 'rsvp_closed',
      deadline: '2026-09-10T00:00:00.000Z',
    });
  });

  it('rethrows anything that is not an RsvpError so it surfaces as a 500', () => {
    const unexpected = new Error('connection reset');

    expect(() => errorResponse(unexpected)).toThrow(unexpected);
  });
});

describe('invalidRequest', () => {
  it('builds a 400 carrying the first field message', async () => {
    const schema = z.object({ name: z.string().min(3, 'Too short') });
    const parsed = schema.safeParse({ name: 'a' });
    if (parsed.success) throw new Error('expected a parse failure');

    const error = invalidRequest(parsed.error);

    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_request');
    expect(error.message).toBe('Too short');
  });
});
```

Create `src/lib/rsvp/clientIp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clientIpAddress } from '@/lib/rsvp/clientIp';

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/parties/search', { headers });
}

describe('clientIpAddress', () => {
  it('prefers the Cloudflare header', () => {
    const request = requestWithHeaders({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    });

    expect(clientIpAddress(request)).toBe('203.0.113.7');
  });

  it('falls back to the first forwarded-for entry', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' });

    expect(clientIpAddress(request)).toBe('198.51.100.1');
  });

  it('returns null when neither header is present', () => {
    expect(clientIpAddress(requestWithHeaders({}))).toBe(null);
  });

  it('returns null for a blank forwarded-for header', () => {
    expect(clientIpAddress(requestWithHeaders({ 'x-forwarded-for': '  ' }))).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rsvp/errors.test.ts src/lib/rsvp/clientIp.test.ts`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Write the implementations**

Create `src/lib/rsvp/errors.ts`:

```ts
import { z, type ZodError } from 'zod';

export type RsvpErrorCode =
  | 'invalid_request'
  | 'rsvp_closed'
  | 'party_not_found'
  | 'party_changed'
  | 'add_guest_cap_exceeded'
  | 'settings_missing';

/** An error carrying the HTTP status and machine-readable code to return. */
export class RsvpError extends Error {
  readonly status: number;
  readonly code: RsvpErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: RsvpErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'RsvpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Renders an `RsvpError` as a JSON response. Anything else is rethrown rather
 * than masked, so an unexpected failure surfaces as a 500 instead of a
 * plausible-looking error body.
 */
export function errorResponse(error: unknown): Response {
  if (!(error instanceof RsvpError)) {
    throw error;
  }

  return Response.json(
    { error: error.message, code: error.code, ...error.details },
    { status: error.status },
  );
}

/** Converts a schema failure into a 400 carrying the first useful message. */
export function invalidRequest(error: ZodError): RsvpError {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const message = formErrors[0] ?? Object.values(fieldErrors).flat()[0] ?? 'Invalid request';

  return new RsvpError(400, 'invalid_request', message, { fieldErrors });
}
```

Create `src/lib/rsvp/clientIp.ts`:

```ts
/**
 * Resolves the caller's address from the proxy headers. Cloudflare fronts the
 * site, so its header is authoritative; the Container App's forwarded-for
 * chain is the fallback and its first entry is the original client.
 */
export function clientIpAddress(request: Request): string | null {
  const cloudflareAddress = request.headers.get('cf-connecting-ip')?.trim();

  if (cloudflareAddress) {
    return cloudflareAddress;
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return forwarded || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rsvp/errors.test.ts src/lib/rsvp/clientIp.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/lib/rsvp/errors.ts src/lib/rsvp/errors.test.ts src/lib/rsvp/clientIp.ts src/lib/rsvp/clientIp.test.ts
git commit -m "feat(rsvp): add typed API errors and client IP resolution"
```

---

### Task 5: Read services — deadline gate, search, party detail

**Files:**
- Create: `src/lib/rsvp/parties.ts`

**Interfaces:**
- Consumes: `getPrismaClient` is *not* used here — the client is a parameter. `PrismaClient` type from `@/generated/prisma/client`; `nameSplitCandidates`, `isPartyId`, `isRsvpOpen`, `countAddedGuests`, `checkAddGuestAllowance` from `@/lib/rsvp/policy`; `RsvpError` from `@/lib/rsvp/errors`.
- Produces, from `@/lib/rsvp/parties`:
  - `requireRsvpOpen(client: PrismaClient, now?: Date): Promise<Date>` — returns the deadline, throws `rsvp_closed` (403) or `settings_missing` (500)
  - `searchParties(client: PrismaClient, query: string): Promise<PartySearchResult[]>` where `PartySearchResult = { id: string; displayName: string; guestFirstNames: string[] }`
  - `getPartyDetail(client: PrismaClient, partyId: string, deadline: Date): Promise<PartyDetail>` where `PartyDetail = { id: string; displayName: string; message: string | null; addGuestCap: number; addedGuestsRemaining: number; rsvpDeadline: string; guests: PartyDetailGuest[] }` and `PartyDetailGuest = { id: string; firstName: string; lastName: string; rsvpStatus: string; songRequest: string | null; source: string }`
  - `GUEST_ORDER` — the shared `orderBy` array, exported so Task 6 reuses it

There is no unit test in this task: every function here is a database query. Its behavior is covered by the integration suite in Task 7, and the rules it applies are already unit-tested in Task 2.

- [ ] **Step 1: Write the implementation**

Create `src/lib/rsvp/parties.ts`:

```ts
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { RsvpError } from '@/lib/rsvp/errors';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  isPartyId,
  isRsvpOpen,
  nameSplitCandidates,
} from '@/lib/rsvp/policy';

export const GUEST_ORDER: Prisma.GuestOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

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

/**
 * Asserts the RSVP window is open and returns the deadline.
 * A missing settings row is a misconfiguration, not an open window, so it
 * fails loudly rather than defaulting either way.
 */
export async function requireRsvpOpen(client: PrismaClient, now: Date = new Date()): Promise<Date> {
  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
  }

  if (!isRsvpOpen(settings.rsvpDeadline, now)) {
    throw new RsvpError(403, 'rsvp_closed', 'RSVPs are closed', {
      deadline: settings.rsvpDeadline.toISOString(),
    });
  }

  return settings.rsvpDeadline;
}

/**
 * Finds parties containing a guest whose full name matches the query exactly.
 * Matching is case-insensitive by virtue of the SQL Server collation; Prisma's
 * `mode: 'insensitive'` is unsupported on this provider.
 */
export async function searchParties(
  client: PrismaClient,
  query: string,
): Promise<PartySearchResult[]> {
  const candidates = nameSplitCandidates(query);

  if (candidates.length === 0) {
    return [];
  }

  const parties = await client.party.findMany({
    where: { guests: { some: { OR: [...candidates] } } },
    include: { guests: { select: { firstName: true }, orderBy: GUEST_ORDER } },
    orderBy: { displayName: 'asc' },
  });

  return parties.map((party) => ({
    id: party.id,
    displayName: party.displayName,
    guestFirstNames: party.guests.map((guest) => guest.firstName),
  }));
}

/** Loads a party and its guests, omitting the admin-only moderation flag. */
export async function getPartyDetail(
  client: PrismaClient,
  partyId: string,
  deadline: Date,
): Promise<PartyDetail> {
  if (!isPartyId(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const party = await client.party.findUnique({
    where: { id: partyId },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  if (!party) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const allowance = checkAddGuestAllowance(party.addGuestCap, countAddedGuests(party.guests), 0);

  return {
    id: party.id,
    displayName: party.displayName,
    message: party.message,
    addGuestCap: party.addGuestCap,
    addedGuestsRemaining: allowance.remaining,
    rsvpDeadline: deadline.toISOString(),
    guests: party.guests.map((guest) => ({
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      rsvpStatus: guest.rsvpStatus,
      songRequest: guest.songRequest,
      source: guest.source,
    })),
  };
}
```

The `isPartyId` guard is load-bearing: SQL Server raises a conversion error rather than returning `null` when a non-UUID is compared against a `UNIQUEIDENTIFIER` column, so an unguarded lookup would surface as a 500 instead of a 404.

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If `Prisma.GuestOrderByWithRelationInput` does not exist under that name in the generated client, check `src/generated/prisma/` for the exported input type and use the generated name.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rsvp/parties.ts
git commit -m "feat(rsvp): add party search and detail services"
```

---

### Task 6: Transactional submit

**Files:**
- Modify: `src/lib/rsvp/parties.ts` (append)

**Interfaces:**
- Consumes: everything Task 5 produced, plus `SubmitRsvpInput` from `@/lib/rsvp/schemas`, `diffGuestIds`, `toPartySnapshot` from `@/lib/rsvp/policy`, and `ACTOR_TYPE`, `AUDIT_ACTION`, `GUEST_SOURCE` from `@/lib/enums`.
- Produces: `submitRsvp(client: PrismaClient, partyId: string, input: SubmitRsvpInput, ipAddress: string | null, now?: Date): Promise<PartyDetail>`

- [ ] **Step 1: Add the imports**

Extend the existing import block at the top of `src/lib/rsvp/parties.ts`:

```ts
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE } from '@/lib/enums';
import type { SubmitRsvpInput } from '@/lib/rsvp/schemas';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  diffGuestIds,
  isPartyId,
  isRsvpOpen,
  nameSplitCandidates,
  toPartySnapshot,
} from '@/lib/rsvp/policy';
```

- [ ] **Step 2: Append the implementation**

```ts
/**
 * Applies a party's full declarative RSVP state in one transaction: message,
 * per-guest status and song request, and any added guests, plus the audit
 * rows. Rejecting the submission for any reason leaves the database untouched.
 */
export async function submitRsvp(
  client: PrismaClient,
  partyId: string,
  input: SubmitRsvpInput,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<PartyDetail> {
  if (!isPartyId(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const deadline = await requireRsvpOpen(client, now);

  return client.$transaction(async (tx) => {
    const party = await tx.party.findUnique({
      where: { id: partyId },
      include: { guests: { orderBy: GUEST_ORDER } },
    });

    if (!party) {
      throw new RsvpError(404, 'party_not_found', 'Party not found');
    }

    const guestDiff = diffGuestIds(
      party.guests.map((guest) => guest.id),
      input.guests.map((guest) => guest.id),
    );

    if (!guestDiff.matches) {
      throw new RsvpError(
        409,
        'party_changed',
        'This party has changed since you loaded it. Reload and try again.',
        {
          missing: guestDiff.missing,
          unknown: guestDiff.unknown,
          duplicated: guestDiff.duplicated,
        },
      );
    }

    const allowance = checkAddGuestAllowance(
      party.addGuestCap,
      countAddedGuests(party.guests),
      input.newGuests.length,
    );

    if (!allowance.allowed) {
      throw new RsvpError(
        409,
        'add_guest_cap_exceeded',
        `This party can add at most ${allowance.cap} guests.`,
        { cap: allowance.cap, remaining: allowance.remaining },
      );
    }

    const before = toPartySnapshot(party.message, party.guests);

    await tx.party.update({ where: { id: partyId }, data: { message: input.message } });

    for (const guest of input.guests) {
      await tx.guest.update({
        where: { id: guest.id },
        data: { rsvpStatus: guest.rsvpStatus, songRequest: guest.songRequest },
      });
    }

    const addedGuestIds: string[] = [];

    for (const newGuest of input.newGuests) {
      const created = await tx.guest.create({
        data: {
          partyId,
          firstName: newGuest.firstName,
          lastName: newGuest.lastName,
          rsvpStatus: newGuest.rsvpStatus,
          songRequest: newGuest.songRequest,
          source: GUEST_SOURCE.guestAdded,
          flaggedForReview: true,
        },
      });

      addedGuestIds.push(created.id);
    }

    const guestsAfter = await tx.guest.findMany({ where: { partyId }, orderBy: GUEST_ORDER });
    const after = toPartySnapshot(input.message, guestsAfter);

    await tx.auditEntry.create({
      data: {
        partyId,
        action: AUDIT_ACTION.rsvpSubmitted,
        actorType: ACTOR_TYPE.guest,
        before: JSON.stringify(before),
        after: JSON.stringify(after),
        ipAddress,
      },
    });

    for (const guestId of addedGuestIds) {
      const added = guestsAfter.find((guest) => guest.id === guestId);

      await tx.auditEntry.create({
        data: {
          partyId,
          guestId,
          action: AUDIT_ACTION.guestAdded,
          actorType: ACTOR_TYPE.guest,
          after: JSON.stringify(
            added
              ? {
                  id: added.id,
                  firstName: added.firstName,
                  lastName: added.lastName,
                  rsvpStatus: added.rsvpStatus,
                  songRequest: added.songRequest,
                }
              : { id: guestId },
          ),
          ipAddress,
        },
      });
    }

    const updatedAllowance = checkAddGuestAllowance(
      party.addGuestCap,
      countAddedGuests(guestsAfter),
      0,
    );

    return {
      id: party.id,
      displayName: party.displayName,
      message: input.message,
      addGuestCap: party.addGuestCap,
      addedGuestsRemaining: updatedAllowance.remaining,
      rsvpDeadline: deadline.toISOString(),
      guests: guestsAfter.map((guest) => ({
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        rsvpStatus: guest.rsvpStatus,
        songRequest: guest.songRequest,
        source: guest.source,
      })),
    };
  });
}
```

Throwing inside the `$transaction` callback rolls the transaction back, which is what makes a rejected submit leave no partial write and no audit row.

- [ ] **Step 3: Verify it typechecks and lints**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rsvp/parties.ts
git commit -m "feat(rsvp): add transactional RSVP submit with audit trail"
```

---

### Task 7: Route handlers

**Files:**
- Create: `src/app/api/parties/search/route.ts`
- Create: `src/app/api/parties/[id]/route.ts`
- Create: `src/app/api/parties/[id]/rsvp/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5, 6.
- Produces: the three HTTP endpoints. Nothing imports these.

In Next.js 16, a dynamic segment arrives as `context: { params: Promise<{ id: string }> }` and must be awaited.

- [ ] **Step 1: Create the search route**

`src/app/api/parties/search/route.ts`:

```ts
import { getPrismaClient } from '@/lib/prisma';
import { errorResponse, invalidRequest } from '@/lib/rsvp/errors';
import { requireRsvpOpen, searchParties } from '@/lib/rsvp/parties';
import { searchQuerySchema } from '@/lib/rsvp/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams.get('q') ?? '';
    const parsed = searchQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    const client = getPrismaClient();
    await requireRsvpOpen(client);

    return Response.json({ parties: await searchParties(client, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Create the party detail route**

`src/app/api/parties/[id]/route.ts`:

```ts
import { getPrismaClient } from '@/lib/prisma';
import { errorResponse } from '@/lib/rsvp/errors';
import { getPartyDetail, requireRsvpOpen } from '@/lib/rsvp/parties';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const client = getPrismaClient();
    const deadline = await requireRsvpOpen(client);

    return Response.json(await getPartyDetail(client, id, deadline));
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 3: Create the submit route**

`src/app/api/parties/[id]/rsvp/route.ts`:

```ts
import { clientIpAddress } from '@/lib/rsvp/clientIp';
import { getPrismaClient } from '@/lib/prisma';
import { errorResponse, invalidRequest } from '@/lib/rsvp/errors';
import { submitRsvp } from '@/lib/rsvp/parties';
import { submitRsvpSchema } from '@/lib/rsvp/schemas';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const parsed = submitRsvpSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    const detail = await submitRsvp(
      getPrismaClient(),
      id,
      parsed.data,
      clientIpAddress(request),
    );

    return Response.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
```

A malformed JSON body makes `request.json()` throw a `SyntaxError`, which `errorResponse` rethrows — Next returns a 500. That is acceptable for a client sending invalid JSON to a JSON API; it is not a case the wizard can reach.

- [ ] **Step 4: Verify the build sees three new routes**

Run: `npm run lint && npm run build 2>&1 | grep -A 20 "Route (app)"`
Expected: the route table lists `/api/parties/search`, `/api/parties/[id]`, and `/api/parties/[id]/rsvp`, each marked dynamic (`ƒ`). The build must succeed **without** `DATABASE_URL` set — that is the proof Task 1's lazy client works.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/parties
git commit -m "feat(rsvp): add guest API route handlers"
```

---

### Task 8: Database integration tests

These run locally against SQL Server and skip in CI, matching `test/db/seed.test.ts`.

**Files:**
- Create: `test/db/parties.test.ts`

**Interfaces:**
- Consumes: `seedDatabase` from `../../prisma/seed-data`; the services from `@/lib/rsvp/parties`.
- Produces: nothing.

- [ ] **Step 1: Start the local database**

```bash
export PATH="/opt/podman/bin:$PATH"
podman machine start || true
podman compose -f docker-compose.dev.yml up -d
```

Confirm host port 14330 is the wedding database and not the other local SQL Server (see `LEARNINGS.md`). Then apply migrations and confirm `DATABASE_URL` is set in `.env`:

```bash
npm run db:migrate:deploy
```

- [ ] **Step 2: Write the tests**

Create `test/db/parties.test.ts`:

```ts
import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import {
  getPartyDetail,
  requireRsvpOpen,
  searchParties,
  submitRsvp,
} from '@/lib/rsvp/parties';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('guest API services', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const beforeDeadline = new Date('2026-08-01T00:00:00Z');
  const afterDeadline = new Date('2026-10-01T00:00:00Z');

  async function smithParty() {
    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Smith Family' },
      include: { guests: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    return party;
  }

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('searchParties', () => {
    it('finds a party by exact full name', async () => {
      const results = await searchParties(prisma, 'John Smith');

      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe('The Smith Family');
      expect(results[0].guestFirstNames).toContain('John');
    });

    it('matches case-insensitively via the database collation', async () => {
      const results = await searchParties(prisma, 'jOhN sMiTh');

      expect(results).toHaveLength(1);
    });

    it('returns nothing for a partial name', async () => {
      expect(await searchParties(prisma, 'Joh Smith')).toEqual([]);
    });

    it('returns nothing for an unknown name', async () => {
      expect(await searchParties(prisma, 'Nobody Here')).toEqual([]);
    });
  });

  describe('getPartyDetail', () => {
    it('returns guests without the moderation flag', async () => {
      const party = await smithParty();

      const detail = await getPartyDetail(prisma, party.id, beforeDeadline);

      expect(detail.guests.length).toBe(party.guests.length);
      expect(detail.guests[0]).not.toHaveProperty('flaggedForReview');
    });

    it('rejects a malformed id as not found rather than erroring', async () => {
      await expect(getPartyDetail(prisma, 'not-a-uuid', beforeDeadline)).rejects.toMatchObject({
        status: 404,
        code: 'party_not_found',
      });
    });

    it('rejects an unknown id as not found', async () => {
      await expect(
        getPartyDetail(prisma, '3f9a1b2c-4d5e-4f60-8a1b-2c3d4e5f6071', beforeDeadline),
      ).rejects.toBeInstanceOf(RsvpError);
    });
  });

  describe('requireRsvpOpen', () => {
    it('returns the deadline while the window is open', async () => {
      await expect(requireRsvpOpen(prisma, beforeDeadline)).resolves.toBeInstanceOf(Date);
    });

    it('throws 403 once the deadline has passed', async () => {
      await expect(requireRsvpOpen(prisma, afterDeadline)).rejects.toMatchObject({
        status: 403,
        code: 'rsvp_closed',
      });
    });

    it('throws 500 when the settings row is missing', async () => {
      await prisma.settings.deleteMany();

      await expect(requireRsvpOpen(prisma, beforeDeadline)).rejects.toMatchObject({
        status: 500,
        code: 'settings_missing',
      });
    });
  });

  describe('submitRsvp', () => {
    it('applies statuses, songs, message and added guests in one call', async () => {
      const party = await smithParty();

      const detail = await submitRsvp(
        prisma,
        party.id,
        {
          message: 'See you there',
          guests: party.guests.map((guest) => ({
            id: guest.id,
            rsvpStatus: RSVP_STATUS.declined,
            songRequest: 'Dancing Queen',
          })),
          newGuests: [
            {
              firstName: 'Sam',
              lastName: 'Rivera',
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            },
          ],
        },
        '203.0.113.7',
        beforeDeadline,
      );

      expect(detail.message).toBe('See you there');
      expect(detail.guests).toHaveLength(party.guests.length + 1);

      const added = detail.guests.find((guest) => guest.firstName === 'Sam');
      expect(added?.source).toBe(GUEST_SOURCE.guestAdded);

      const persisted = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Sam' } });
      expect(persisted.flaggedForReview).toBe(true);
    });

    it('writes one submit entry plus one entry per added guest', async () => {
      const party = await smithParty();

      await submitRsvp(
        prisma,
        party.id,
        {
          message: null,
          guests: party.guests.map((guest) => ({
            id: guest.id,
            rsvpStatus: RSVP_STATUS.attending,
            songRequest: null,
          })),
          newGuests: [
            {
              firstName: 'Sam',
              lastName: 'Rivera',
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            },
          ],
        },
        '203.0.113.7',
        beforeDeadline,
      );

      const entries = await prisma.auditEntry.findMany({ where: { partyId: party.id } });

      expect(entries.filter((entry) => entry.action === AUDIT_ACTION.rsvpSubmitted)).toHaveLength(1);
      expect(entries.filter((entry) => entry.action === AUDIT_ACTION.guestAdded)).toHaveLength(1);
      expect(entries.every((entry) => entry.ipAddress === '203.0.113.7')).toBe(true);
    });

    it('rejects a submission whose guest set is stale', async () => {
      const party = await smithParty();

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: null,
            guests: [
              {
                id: party.guests[0].id,
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
            ],
            newGuests: [],
          },
          null,
          beforeDeadline,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'party_changed' });
    });

    it('rolls back entirely when the add-guest cap is exceeded', async () => {
      const party = await smithParty();
      await prisma.party.update({ where: { id: party.id }, data: { addGuestCap: 1 } });

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: 'should not persist',
            guests: party.guests.map((guest) => ({
              id: guest.id,
              rsvpStatus: RSVP_STATUS.declined,
              songRequest: null,
            })),
            newGuests: [
              {
                firstName: 'Sam',
                lastName: 'Rivera',
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
              {
                firstName: 'Robin',
                lastName: 'Rivera',
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
            ],
          },
          null,
          beforeDeadline,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'add_guest_cap_exceeded' });

      const untouched = await prisma.party.findUniqueOrThrow({ where: { id: party.id } });
      expect(untouched.message).not.toBe('should not persist');
      expect(await prisma.guest.count({ where: { partyId: party.id } })).toBe(party.guests.length);
      expect(await prisma.auditEntry.count({ where: { partyId: party.id } })).toBe(0);
    });

    it('refuses to write once the deadline has passed', async () => {
      const party = await smithParty();

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: null,
            guests: party.guests.map((guest) => ({
              id: guest.id,
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            })),
            newGuests: [],
          },
          null,
          afterDeadline,
        ),
      ).rejects.toMatchObject({ status: 403, code: 'rsvp_closed' });
    });
  });
});
```

- [ ] **Step 3: Run the integration tests**

Run: `npx vitest run test/db/parties.test.ts`
Expected: PASS, 15 tests. If they skip, `DATABASE_URL` is not set in `.env`.

- [ ] **Step 4: Run the full suite and commit**

```bash
npm run lint && npm run check:images && npm test && npm run build
git add test/db/parties.test.ts
git commit -m "test(rsvp): add database integration tests for the guest API"
```

---

### Task 9: Document the API surface

**Files:**
- Modify: `AGENTS.md` (add a section after "Admin auth")

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the section**

Insert after the "Admin auth" section in `AGENTS.md`, before "## Conventions":

```markdown
### RSVP guest API

`/api/parties/*` is the public, unauthenticated guest surface: `GET /search?q=`
(exact full-name lookup), `GET /:id`, and `PATCH /:id/rsvp` (transactional
submit). It is deliberately **not** matched by `src/proxy.ts` — only `/admin/*`
and `/api/admin/*` are gated.

Logic is split so the rules are testable without a database:
`src/lib/rsvp/policy.ts` holds pure functions (name splitting, deadline check,
guest-set reconciliation, add-guest cap) whose tests run in CI;
`src/lib/rsvp/parties.ts` owns the queries and the submit transaction and takes
the Prisma client as an explicit argument, so the integration suite can pass its
own. Route handlers only parse, call, and map `RsvpError` to a status via
`errorResponse`. Errors always render as `{ error, code }`.

All three endpoints return **403 `rsvp_closed`** once `Settings.rsvpDeadline`
has passed — reads included. This supersedes the epic's "then read-only".

`src/lib/prisma.ts` exports `getPrismaClient()`, not a client instance:
`DATABASE_URL` is read inside the function so `next build` and `docker build`,
which have no secrets, can import route handlers. Never move it back to module
scope.

Prisma's `mode: 'insensitive'` is PostgreSQL/MongoDB-only and errors on
`sqlserver`. Case-insensitive matching comes from the database collation.

Design: `docs/superpowers/specs/2026-07-26-rsvp-guest-api-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document the RSVP guest API surface"
```

---

## Definition of done

- `npm run lint && npm run check:images && npm test && npm run build` green, with output shown.
- `npx vitest run test/db/parties.test.ts` green against local SQL Server, with output shown — these do not run in CI.
- `podman build -t czw:ci .` green. Redirect to a file and check `$?`; piping to `tail` discards the exit code.
- `npm run build` succeeds with `DATABASE_URL` unset.
- Follow-up issues filed: rate-limiting the public RSVP endpoints, and a note on #67 that the post-deadline state is a closed page, not a read-only wizard.
