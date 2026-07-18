# RSVP Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the RSVP feature's Prisma data layer — schema (Party, Guest, AuditEntry, Settings), initial migration with CHECK constraints, and a seed script — developed against a local SQL Server 2022 container.

**Architecture:** Prisma 7 with the `@prisma/adapter-mssql` driver adapter against SQL Server (local container for dev, Azure SQL in prod). Enums are modeled as `String` columns whose allowed values live in TS const objects (`src/lib/enums.ts`) and are enforced at the DB by CHECK constraints on the closed sets. No app routes consume the client yet, so the existing site build is functionally unchanged.

**Tech Stack:** Prisma 7 (`prisma-client` generator), `@prisma/adapter-mssql`, `mssql`, SQL Server 2022 (Docker), Next.js 16, TypeScript strict, Vitest.

## Global Constraints

- Node `>=24`, npm `>=11` (package.json `engines`); Docker base `node:24-alpine`.
- SQL Server connector: **no `enum` type** (P1012) and **no `Json` scalar** — model as `String` / `NVarChar(Max)`.
- All PKs are UUIDv4: `String @id @default(uuid(4)) @db.UniqueIdentifier`.
- Enum allowed-value source of truth = `src/lib/enums.ts` const objects.
- CHECK constraints on the **closed** sets only (`rsvpStatus`, `source`, `actorType`, `Settings.id`); **no** CHECK on `AuditEntry.action` (vocabulary grows across later issues).
- Generated client output = `src/generated/prisma` (gitignored, regenerated via `postinstall`).
- Local DB image: `mcr.microsoft.com/mssql/server:2022-latest`, `platform: linux/amd64`, host port `14330` (2025 crashes under Apple Silicon Rosetta with an AVX assertion; prod is evergreen Azure SQL so 2022 locally is equivalent).
- Never commit a real `.env`; only `.env.example`.
- Verification gate: `npm run lint && npm run build && npm run check:images` (+ `npm test`, + `docker build` since CI runs both).

---

### Task 1: Dependencies, ignores, and env scaffolding

**Files:**
- Modify: `package.json` (dependencies, devDependencies, scripts)
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Create: `.env.example`

**Interfaces:**
- Produces: npm scripts `db:up/db:down/db:migrate/db:seed/db:reset/db:studio`, `postinstall`; the `DATABASE_URL` env contract.

- [ ] **Step 1: Add dependencies**

Run (in worktree root):
```bash
npm install @prisma/client @prisma/adapter-mssql mssql
npm install -D prisma dotenv tsx @types/mssql
```
Expected: installs succeed; `package.json` gains the deps.

- [ ] **Step 2: Verify the lockfile did not prune cross-platform optional deps**

