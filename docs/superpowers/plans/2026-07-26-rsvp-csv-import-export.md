# CSV Import/Export API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/import` (bulk-create parties + guests from CSV with a row-level error report) and `GET /api/admin/export` (CSV of every guest and their live RSVP state).

**Architecture:** Follows the split established by the guest API (#64): pure rule modules that take already-parsed data and are unit-tested with no database, service modules that take an explicit Prisma client and own the queries and transaction, and thin route handlers that only authenticate, parse, call, and map errors. Import is strictly create-only and all-or-nothing.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript strict, Zod 4, Prisma 7 + `@prisma/adapter-mssql`, `csv-parse` / `csv-stringify` (sync APIs), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-rsvp-csv-import-export-design.md`

## Global Constraints

- Path alias `@/` → `src/`. Never use deep relative imports across `src/`.
- Service functions take `client: PrismaClient` as their **first argument**; never import a module-scope client. `src/lib/prisma.ts` exports `getPrismaClient()`, called only inside route handlers.
- Errors always render as `{ error, code, ...details }` via `errorResponse`. Only `RsvpError` is rendered; anything else rethrows to become a 500.
- Import **only ever creates**. It must never update or delete an existing `Party` or `Guest`.
- Import is all-or-nothing: if any row error exists, **zero** rows are written.
- Every created guest is forced to `rsvpStatus = 'pending'`, `source = 'admin'`, `flaggedForReview = false`, regardless of file contents.
- Unknown CSV columns are ignored on import. Required columns: `partyDisplayName`, `firstName`, `lastName`.
- Party grouping key is `normalizeName(partyDisplayName).toLowerCase()` — matching the database's case-insensitive `SQL_Latin1_General_CP1_CI_AS` collation.
- Admin routes are **not** gated on `Settings.rsvpDeadline`.
- Audit action is `AUDIT_ACTION.import` (`'import'`), `actorType = ACTOR_TYPE.admin`.
- Limits: body ≤ 1 MB (1_048_576 bytes), ≤ 2000 data rows. Both → `413` `csv_too_large`.
- `addGuestCap` range is 0–20 inclusive. Blank inherits `Settings.defaultAddGuestCap`.
- Length limits: names 1–100 chars, `message` ≤ 1000 chars.
- New DB test files go under `test/db/` or they will race the serialized `db` vitest project.
- Verification gate mirrors CI: `npm run lint && npm run check:images && npm test && npm run build`.

---

### Task 1: Add CSV dependencies and pin `csv-parse` line-number semantics

The reported error line number is load-bearing for the whole feature, and `csv-parse`'s `info.lines` is documented only as "lines read up to that record". For a quoted field spanning multiple physical lines that is the record's **end** line, not its start. This task establishes the real behavior with a characterization test so later tasks build on a fact rather than an assumption.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: `src/lib/rsvp/csvParseBehavior.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `csv-parse` and `csv-stringify` available as production dependencies; a documented, test-pinned meaning for `info.lines`.

- [ ] **Step 1: Add the dependencies inside the Linux node image**

`npm install` on macOS prunes cross-platform optional dependencies from the lockfile and breaks CI's `npm ci`. Generate the lockfile entry in the same OS/arch CI uses, then install from it.

```bash
export PATH="/opt/podman/bin:$PATH"
podman run --rm -v "$PWD":/app -w /app node:24-alpine \
  npm install --package-lock-only csv-parse csv-stringify
npm ci
```

- [ ] **Step 2: Verify the lockfile is still CI-valid**

Run: `npm ci --dry-run 2>&1 | tail -5`
Expected: no `npm error`; the run completes and reports a package count.

- [ ] **Step 3: Write the characterization test**

```typescript
// src/lib/rsvp/csvParseBehavior.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import type { Info } from 'csv-parse';

type Parsed = { record: Record<string, string>; info: Info };

function parseWithInfo(text: string): Parsed[] {
  return parse(text, {
    bom: true,
    info: true,
    columns: true,
    skip_empty_lines: true,
  }) as unknown as Parsed[];
}

describe('csv-parse info.lines', () => {
  it('numbers the first data row 2 when a header is consumed', () => {
    const parsed = parseWithInfo('a,b\n1,2\n3,4\n');

    expect(parsed.map(({ info }) => info.lines)).toEqual([2, 3]);
  });

  it('reports the end line of a record containing a quoted newline', () => {
    const parsed = parseWithInfo('a,b\n"multi\nline",2\n3,4\n');

    expect(parsed[0].record.a).toBe('multi\nline');
    expect(parsed.map(({ info }) => info.lines)).toEqual([3, 4]);
  });

  it('strips a leading UTF-8 BOM from the first column name', () => {
    const parsed = parseWithInfo('﻿a,b\n1,2\n');

    expect(Object.keys(parsed[0].record)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/rsvp/csvParseBehavior.test.ts`
Expected: PASS. **If the `lines` values differ from `[2, 3]` / `[3, 4]`, update the expectations to the observed values and note the real semantics in the test's describe block — do not change the implementation approach.** Later tasks pass `info.lines` through unchanged, so only these expectations depend on the exact numbering.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/rsvp/csvParseBehavior.test.ts
git commit -m "build: add csv-parse and csv-stringify, pin line-number semantics"
```

---

### Task 2: Import row schema and column constants

**Files:**
- Create: `src/lib/rsvp/csvSchemas.ts`
- Test: `src/lib/rsvp/csvSchemas.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `@/lib/rsvp/policy`.
- Produces:
  - `REQUIRED_IMPORT_COLUMNS: readonly ['partyDisplayName', 'firstName', 'lastName']`
  - `EXPORT_COLUMNS: readonly string[]` (11 names, order fixed)
  - `MAX_ADD_GUEST_CAP = 20`, `MAX_IMPORT_ROWS = 2000`, `MAX_IMPORT_BYTES = 1_048_576`
  - `importRowSchema` — Zod object
  - `type ImportRow = { partyDisplayName: string; firstName: string; lastName: string; message: string | null; addGuestCap: number | null }`
  - `interface RowError { line: number; reason: string }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/rsvp/csvSchemas.test.ts
import { describe, expect, it } from 'vitest';
import { importRowSchema } from '@/lib/rsvp/csvSchemas';

function parseRow(row: Record<string, string>) {
  return importRowSchema.safeParse(row);
}

const validRow = {
  partyDisplayName: 'The Smith Family',
  firstName: 'John',
  lastName: 'Smith',
};

describe('importRowSchema', () => {
  it('normalizes whitespace in names', () => {
    const result = parseRow({
      partyDisplayName: '  The   Smith  Family ',
      firstName: ' John ',
      lastName: '  Smith',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      partyDisplayName: 'The Smith Family',
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('defaults absent optional columns to null', () => {
    const result = parseRow(validRow);

    expect(result.data).toMatchObject({ message: null, addGuestCap: null });
  });

  it('treats a blank message as null', () => {
    const result = parseRow({ ...validRow, message: '   ' });

    expect(result.data?.message).toBeNull();
  });

  it('rejects a blank required name', () => {
    const result = parseRow({ ...validRow, firstName: '  ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('firstName is required');
  });

  it('rejects a name longer than 100 characters', () => {
    const result = parseRow({ ...validRow, lastName: 'x'.repeat(101) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('100 characters or fewer');
  });

  it('rejects a message longer than 1000 characters', () => {
    const result = parseRow({ ...validRow, message: 'x'.repeat(1001) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('1000 characters or fewer');
  });

  it('coerces a numeric addGuestCap', () => {
    const result = parseRow({ ...validRow, addGuestCap: ' 3 ' });

    expect(result.data?.addGuestCap).toBe(3);
  });

  it('accepts a zero addGuestCap', () => {
    expect(parseRow({ ...validRow, addGuestCap: '0' }).data?.addGuestCap).toBe(0);
  });

  it.each(['abc', '2.5', '-1', '21'])('rejects addGuestCap %s', (value) => {
    const result = parseRow({ ...validRow, addGuestCap: value });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('between 0 and 20');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rsvp/csvSchemas.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/csvSchemas`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rsvp/csvSchemas.ts
import { z } from 'zod';
import { normalizeName } from '@/lib/rsvp/policy';

export const MAX_ADD_GUEST_CAP = 20;
export const MAX_NAME_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_048_576;

export const REQUIRED_IMPORT_COLUMNS = [
  'partyDisplayName',
  'firstName',
  'lastName',
] as const;

export const EXPORT_COLUMNS = [
  'partyDisplayName',
  'firstName',
  'lastName',
  'message',
  'addGuestCap',
  'rsvpStatus',
  'songRequest',
  'source',
  'flaggedForReview',
  'partyId',
  'guestId',
] as const;

/** A single problem found in the import file, addressed by 1-based file line. */
export interface RowError {
  line: number;
  reason: string;
}

const CAP_MESSAGE = `addGuestCap must be a whole number between 0 and ${MAX_ADD_GUEST_CAP}`;

function requiredName(column: string) {
  return z
    .string()
    .default('')
    .transform(normalizeName)
    .refine((value) => value.length > 0, { message: `${column} is required` })
    .refine((value) => value.length <= MAX_NAME_LENGTH, {
      message: `${column} must be ${MAX_NAME_LENGTH} characters or fewer`,
    });
}

const optionalMessage = z
  .string()
  .default('')
  .transform((value) => value.trim())
  .refine((value) => value.length <= MAX_MESSAGE_LENGTH, {
    message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
  })
  .transform((value) => (value.length > 0 ? value : null));

const optionalAddGuestCap = z
  .string()
  .default('')
  .transform((value) => value.trim())
  .refine((value) => value === '' || /^\d+$/.test(value), { message: CAP_MESSAGE })
  .refine((value) => value === '' || Number(value) <= MAX_ADD_GUEST_CAP, {
    message: CAP_MESSAGE,
  })
  .transform((value) => (value === '' ? null : Number(value)));

/** Parses one CSV row. Unknown columns are dropped rather than rejected. */
export const importRowSchema = z.object({
  partyDisplayName: requiredName('partyDisplayName'),
  firstName: requiredName('firstName'),
  lastName: requiredName('lastName'),
  message: optionalMessage,
  addGuestCap: optionalAddGuestCap,
});

export type ImportRow = z.infer<typeof importRowSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rsvp/csvSchemas.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rsvp/csvSchemas.ts src/lib/rsvp/csvSchemas.test.ts
git commit -m "feat(rsvp): add CSV import row schema and column constants"
```

---

### Task 3: Pure CSV parsing, grouping, and validation

The heart of the feature. Takes raw file text, returns either grouped parties or an exhaustive, line-numbered error list. No database, no I/O.

**Files:**
- Create: `src/lib/rsvp/csvImport.ts`
- Test: `src/lib/rsvp/csvImport.test.ts`

**Interfaces:**
- Consumes: `importRowSchema`, `REQUIRED_IMPORT_COLUMNS`, `RowError`, `ImportRow` from `@/lib/rsvp/csvSchemas`; `normalizeName` from `@/lib/rsvp/policy`.
- Produces:
  ```typescript
  interface ImportGuest { firstName: string; lastName: string }
  interface ImportParty {
    key: string;             // lowercased normalized display name
    displayName: string;     // as written on the party's first row
    line: number;            // first line the party appears on
    message: string | null;
    addGuestCap: number | null;   // null = inherit Settings.defaultAddGuestCap
    guests: ImportGuest[];
  }
  type ImportParseResult =
    | { ok: true; recordCount: number; parties: ImportParty[] }
    | { ok: false; recordCount: number; rowErrors: RowError[] };

  function parseImportCsv(text: string): ImportParseResult
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/rsvp/csvImport.test.ts
import { describe, expect, it } from 'vitest';
import { parseImportCsv } from '@/lib/rsvp/csvImport';

const HEADER = 'partyDisplayName,firstName,lastName,message,addGuestCap';

function errorsOf(text: string) {
  const result = parseImportCsv(text);
  if (result.ok) throw new Error('expected parse to fail');
  return result.rowErrors;
}

function partiesOf(text: string) {
  const result = parseImportCsv(text);
  if (!result.ok) throw new Error(`expected parse to succeed: ${JSON.stringify(result.rowErrors)}`);
  return result.parties;
}

describe('parseImportCsv', () => {
  it('groups rows sharing a display name into one party', () => {
    const parties = partiesOf(
      `${HEADER}\nThe Smith Family,John,Smith,,5\nThe Smith Family,Jane,Smith,,5\n`,
    );

    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ displayName: 'The Smith Family', addGuestCap: 5, line: 2 });
    expect(parties[0].guests).toEqual([
      { firstName: 'John', lastName: 'Smith' },
      { firstName: 'Jane', lastName: 'Smith' },
    ]);
  });

  it('groups non-contiguous rows of the same party', () => {
    const parties = partiesOf(
      `${HEADER}\nSmiths,John,Smith,,\nRivera,Alex,Rivera,,\nSmiths,Jane,Smith,,\n`,
    );

    expect(parties).toHaveLength(2);
    expect(parties.find((party) => party.displayName === 'Smiths')?.guests).toHaveLength(2);
  });

  it('groups case-insensitively and keeps the first spelling', () => {
    const parties = partiesOf(`${HEADER}\nThe Smiths,John,Smith,,\nTHE SMITHS,Jane,Smith,,\n`);

    expect(parties).toHaveLength(1);
    expect(parties[0].displayName).toBe('The Smiths');
  });

  it('lets a blank party-level value inherit a specified one', () => {
    const parties = partiesOf(`${HEADER}\nSmiths,John,Smith,Hi!,3\nSmiths,Jane,Smith,,\n`);

    expect(parties[0]).toMatchObject({ message: 'Hi!', addGuestCap: 3 });
  });

  it('leaves an entirely blank addGuestCap null for the caller to default', () => {
    expect(partiesOf(`${HEADER}\nSmiths,John,Smith,,\n`)[0].addGuestCap).toBeNull();
  });

  it('preserves a quoted comma, quote, and newline in a message', () => {
    const parties = partiesOf(
      `${HEADER}\nSmiths,John,Smith,"He said ""hi"", then\nleft",\n`,
    );

    expect(parties[0].message).toBe('He said "hi", then\nleft');
  });

  it('ignores unknown columns so an export can be re-imported', () => {
    const parties = partiesOf(
      'partyDisplayName,firstName,lastName,rsvpStatus,guestId\n' +
        'Smiths,John,Smith,attending,abc-123\n',
    );

    expect(parties[0].guests).toEqual([{ firstName: 'John', lastName: 'Smith' }]);
  });

  it('reports a missing required column once, without row errors', () => {
    const errors = errorsOf('partyDisplayName,firstName\nSmiths,John\n');

    expect(errors).toEqual([{ line: 1, reason: 'Missing required column: lastName' }]);
  });

  it('reports an empty file', () => {
    expect(errorsOf('   ')).toEqual([{ line: 1, reason: 'The file is empty' }]);
  });

  it('reports a header with no data rows', () => {
    expect(errorsOf(`${HEADER}\n`)).toEqual([{ line: 1, reason: 'The file has no data rows' }]);
  });

  it('collects every bad row rather than stopping at the first', () => {
    const errors = errorsOf(
      `${HEADER}\nSmiths,,Smith,,\nSmiths,Jane,Smith,,99\nSmiths,Bob,,,\n`,
    );

    expect(errors).toHaveLength(3);
    expect(errors.map((error) => error.line)).toEqual([2, 3, 4]);
  });

  it('reports a duplicate guest within a party, case- and whitespace-insensitively', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,\nSmiths,  john ,SMITH,,\n`);

    expect(errors).toEqual([
      {
        line: 3,
        reason: 'john SMITH appears twice in party "Smiths" (also on line 2)',
      },
    ]);
  });

  it('allows the same guest name in two different parties', () => {
    const parties = partiesOf(`${HEADER}\nSmiths,John,Smith,,\nJoneses,John,Smith,,\n`);

    expect(parties).toHaveLength(2);
  });

  it('reports conflicting party-level values', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,Hello,5\nSmiths,Jane,Smith,Goodbye,5\n`);

    expect(errors).toEqual([
      { line: 3, reason: 'message conflicts with line 2 for party "Smiths"' },
    ]);
  });

  it('reports conflicting addGuestCap values', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,5\nSmiths,Jane,Smith,,2\n`);

    expect(errors).toEqual([
      { line: 3, reason: 'addGuestCap conflicts with line 2 for party "Smiths"' },
    ]);
  });

  it('reports a ragged row as a file-level parse failure', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,5,extra\n`);

    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/column/i);
  });

  it('reports recordCount even when the file is invalid', () => {
    const result = parseImportCsv(`${HEADER}\nSmiths,,Smith,,\nSmiths,Jane,Smith,,\n`);

    expect(result.recordCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rsvp/csvImport.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/csvImport`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rsvp/csvImport.ts
import { parse } from 'csv-parse/sync';
import type { Info } from 'csv-parse';
import {
  REQUIRED_IMPORT_COLUMNS,
  importRowSchema,
  type ImportRow,
  type RowError,
} from '@/lib/rsvp/csvSchemas';
import { normalizeName } from '@/lib/rsvp/policy';

export interface ImportGuest {
  firstName: string;
  lastName: string;
}

export interface ImportParty {
  key: string;
  displayName: string;
  line: number;
  message: string | null;
  addGuestCap: number | null;
  guests: ImportGuest[];
}

export type ImportParseResult =
  | { ok: true; recordCount: number; parties: ImportParty[] }
  | { ok: false; recordCount: number; rowErrors: RowError[] };

interface ParsedRecord {
  record: Record<string, string>;
  info: Info;
}

const HEADER_LINE = 1;

function failure(recordCount: number, rowErrors: RowError[]): ImportParseResult {
  return { ok: false, recordCount, rowErrors };
}

/** Recovers the count csv-parse had reached before it rejected the file. */
function recordCountFrom(error: unknown): number {
  return error instanceof CsvError && typeof error.records === 'number' ? error.records : 0;
}

/**
 * Reads the file into records, capturing the header so a missing required
 * column is reported once rather than as an error on every row.
 */
function readRecords(text: string): { header: string[]; records: ParsedRecord[] } {
  let header: string[] = [];

  const records = parse(text, {
    bom: true,
    info: true,
    skip_empty_lines: true,
    columns: (firstRow: string[]) => {
      header = firstRow;
      return firstRow;
    },
  }) as unknown as ParsedRecord[];

  return { header, records };
}

/** Accumulates one party's rows, recording the line each value first appeared on. */
class PartyAccumulator {
  readonly guests: ImportGuest[] = [];
  readonly errors: RowError[] = [];
  private readonly guestKeys = new Map<string, number>();
  private messageLine: number | null = null;
  private capLine: number | null = null;
  message: string | null = null;
  addGuestCap: number | null = null;

  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly line: number,
  ) {}

  add(row: ImportRow, line: number): void {
    this.addGuest(row, line);
    this.mergeMessage(row, line);
    this.mergeCap(row, line);
  }

  private addGuest(row: ImportRow, line: number): void {
    const guestKey = `${row.firstName} ${row.lastName}`.toLowerCase();
    const firstSeen = this.guestKeys.get(guestKey);

    if (firstSeen !== undefined) {
      this.errors.push({
        line,
        reason: `${row.firstName} ${row.lastName} appears twice in party "${this.displayName}" (also on line ${firstSeen})`,
      });
      return;
    }

    this.guestKeys.set(guestKey, line);
    this.guests.push({ firstName: row.firstName, lastName: row.lastName });
  }

  private mergeMessage(row: ImportRow, line: number): void {
    if (row.message === null) {
      return;
    }

    if (this.messageLine === null) {
      this.message = row.message;
      this.messageLine = line;
      return;
    }

    if (this.message !== row.message) {
      this.errors.push({
        line,
        reason: `message conflicts with line ${this.messageLine} for party "${this.displayName}"`,
      });
    }
  }

  private mergeCap(row: ImportRow, line: number): void {
    if (row.addGuestCap === null) {
      return;
    }

    if (this.capLine === null) {
      this.addGuestCap = row.addGuestCap;
      this.capLine = line;
      return;
    }

    if (this.addGuestCap !== row.addGuestCap) {
      this.errors.push({
        line,
        reason: `addGuestCap conflicts with line ${this.capLine} for party "${this.displayName}"`,
      });
    }
  }

  toParty(): ImportParty {
    return {
      key: this.key,
      displayName: this.displayName,
      line: this.line,
      message: this.message,
      addGuestCap: this.addGuestCap,
      guests: this.guests,
    };
  }
}

/**
 * Parses import CSV text into grouped parties, or into an exhaustive list of
 * line-numbered problems. Never throws for bad input: a malformed file comes
 * back as a `rowErrors` entry so the caller renders one consistent report.
 */
export function parseImportCsv(text: string): ImportParseResult {
  if (text.trim().length === 0) {
    return failure(0, [{ line: HEADER_LINE, reason: 'The file is empty' }]);
  }

  let header: string[];
  let records: ParsedRecord[];

  try {
    ({ header, records } = readRecords(text));
  } catch (error) {
    // `recordCount` must stay truthful on this branch too: Task 5 reads it
    // before it inspects `ok`, so zeroing it here would misreport a file that
    // is both oversized and malformed.
    return failure(recordCountFrom(error), [
      { line: HEADER_LINE, reason: error instanceof Error ? error.message : 'Could not read the file' },
    ]);
  }

  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !header.includes(column));

  if (missing.length > 0) {
    return failure(records.length, [
      { line: HEADER_LINE, reason: `Missing required column: ${missing.join(', ')}` },
    ]);
  }

  if (records.length === 0) {
    return failure(0, [{ line: HEADER_LINE, reason: 'The file has no data rows' }]);
  }

  const rowErrors: RowError[] = [];
  const accumulators = new Map<string, PartyAccumulator>();

  for (const { record, info } of records) {
    const line = info.lines;
    const parsed = importRowSchema.safeParse(record);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ line, reason: issue.message });
      }
      continue;
    }

    const row = parsed.data;
    // Already normalized by the schema's transform; only case remains.
    const key = row.partyDisplayName.toLowerCase();
    let accumulator = accumulators.get(key);

    if (!accumulator) {
      accumulator = new PartyAccumulator(key, row.partyDisplayName, line);
      accumulators.set(key, accumulator);
    }

    accumulator.add(row, line);
  }

  for (const accumulator of accumulators.values()) {
    rowErrors.push(...accumulator.errors);
  }

  if (rowErrors.length > 0) {
    rowErrors.sort((left, right) => left.line - right.line);
    return failure(records.length, rowErrors);
  }

  return {
    ok: true,
    recordCount: records.length,
    parties: [...accumulators.values()].map((accumulator) => accumulator.toParty()),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rsvp/csvImport.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run lint and commit**

```bash
npm run lint
git add src/lib/rsvp/csvImport.ts src/lib/rsvp/csvImport.test.ts
git commit -m "feat(rsvp): parse, group, and validate import CSV"
```

---

### Task 4: Pure export CSV writer

**Files:**
- Create: `src/lib/rsvp/csvExport.ts`
- Test: `src/lib/rsvp/csvExport.test.ts`

**Interfaces:**
- Consumes: `EXPORT_COLUMNS` from `@/lib/rsvp/csvSchemas`.
- Produces:
  ```typescript
  interface ExportRecord {
    partyDisplayName: string;
    firstName: string;
    lastName: string;
    message: string | null;
    addGuestCap: number;
    rsvpStatus: string;
    songRequest: string | null;
    source: string;
    flaggedForReview: boolean;
    partyId: string;
    guestId: string;
  }
  function toExportCsv(records: readonly ExportRecord[]): string
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/rsvp/csvExport.test.ts
import { describe, expect, it } from 'vitest';
import { toExportCsv, type ExportRecord } from '@/lib/rsvp/csvExport';

const BOM = '﻿';

function record(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    partyDisplayName: 'The Smith Family',
    firstName: 'John',
    lastName: 'Smith',
    message: null,
    addGuestCap: 5,
    rsvpStatus: 'attending',
    songRequest: null,
    source: 'admin',
    flaggedForReview: false,
    partyId: 'party-1',
    guestId: 'guest-1',
    ...overrides,
  };
}

function lines(csv: string): string[] {
  return csv.replace(BOM, '').trimEnd().split('\n');
}

describe('toExportCsv', () => {
  it('writes the header even with no records', () => {
    expect(lines(toExportCsv([]))).toEqual([
      'partyDisplayName,firstName,lastName,message,addGuestCap,' +
        'rsvpStatus,songRequest,source,flaggedForReview,partyId,guestId',
    ]);
  });

  it('prefixes a UTF-8 BOM so Excel reads it as UTF-8', () => {
    expect(toExportCsv([]).startsWith(BOM)).toBe(true);
  });

  it('renders null fields as empty', () => {
    const [, row] = lines(toExportCsv([record()]));

    expect(row).toBe('The Smith Family,John,Smith,,5,attending,,admin,false,party-1,guest-1');
  });

  it('renders booleans as true and false, not 1 and empty', () => {
    const [, row] = lines(toExportCsv([record({ flaggedForReview: true })]));

    expect(row).toContain(',true,');
  });

  it('quotes a value containing a comma', () => {
    const csv = toExportCsv([record({ songRequest: 'Smith, John' })]);

    expect(csv).toContain('"Smith, John"');
  });

  it('doubles an embedded quote', () => {
    const csv = toExportCsv([record({ message: 'He said "hi"' })]);

    expect(csv).toContain('"He said ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    const csv = toExportCsv([record({ message: 'line one\nline two' })]);

    expect(csv).toContain('"line one\nline two"');
  });

  it('neutralizes a leading formula character', () => {
    const csv = toExportCsv([record({ songRequest: '=SUM(A1:A9)' })]);

    expect(csv).not.toContain(',=SUM');
    expect(csv).toContain("'=SUM(A1:A9)");
  });

  it('round-trips through the import parser', async () => {
    const { parseImportCsv } = await import('@/lib/rsvp/csvImport');
    const csv = toExportCsv([record({ message: 'He said "hi", then\nleft' })]);
    const result = parseImportCsv(csv);

    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rsvp/csvExport.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/csvExport`.

- [ ] **Step 3: Write the implementation**

`escape_formulas` matters because `songRequest` and `message` are guest-supplied free text that lands in a spreadsheet the caterer opens. Without it, a value beginning `=`, `+`, `-`, or `@` executes as a formula.

```typescript
// src/lib/rsvp/csvExport.ts
import { stringify } from 'csv-stringify/sync';
import { EXPORT_COLUMNS } from '@/lib/rsvp/csvSchemas';

export interface ExportRecord {
  partyDisplayName: string;
  firstName: string;
  lastName: string;
  message: string | null;
  addGuestCap: number;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
  flaggedForReview: boolean;
  partyId: string;
  guestId: string;
}

/**
 * Renders export records as RFC 4180 CSV. Emits a BOM so Excel reads the file
 * as UTF-8, and escapes leading formula characters so guest-supplied text
 * cannot execute when the export is opened in a spreadsheet.
 */
export function toExportCsv(records: readonly ExportRecord[]): string {
  return stringify(records as unknown as Record<string, unknown>[], {
    header: true,
    columns: [...EXPORT_COLUMNS],
    bom: true,
    escape_formulas: true,
    cast: {
      boolean: (value) => (value ? 'true' : 'false'),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rsvp/csvExport.test.ts`
Expected: PASS. If the formula-escape assertion fails, check the actual prefix `csv-stringify` uses and update the expectation to match the library's real output — the requirement is that `=SUM` is not emitted bare.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rsvp/csvExport.ts src/lib/rsvp/csvExport.test.ts
git commit -m "feat(rsvp): render export CSV with BOM and formula escaping"
```

---

### Task 5: Error codes and the import service

**Files:**
- Modify: `src/lib/rsvp/errors.ts`
- Create: `src/lib/rsvp/admin/import.ts`
- Test: `src/lib/rsvp/errors.test.ts` (extend), `test/db/csvImport.test.ts`

**Interfaces:**
- Consumes: `parseImportCsv`, `ImportParty` from `@/lib/rsvp/csvImport`; `MAX_IMPORT_ROWS`, `RowError` from `@/lib/rsvp/csvSchemas`; `GUEST_ORDER` from `@/lib/rsvp/parties`; `toPartySnapshot` from `@/lib/rsvp/policy`; `ACTOR_TYPE`, `AUDIT_ACTION`, `GUEST_SOURCE`, `RSVP_STATUS` from `@/lib/enums`.
- Produces:
  - `RsvpErrorCode` gains `'invalid_csv' | 'csv_too_large'`
  - `invalidCsv(rowErrors: RowError[]): RsvpError`
  - `csvTooLarge(message: string): RsvpError`
  - `interface ImportSummary { partiesCreated: number; guestsCreated: number }`
  - `importParties(client, text, actorEmail, ipAddress): Promise<ImportSummary>`

- [ ] **Step 1: Extend the error module**

Add the two codes to the union and the two constructors. `details` already accepts arbitrary keys, so `rowErrors` needs no new machinery.

```typescript
// src/lib/rsvp/errors.ts — add to the existing union
export type RsvpErrorCode =
  | 'invalid_request'
  | 'invalid_csv'
  | 'csv_too_large'
  | 'rsvp_closed'
  | 'party_not_found'
  | 'party_changed'
  | 'add_guest_cap_exceeded'
  | 'settings_missing';
```

```typescript
// src/lib/rsvp/errors.ts — add at the end, plus the RowError type import
import type { RowError } from '@/lib/rsvp/csvSchemas';

/**
 * Rejects an import, reporting every bad row. The zero counters are always
 * present so a client reads the same two fields on success and on failure.
 */
export function invalidCsv(rowErrors: RowError[]): RsvpError {
  const noun = rowErrors.length === 1 ? 'row' : 'rows';

  return new RsvpError(400, 'invalid_csv', `Import rejected: ${rowErrors.length} invalid ${noun}`, {
    rowErrors,
    partiesCreated: 0,
    guestsCreated: 0,
  });
}

export function csvTooLarge(message: string): RsvpError {
  return new RsvpError(413, 'csv_too_large', message, {
    partiesCreated: 0,
    guestsCreated: 0,
  });
}
```

- [ ] **Step 2: Write the failing error-module test**

Append to `src/lib/rsvp/errors.test.ts`:

```typescript
import { csvTooLarge, invalidCsv } from '@/lib/rsvp/errors';

describe('invalidCsv', () => {
  it('singularizes a single row error', () => {
    expect(invalidCsv([{ line: 2, reason: 'firstName is required' }]).message).toBe(
      'Import rejected: 1 invalid row',
    );
  });

  it('carries every row error and zeroed counters', () => {
    const error = invalidCsv([
      { line: 2, reason: 'a' },
      { line: 3, reason: 'b' },
    ]);

    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_csv');
    expect(error.details).toMatchObject({ partiesCreated: 0, guestsCreated: 0 });
    expect(error.details.rowErrors).toHaveLength(2);
  });
});

describe('csvTooLarge', () => {
  it('is a 413 carrying zeroed counters', () => {
    const error = csvTooLarge('too big');

    expect(error.status).toBe(413);
    expect(error.code).toBe('csv_too_large');
    expect(error.details).toMatchObject({ partiesCreated: 0, guestsCreated: 0 });
  });
});
```

Run: `npx vitest run src/lib/rsvp/errors.test.ts`
Expected: PASS once Step 1's implementation is in place.

- [ ] **Step 3: Write the import service**

The transaction timeout override is deliberate: Prisma's interactive-transaction default is 5 seconds, and 150 parties each cost a create plus an audit insert.

```typescript
// src/lib/rsvp/admin/import.ts
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { parseImportCsv, type ImportParty } from '@/lib/rsvp/csvImport';
import { MAX_IMPORT_ROWS, type RowError } from '@/lib/rsvp/csvSchemas';
import { RsvpError, csvTooLarge, invalidCsv } from '@/lib/rsvp/errors';
import { GUEST_ORDER } from '@/lib/rsvp/parties';
import { toPartySnapshot } from '@/lib/rsvp/policy';

const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export interface ImportSummary {
  partiesCreated: number;
  guestsCreated: number;
}

async function loadDefaultAddGuestCap(client: PrismaClient): Promise<number> {
  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
  }

  return settings.defaultAddGuestCap;
}

/**
 * Finds parties whose display name is already taken. Comparison is
 * case-insensitive by virtue of the database collation, so results are keyed
 * back to the file by lowercased name rather than by exact spelling.
 */
async function findCollisions(
  client: PrismaClient,
  parties: readonly ImportParty[],
): Promise<RowError[]> {
  const existing = await client.party.findMany({
    where: { displayName: { in: parties.map((party) => party.displayName) } },
    select: { displayName: true },
  });

  const taken = new Set(existing.map((party) => party.displayName.toLowerCase()));

  return parties
    .filter((party) => taken.has(party.key))
    .map((party) => ({
      line: party.line,
      reason: `Party "${party.displayName}" already exists`,
    }));
}

async function createParty(
  tx: Prisma.TransactionClient,
  party: ImportParty,
  defaultAddGuestCap: number,
  actorEmail: string,
  ipAddress: string | null,
): Promise<number> {
  const created = await tx.party.create({
    data: {
      displayName: party.displayName,
      message: party.message,
      addGuestCap: party.addGuestCap ?? defaultAddGuestCap,
      guests: {
        create: party.guests.map((guest) => ({
          firstName: guest.firstName,
          lastName: guest.lastName,
          rsvpStatus: RSVP_STATUS.pending,
          source: GUEST_SOURCE.admin,
          flaggedForReview: false,
        })),
      },
    },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  await tx.auditEntry.create({
    data: {
      partyId: created.id,
      action: AUDIT_ACTION.import,
      actorType: ACTOR_TYPE.admin,
      actorEmail,
      after: JSON.stringify(toPartySnapshot(created.message, created.guests)),
      ipAddress,
    },
  });

  return created.guests.length;
}

/**
 * Creates every party in the file, or none of them. Import never updates or
 * deletes: a display name that already exists is reported as a row error, so a
 * party that has already responded can never be overwritten by a re-import.
 */
export async function importParties(
  client: PrismaClient,
  text: string,
  actorEmail: string,
  ipAddress: string | null,
): Promise<ImportSummary> {
  const parsed = parseImportCsv(text);

  if (parsed.recordCount > MAX_IMPORT_ROWS) {
    throw csvTooLarge(
      `The file has ${parsed.recordCount} data rows; the limit is ${MAX_IMPORT_ROWS}`,
    );
  }

  if (!parsed.ok) {
    throw invalidCsv(parsed.rowErrors);
  }

  const defaultAddGuestCap = await loadDefaultAddGuestCap(client);
  const collisions = await findCollisions(client, parsed.parties);

  if (collisions.length > 0) {
    throw invalidCsv(collisions);
  }

  return client.$transaction(async (tx) => {
    let guestsCreated = 0;

    for (const party of parsed.parties) {
      guestsCreated += await createParty(tx, party, defaultAddGuestCap, actorEmail, ipAddress);
    }

    return { partiesCreated: parsed.parties.length, guestsCreated };
  }, TRANSACTION_OPTIONS);
}
```

- [ ] **Step 4: Write the database integration test**

```typescript
// test/db/csvImport.test.ts
import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import { importParties } from '@/lib/rsvp/admin/import';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;
const HEADER = 'partyDisplayName,firstName,lastName,message,addGuestCap';
const ACTOR = 'admin@example.com';

describe.skipIf(!databaseUrl)('importParties', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function importText(text: string) {
    return importParties(prisma, text, ACTOR, '203.0.113.7');
  }

  async function expectRsvpError(text: string): Promise<RsvpError> {
    try {
      await importText(text);
    } catch (error) {
      if (error instanceof RsvpError) return error;
      throw error;
    }
    throw new Error('expected the import to be rejected');
  }

  it('creates parties and guests', async () => {
    const summary = await importText(
      `${HEADER}\nThe Brown Family,Ada,Brown,Congrats!,3\nThe Brown Family,Bob,Brown,,\n`,
    );

    expect(summary).toEqual({ partiesCreated: 1, guestsCreated: 2 });

    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
      include: { guests: true },
    });

    expect(party).toMatchObject({ message: 'Congrats!', addGuestCap: 3 });
    expect(party.guests).toHaveLength(2);
  });

  it('forces created guests into the server-side initial state', async () => {
    await importText(
      'partyDisplayName,firstName,lastName,rsvpStatus,source,flaggedForReview\n' +
        'The Brown Family,Ada,Brown,attending,guest_added,true\n',
    );

    const guest = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Ada' } });

    expect(guest).toMatchObject({
      rsvpStatus: RSVP_STATUS.pending,
      source: GUEST_SOURCE.admin,
      flaggedForReview: false,
    });
  });

  it('inherits the settings default when addGuestCap is blank', async () => {
    await importText(`${HEADER}\nThe Brown Family,Ada,Brown,,\n`);

    const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
    });

    expect(party.addGuestCap).toBe(settings.defaultAddGuestCap);
  });

  it('writes one import audit entry per party with the actor email', async () => {
    await importText(`${HEADER}\nThe Brown Family,Ada,Brown,,\n`);

    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
    });
    const entries = await prisma.auditEntry.findMany({ where: { partyId: party.id } });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: AUDIT_ACTION.import,
      actorType: ACTOR_TYPE.admin,
      actorEmail: ACTOR,
      ipAddress: '203.0.113.7',
      before: null,
    });
    expect(JSON.parse(entries[0].after!).guests).toHaveLength(1);
  });

  it('writes nothing when any row is invalid', async () => {
    const before = await prisma.party.count();

    const error = await expectRsvpError(
      `${HEADER}\nThe Brown Family,Ada,Brown,,\nThe Green Family,,Green,,\n`,
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_csv');
    expect(await prisma.party.count()).toBe(before);
  });

  it('rejects a display name that already exists, case-insensitively', async () => {
    const error = await expectRsvpError(`${HEADER}\nthe smith family,Ada,Brown,,\n`);

    expect(error.code).toBe('invalid_csv');
    expect((error.details.rowErrors as { reason: string }[])[0].reason).toContain('already exists');
  });

  it('writes nothing when one party of several collides', async () => {
    const before = await prisma.party.count();

    await expectRsvpError(
      `${HEADER}\nThe Brown Family,Ada,Brown,,\nThe Smith Family,Zed,Smith,,\n`,
    );

    expect(await prisma.party.count()).toBe(before);
  });

  it('rejects a file over the row limit', async () => {
    const rows = Array.from(
      { length: 2001 },
      (_, index) => `Party ${index},First${index},Last${index},,`,
    ).join('\n');

    const error = await expectRsvpError(`${HEADER}\n${rows}\n`);

    expect(error.status).toBe(413);
    expect(error.code).toBe('csv_too_large');
  });
});
```

- [ ] **Step 5: Run the tests**

```bash
export PATH="/opt/podman/bin:$PATH"
npx vitest run --project db test/db/csvImport.test.ts
```
Expected: PASS. The database must be running (`czw-rsvp-db` on host port 14330) and `DATABASE_URL` set in `.env`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rsvp/errors.ts src/lib/rsvp/errors.test.ts src/lib/rsvp/admin/import.ts test/db/csvImport.test.ts
git commit -m "feat(rsvp): add create-only CSV import service with audit trail"
```

---

### Task 6: Export service

**Files:**
- Create: `src/lib/rsvp/admin/export.ts`
- Test: `test/db/csvExport.test.ts`

**Interfaces:**
- Consumes: `ExportRecord` from `@/lib/rsvp/csvExport`; `GUEST_ORDER` from `@/lib/rsvp/parties`.
- Produces: `loadExportRecords(client: PrismaClient): Promise<ExportRecord[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/db/csvExport.test.ts
import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS } from '@/lib/enums';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('loadExportRecords', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns one record per guest', async () => {
    const records = await loadExportRecords(prisma);

    expect(records).toHaveLength(await prisma.guest.count());
  });

  it('orders by party display name then guest creation', async () => {
    const records = await loadExportRecords(prisma);
    const names = records.map((record) => record.partyDisplayName);

    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });

  it('carries party fields onto every guest row', async () => {
    const records = await loadExportRecords(prisma);
    const smiths = records.filter((record) => record.partyDisplayName === 'The Smith Family');

    expect(smiths.length).toBeGreaterThan(1);
    expect(new Set(smiths.map((record) => record.partyId)).size).toBe(1);
    expect(new Set(smiths.map((record) => record.addGuestCap)).size).toBe(1);
  });

  it('reflects live RSVP state', async () => {
    const guest = await prisma.guest.findFirstOrThrow();
    await prisma.guest.update({
      where: { id: guest.id },
      data: { rsvpStatus: RSVP_STATUS.attending, songRequest: 'Sweet Caroline' },
    });

    const records = await loadExportRecords(prisma);
    const updated = records.find((record) => record.guestId === guest.id);

    expect(updated).toMatchObject({
      rsvpStatus: RSVP_STATUS.attending,
      songRequest: 'Sweet Caroline',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project db test/db/csvExport.test.ts`
Expected: FAIL — cannot resolve `@/lib/rsvp/admin/export`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rsvp/admin/export.ts
import type { PrismaClient } from '@/generated/prisma/client';
import type { ExportRecord } from '@/lib/rsvp/csvExport';
import { GUEST_ORDER } from '@/lib/rsvp/parties';

/**
 * Flattens every party and its guests into one row per guest, carrying the
 * party-level fields onto each row so the export mirrors the import shape.
 */
export async function loadExportRecords(client: PrismaClient): Promise<ExportRecord[]> {
  const parties = await client.party.findMany({
    orderBy: { displayName: 'asc' },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  return parties.flatMap((party) =>
    party.guests.map((guest) => ({
      partyDisplayName: party.displayName,
      firstName: guest.firstName,
      lastName: guest.lastName,
      message: party.message,
      addGuestCap: party.addGuestCap,
      rsvpStatus: guest.rsvpStatus,
      songRequest: guest.songRequest,
      source: guest.source,
      flaggedForReview: guest.flaggedForReview,
      partyId: party.id,
      guestId: guest.id,
    })),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project db test/db/csvExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rsvp/admin/export.ts test/db/csvExport.test.ts
git commit -m "feat(rsvp): add export record query"
```

---

### Task 7: Route handlers

**Files:**
- Create: `src/app/api/admin/import/route.ts`, `src/app/api/admin/export/route.ts`

**Interfaces:**
- Consumes: `requireAdminSession` from `@/lib/auth/session`; `getPrismaClient` from `@/lib/prisma`; `clientIpAddress` from `@/lib/rsvp/clientIp`; `errorResponse`, `csvTooLarge` from `@/lib/rsvp/errors`; `importParties`, `loadExportRecords`, `toExportCsv`; `MAX_IMPORT_BYTES`.
- Produces: `POST /api/admin/import`, `GET /api/admin/export`.

`src/proxy.ts` already gates `/api/admin/:path*`. The handlers call `requireAdminSession()` as well, so the route is not secured by matcher configuration alone and so import gets the session email for the audit trail.

- [ ] **Step 1: Write the import handler**

```typescript
// src/app/api/admin/import/route.ts
import { requireAdminSession } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/prisma';
import { importParties } from '@/lib/rsvp/admin/import';
import { clientIpAddress } from '@/lib/rsvp/clientIp';
import { MAX_IMPORT_BYTES } from '@/lib/rsvp/csvSchemas';
import { csvTooLarge, errorResponse } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

function tooLarge() {
  return csvTooLarge(`The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB limit`);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAdminSession();

    if (!session.authorized) {
      return session.response;
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');

    if (declaredLength > MAX_IMPORT_BYTES) {
      throw tooLarge();
    }

    const text = await request.text();

    // The declared length may be absent or wrong, so the decoded body is
    // re-checked against the same limit.
    if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
      throw tooLarge();
    }

    const summary = await importParties(
      getPrismaClient(),
      text,
      session.email,
      clientIpAddress(request),
    );

    return Response.json(summary, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Write the export handler**

```typescript
// src/app/api/admin/export/route.ts
import { requireAdminSession } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/prisma';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { toExportCsv } from '@/lib/rsvp/csvExport';
import { errorResponse } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

function exportFilename(now: Date): string {
  return `rsvps-${now.toISOString().slice(0, 10)}.csv`;
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireAdminSession();

    if (!session.authorized) {
      return session.response;
    }

    const csv = toExportCsv(await loadExportRecords(getPrismaClient()));

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(new Date())}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 3: Run the full fast gate**

```bash
npm run lint && npm run check:images && npm test && npm run build
```
Expected: all green. `npm run build` is the only step that typechecks — neither lint nor Vitest does, so a wrong type name reaches this step and no earlier.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/import/route.ts src/app/api/admin/export/route.ts
git commit -m "feat(rsvp): add admin CSV import and export routes"
```

---

### Task 8: Round-trip acceptance test and documentation

Proves the issue's stated acceptance criterion end to end and records the surface for the next agent.

**Files:**
- Create: `test/db/csvRoundTrip.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the round-trip test**

```typescript
// test/db/csvRoundTrip.test.ts
import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS } from '@/lib/enums';
import { importParties } from '@/lib/rsvp/admin/import';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { toExportCsv } from '@/lib/rsvp/csvExport';
import { parseImportCsv } from '@/lib/rsvp/csvImport';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

const SAMPLE_CSV = [
  'partyDisplayName,firstName,lastName,message,addGuestCap',
  'The Brown Family,Ada,Brown,"So happy for you, both!",3',
  'The Brown Family,Bob,Brown,,',
  'Cleo Nguyễn,Cleo,Nguyễn,,1',
  '',
].join('\n');

describe.skipIf(!databaseUrl)('CSV round trip', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exports what was imported', async () => {
    const summary = await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    expect(summary).toEqual({ partiesCreated: 2, guestsCreated: 3 });

    const records = await loadExportRecords(prisma);
    const browns = records.filter((record) => record.partyDisplayName === 'The Brown Family');

    expect(browns).toHaveLength(2);
    expect(browns[0]).toMatchObject({
      message: 'So happy for you, both!',
      addGuestCap: 3,
      rsvpStatus: RSVP_STATUS.pending,
    });
    expect(records.some((record) => record.firstName === 'Cleo')).toBe(true);
  });

  it('produces an export that the import parser can read back', async () => {
    await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    const csv = toExportCsv(await loadExportRecords(prisma));
    const reparsed = parseImportCsv(csv);

    expect(reparsed.ok).toBe(true);
  });

  it('reflects a submitted RSVP in the export', async () => {
    await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    const ada = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Ada' } });
    await prisma.guest.update({
      where: { id: ada.id },
      data: { rsvpStatus: RSVP_STATUS.attending, songRequest: 'Sweet Caroline' },
    });

    const records = await loadExportRecords(prisma);

    expect(records.find((record) => record.guestId === ada.id)).toMatchObject({
      rsvpStatus: RSVP_STATUS.attending,
      songRequest: 'Sweet Caroline',
    });
  });

  it('leaves the database untouched when a later row is malformed', async () => {
    const partiesBefore = await prisma.party.count();
    const guestsBefore = await prisma.guest.count();

    await expect(
      importParties(
        prisma,
        `${SAMPLE_CSV}The Green Family,,Green,,\n`,
        'admin@example.com',
        null,
      ),
    ).rejects.toMatchObject({ code: 'invalid_csv' });

    expect(await prisma.party.count()).toBe(partiesBefore);
    expect(await prisma.guest.count()).toBe(guestsBefore);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run --project db test/db/csvRoundTrip.test.ts`
Expected: PASS.

- [ ] **Step 3: Document the surface in `AGENTS.md`**

Add after the existing "RSVP guest API" section:

```markdown
### Admin CSV import/export

`POST /api/admin/import` takes a raw `text/csv` body; `GET /api/admin/export` returns one CSV row per guest. Both sit behind `src/proxy.ts` **and** call `requireAdminSession()` — the matcher is not the only gate, and import needs the session email for the audit trail. Neither is gated on `Settings.rsvpDeadline`: export exists to be run after it.

Import is **create-only and all-or-nothing**. A display name that already exists is a reported row error, so a re-import can never overwrite a party that has responded. Created guests are forced to `pending` / `source=admin` / `flaggedForReview=false` regardless of the file, and unknown columns are ignored — together that makes re-feeding an export harmless.

Rows are grouped by `normalizeName(partyDisplayName).toLowerCase()`, matching the database's case-insensitive collation. `message` and `addGuestCap` are party-level: blank inherits, two different non-blank values conflict.

Error reports carry `{ line, reason }` for **every** bad row. The line number comes from `csv-parse`'s `info.lines`, never from an array index — a quoted field containing a newline spans several file lines and would desynchronize a counter.

Export escapes leading formula characters (`escape_formulas`) because song requests and messages are guest-supplied text that lands in a spreadsheet, and emits a UTF-8 BOM so Excel reads it correctly. `csv-stringify` casts booleans to `1`/`''` by default, so `flaggedForReview` uses an explicit cast.

Design: `docs/superpowers/specs/2026-07-26-rsvp-csv-import-export-design.md`.
```

- [ ] **Step 4: Run the full gate**

```bash
npm run lint && npm run check:images && npm test && npm run build
```
Expected: all green, including both vitest projects.

- [ ] **Step 5: Commit**

```bash
git add test/db/csvRoundTrip.test.ts AGENTS.md
git commit -m "test(rsvp): prove the CSV import/export round trip"
```

---

## Verification beyond the gate

After Task 8, before opening the PR:

1. **Drive the running app** per the `run-wedding-website` skill. Assert the closed gate, not just the happy path — an unauthenticated `POST /api/admin/import` must return **401** and an unauthenticated `GET /api/admin/export` must return **401**, not a redirect and not data. A green test suite does not prove a route is protected.
2. **Authenticated round trip** against the running server: sign in, `POST` a sample CSV, `GET` the export, confirm the imported rows appear and the `Content-Disposition` filename is present.
3. **CI parity:** `podman build -t czw:ci .` once, at the end. Redirect output to a file and check `$?` — piping to `tail` discards the exit code and has previously reported a failed build as a success.