Run:
```bash
grep -c '@emnapi' package-lock.json
npm ci --dry-run
```
Expected: `@emnapi` count is unchanged from before (still present) and `npm ci --dry-run` reports no errors. If `@emnapi/*` entries were pruned, restore them surgically before continuing (known gotcha on this Mac that breaks CI's Linux `npm ci`).

- [ ] **Step 3: Add npm scripts**

Add to `package.json` `scripts`:
```json
"postinstall": "prisma generate",
"db:up": "docker compose -f docker-compose.dev.yml up -d",
"db:down": "docker compose -f docker-compose.dev.yml down",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset --force",
"db:studio": "prisma studio"
```

- [ ] **Step 4: Fix `.gitignore` (real `.env` is currently NOT ignored) and ignore the generated client**

Add to `.gitignore` (the existing `env`/`env.local` lines lack leading dots and do not match `.env`):
```gitignore
# Local env files (DATABASE_URL etc.)
.env
.env.*
!.env.example

# Prisma generated client
/src/generated
```

- [ ] **Step 5: Ignore the generated client in ESLint**

In `eslint.config.mjs`, add `"src/generated/**"` to the `globalIgnores([...])` array.

- [ ] **Step 6: Create `.env.example`**

```dotenv
# SQL Server connection for local dev (matches docker-compose.dev.yml).
# Copy to .env and adjust as needed. SA password must meet SQL Server complexity rules.
DATABASE_URL="sqlserver://localhost:14330;database=rsvp;user=sa;password=Local_Dev_Pass123;encrypt=true;trustServerCertificate=true"
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore eslint.config.mjs .env.example
git commit -m "chore: add Prisma 7 + mssql deps, db scripts, env/ignore scaffolding (#62)"
```

---

### Task 2: Enum const objects

**Files:**
- Create: `src/lib/enums.ts`

**Interfaces:**
- Produces: `RSVP_STATUS`, `GUEST_SOURCE`, `ACTOR_TYPE`, `AUDIT_ACTION` const objects and the `RsvpStatus`, `GuestSource`, `ActorType`, `AuditAction` types. Values consumed by schema defaults, CHECK constraints, seed, and tests.

- [ ] **Step 1: Write `src/lib/enums.ts`**

```typescript
export const RSVP_STATUS = {
  pending: 'pending',
  attending: 'attending',
  declined: 'declined',
} as const;
export type RsvpStatus = (typeof RSVP_STATUS)[keyof typeof RSVP_STATUS];

export const GUEST_SOURCE = {
  admin: 'admin',
  guestAdded: 'guest_added',
} as const;
export type GuestSource = (typeof GUEST_SOURCE)[keyof typeof GUEST_SOURCE];

export const ACTOR_TYPE = {
  guest: 'guest',
  admin: 'admin',
} as const;
export type ActorType = (typeof ACTOR_TYPE)[keyof typeof ACTOR_TYPE];

export const AUDIT_ACTION = {
  partyCreated: 'party_created',
  partyUpdated: 'party_updated',
  guestCreated: 'guest_created',
  guestUpdated: 'guest_updated',
  guestDeleted: 'guest_deleted',
  rsvpSubmitted: 'rsvp_submitted',
  guestAdded: 'guest_added',
  guestModerated: 'guest_moderated',
  settingsUpdated: 'settings_updated',
  import: 'import',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (0 exit).

- [ ] **Step 3: Commit**

```bash
git add src/lib/enums.ts
git commit -m "feat: RSVP enum const objects and unions (#62)"
```

---

### Task 3: Prisma schema and config

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma.config.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`.
- Produces: models `Party`, `Guest`, `AuditEntry`, `Settings`; generated client at `src/generated/prisma` (import `PrismaClient` from `@/generated/prisma/client`, relative `../src/generated/prisma/client` from `prisma/`).

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlserver"
}

model Party {
  id           String       @id @default(uuid(4)) @db.UniqueIdentifier
  displayName  String
  message      String?
  addGuestCap  Int          @default(5)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  guests       Guest[]
  auditEntries AuditEntry[]
}

model Guest {
  id               String       @id @default(uuid(4)) @db.UniqueIdentifier
  partyId          String       @db.UniqueIdentifier
  party            Party        @relation(fields: [partyId], references: [id], onDelete: Cascade)
  firstName        String
  lastName         String
  rsvpStatus       String       @default("pending")
  songRequest      String?
  source           String       @default("admin")
  flaggedForReview Boolean      @default(false)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  auditEntries     AuditEntry[]
}

model AuditEntry {
  id         String   @id @default(uuid(4)) @db.UniqueIdentifier
  partyId    String   @db.UniqueIdentifier
  party      Party    @relation(fields: [partyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  guestId    String?  @db.UniqueIdentifier
  guest      Guest?   @relation(fields: [guestId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  action     String
  actorType  String
  actorEmail String?
  before     String?  @db.NVarChar(Max)
  after      String?  @db.NVarChar(Max)
  ipAddress  String?
  createdAt  DateTime @default(now())
}

model Settings {
  id                 Int      @id @default(1)
  rsvpDeadline       DateTime
  defaultAddGuestCap Int      @default(5)
}
```

Note: `AuditEntry` relations use `NoAction` to avoid SQL Server's "multiple cascade paths" error (Party→Guest already cascades) and to preserve the audit trail.

- [ ] **Step 2: Write `prisma.config.ts`**

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀". If it reports an enum/Json error, a `String` mapping was missed — fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma.config.ts
git commit -m "feat: Prisma schema (Party/Guest/AuditEntry/Settings) + config (#62)"
```

---

### Task 4: Local SQL Server 2025 container

**Files:**
- Create: `docker-compose.dev.yml`

**Interfaces:**
- Produces: a SQL Server 2022 instance on `localhost:14330`, SA password `Local_Dev_Pass123`, matching `.env.example`.

- [ ] **Step 1: Write `docker-compose.dev.yml`**

```yaml
services:
  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    platform: linux/amd64
    container_name: czw-rsvp-db
    environment:
      ACCEPT_EULA: 'Y'
      MSSQL_SA_PASSWORD: 'Local_Dev_Pass123'
      MSSQL_PID: 'Developer'
    ports:
      - '14330:1433'
    volumes:
      - czw-rsvp-db-data:/var/opt/mssql
    healthcheck:
      test: ['CMD-SHELL', '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" || exit 1']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

volumes:
  czw-rsvp-db-data:
```

- [ ] **Step 2: Start the container and wait for health**

Run:
```bash
cp .env.example .env
npm run db:up
until [ "$(docker inspect -f '{{.State.Health.Status}}' czw-rsvp-db)" = "healthy" ]; do sleep 3; done; echo READY
```
Expected: prints `READY` (container reports healthy). SQL Server 2022 runs under amd64 Rosetta emulation on Apple Silicon; 2025 is avoided because it crashes there with an AVX assertion.

- [ ] **Step 3: Ensure the `rsvp` database exists** (Prisma migrate creates it if permitted; this is the explicit fallback)

Run:
```bash
docker exec czw-rsvp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Local_Dev_Pass123' -C -Q "IF DB_ID('rsvp') IS NULL CREATE DATABASE rsvp;"
```
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.dev.yml
git commit -m "feat: local SQL Server 2025 dev container (#62)"
```

---

### Task 5: Initial migration with CHECK constraints

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql`
- Create: `prisma/migrations/migration_lock.toml`
- Create (generated): `src/generated/prisma/**` (gitignored)

**Interfaces:**
- Consumes: schema (Task 3), running DB (Task 4), `src/lib/enums.ts` values (Task 2).
- Produces: applied schema + generated typed client.

- [ ] **Step 1: Generate the migration WITHOUT applying it**

Run: `npx prisma migrate dev --name init --create-only`
Expected: creates `prisma/migrations/<ts>_init/migration.sql` with `CREATE TABLE` statements; does not apply.

- [ ] **Step 2: Append CHECK constraints to the generated `migration.sql`**

Append these lines to the end of the generated `migration.sql` (use the actual table names Prisma emitted; default is `[dbo].[Guest]` etc.):
```sql
ALTER TABLE [dbo].[Guest] ADD CONSTRAINT [CK_Guest_rsvpStatus] CHECK ([rsvpStatus] IN (N'pending', N'attending', N'declined'));
ALTER TABLE [dbo].[Guest] ADD CONSTRAINT [CK_Guest_source] CHECK ([source] IN (N'admin', N'guest_added'));
ALTER TABLE [dbo].[AuditEntry] ADD CONSTRAINT [CK_AuditEntry_actorType] CHECK ([actorType] IN (N'guest', N'admin'));
ALTER TABLE [dbo].[Settings] ADD CONSTRAINT [CK_Settings_singleton] CHECK ([id] = 1);
```

- [ ] **Step 3: Apply the migration and generate the client**

Run: `npx prisma migrate dev`
Expected: "Database schema is up to date"; migration applied; `src/generated/prisma` (re)generated. Note the exact import path Prisma prints for the client and use it in Tasks 6–8 (expected `@/generated/prisma/client`).

- [ ] **Step 4: Sanity-check the CHECK constraint rejects bad data**

Run:
```bash
docker exec czw-rsvp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Local_Dev_Pass123' -C -d rsvp -Q "INSERT INTO [dbo].[Party] (id, displayName, addGuestCap, createdAt, updatedAt) VALUES (NEWID(), 'x', 5, GETDATE(), GETDATE());"
docker exec czw-rsvp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Local_Dev_Pass123' -C -d rsvp -Q "INSERT INTO [dbo].[Guest] (id, partyId, firstName, lastName, rsvpStatus, source, flaggedForReview, createdAt, updatedAt) SELECT NEWID(), id, 'a','b','BOGUS','admin',0,GETDATE(),GETDATE() FROM [dbo].[Party];"
```
Expected: the second insert FAILS with a CHECK constraint violation on `CK_Guest_rsvpStatus`. Then reset: `npm run db:reset`.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat: initial RSVP migration with CHECK constraints (#62)"
```

---

### Task 6: Prisma client singleton

**Files:**
- Create: `src/lib/prisma.ts`

**Interfaces:**
- Consumes: generated client (`@/generated/prisma/client`), `@prisma/adapter-mssql`, `DATABASE_URL`.
- Produces: `prisma` singleton for future API routes. (Not imported by any route in this issue.)

- [ ] **Step 1: Write `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaMssql(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If the client import path differs from what Prisma printed in Task 5 Step 3, correct the import.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prisma.ts
git commit -m "feat: Prisma client singleton with mssql adapter (#62)"
```

---

### Task 7: Seed script

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: generated client, `@prisma/adapter-mssql`, `src/lib/enums.ts` (relative import), `DATABASE_URL` (via `dotenv/config`).
- Produces: sample data — 3 parties with guests, one flagged `guest_added` guest, a singleton `Settings` row.

- [ ] **Step 1: Write `prisma/seed.ts`**

```typescript
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS, GUEST_SOURCE } from '../src/lib/enums';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaMssql(connectionString) });

async function main() {
  await prisma.auditEntry.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.party.deleteMany();
  await prisma.settings.deleteMany();

  await prisma.settings.create({
    data: {
      id: 1,
      rsvpDeadline: new Date('2026-09-10T00:00:00Z'),
      defaultAddGuestCap: 5,
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'The Smith Family',
      guests: {
        create: [
          { firstName: 'John', lastName: 'Smith', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin },
          { firstName: 'Jane', lastName: 'Smith', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin, songRequest: 'September — Earth, Wind & Fire' },
        ],
      },
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'Alex Rivera & Guest',
      message: 'So excited to celebrate with you!',
      guests: {
        create: [
          { firstName: 'Alex', lastName: 'Rivera', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin },
          { firstName: 'Sam', lastName: 'Rivera', rsvpStatus: RSVP_STATUS.pending, source: GUEST_SOURCE.guestAdded, flaggedForReview: true },
        ],
      },
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'The Chen Family',
      guests: {
        create: [
          { firstName: 'Wei', lastName: 'Chen', rsvpStatus: RSVP_STATUS.declined, source: GUEST_SOURCE.admin },
        ],
      },
    },
  });

  console.log('Seed complete: 3 parties, 5 guests, 1 settings row.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:migrate && npm run db:seed`
Expected: prints "Seed complete: 3 parties, 5 guests, 1 settings row."

- [ ] **Step 3: Verify visually (optional)**

Run: `npm run db:studio` and confirm rows, or query via sqlcmd. Then continue.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: RSVP seed script with sample parties/guests (#62)"
```

---

### Task 8: Seed integration test (skipped in CI)

**Files:**
- Create: `test/db/seed.test.ts`

**Interfaces:**
- Consumes: generated client, `@prisma/adapter-mssql`, `src/lib/enums.ts`, `DATABASE_URL` (via `dotenv/config`).
- Behavior: `describe.skipIf(!DATABASE_URL)` — runs locally against the seeded DB, skips in CI. Builds its own client (never imports the throwing singleton at module top).

- [ ] **Step 1: Write `test/db/seed.test.ts`**

```typescript
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS, GUEST_SOURCE } from '@/lib/enums';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('seeded database', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('has parties with nested guests', async () => {
    const parties = await prisma.party.findMany({ include: { guests: true } });
    expect(parties.length).toBeGreaterThan(0);
    expect(parties.some((party) => party.guests.length > 0)).toBe(true);
  });

  it('stores only known enum values for guests', async () => {
    const guests = await prisma.guest.findMany();
    const statuses = Object.values(RSVP_STATUS) as string[];
    const sources = Object.values(GUEST_SOURCE) as string[];
    for (const guest of guests) {
      expect(statuses).toContain(guest.rsvpStatus);
      expect(sources).toContain(guest.source);
    }
  });

  it('has exactly one singleton settings row', async () => {
    const settings = await prisma.settings.findMany();
    expect(settings).toHaveLength(1);
    expect(settings[0].id).toBe(1);
  });
});
```

- [ ] **Step 2: Run locally (DB seeded) — expect PASS**

Run: `npm test`
Expected: the `seeded database` suite runs and all 3 tests PASS (DATABASE_URL present from `.env`).

- [ ] **Step 3: Confirm it SKIPS without a DB URL (simulating CI)**

Run: `DATABASE_URL= npx vitest run test/db/seed.test.ts`
Expected: the suite is reported as skipped, exit 0, no connection attempt.

- [ ] **Step 4: Commit**

```bash
git add test/db/seed.test.ts
git commit -m "test: seed integration suite, skipped when no DATABASE_URL (#62)"
```

---

### Task 9: Docker build compatibility + full gate

**Files:**
- Modify: `Dockerfile` (deps stage copies `prisma/`; builder stage generates the client)

**Interfaces:**
- Produces: a green `npm run lint && npm run build && npm run check:images`, `npm test`, and `docker build` — matching CI.

- [ ] **Step 1: Make the Dockerfile Prisma-aware**

In `Dockerfile`, in the `deps` stage, add a copy of the schema BEFORE `npm ci` so the `postinstall: prisma generate` succeeds:
```dockerfile
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
COPY prisma ./prisma
```
In the `builder` stage, regenerate the client from full source before building (the generated client is gitignored and not carried from `deps`):
```dockerfile
COPY . .
RUN npx prisma generate
```

- [ ] **Step 2: Run the full local gate**

Run:
```bash
npm run lint && npm run build && npm run check:images
```
Expected: all pass, exit 0. (Build regenerates/uses the client via `postinstall`.)

- [ ] **Step 3: Run the test suite (DB up + seeded)**

Run: `npm test`
Expected: seed suite passes; existing suites unaffected.

- [ ] **Step 4: Verify the Docker build (CI parity)**

Run: `docker build -t czw:issue62 .`
Expected: build succeeds through all stages (deps postinstall generate, builder generate + `next build`, runner). This proves the CI `docker build` step will pass.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "build: make Docker image Prisma-aware (generate in deps/builder) (#62)"
```

---

## Self-Review

**Spec coverage:**
- Prisma set up against SQL Server + local container → Tasks 3, 4. ✓
- Models Party/Guest/AuditEntry/Settings with UUID PKs → Task 3. ✓
- Enums (rsvpStatus, source, audit action/actorType) → Task 2 (const unions) + Task 5 (CHECK constraints); `action` intentionally CHECK-free per spec. ✓
- Initial migration + seed → Tasks 5, 7. ✓
- Acceptance (migrate dev creates schema; seed runs; typed client generated) → Tasks 5, 7 + gate in Task 9. ✓
- Prisma 7 driver adapter, `prisma.config.ts`, generator output → Tasks 1, 3, 6. ✓
- JSON-as-NVarChar(Max) → Task 3. ✓
- Test (skipIf) → Task 8. ✓
- CI safety (postinstall, Docker, lockfile emnapi) → Tasks 1, 9. ✓

**Placeholder scan:** none — every code/SQL/command step is concrete.

**Type consistency:** `PrismaClient` imported from `@/generated/prisma/client` (Tasks 6, 8) / `../src/generated/prisma/client` (Task 7); enum const names `RSVP_STATUS`/`GUEST_SOURCE`/`ACTOR_TYPE`/`AUDIT_ACTION` consistent across Tasks 2, 5, 7, 8; `PrismaMssql` from `@prisma/adapter-mssql` consistent. ✓
