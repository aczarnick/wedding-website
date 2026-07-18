# RSVP Data Layer — Design (Issue #62)

**Date:** 2026-07-17
**Status:** Approved (design); implementation not started
**Issue:** #62 — Data layer: Prisma schema, migrations, seed (Wave 0)
**Parent:** RSVP epic #60 · high-level spec [`2026-07-17-rsvp-design.md`](./2026-07-17-rsvp-design.md)

## Summary

Stand up the RSVP feature's persistence layer: a Prisma schema (Party, Guest,
AuditEntry, Settings), an initial migration, and a seed script — developed
against a **local SQL Server 2025 container**, targeting **Azure SQL** in
production. This issue delivers schema + tooling only; no API routes or UI (those
are Wave 1+). The existing wedding site is functionally untouched.

This document pins the **Prisma 7-specific** decisions the parent spec predates
(the parent spec said only "ORM: Prisma"). Prisma 7 is a significant shift:
driver adapters replace the bundled query engine, the default generator changed,
and configuration moved to `prisma.config.ts`.

## Decisions locked

| Fork | Decision | Rationale |
|---|---|---|
| Enum representation (SQL Server has no enum type — Prisma `enum` fails validation with P1012 on the `sqlserver` connector) | `String` columns + TS const-object unions in `src/lib/enums.ts` + DB `CHECK` constraints on the closed sets | Single source of truth in TS drives the app types; CHECK constraints make the DB reject bad values too (fail loud at both layers). |
| JSON columns (SQL Server unsupported by Prisma's `Json` scalar) | `before`/`after` stored as `NVARCHAR(MAX)` JSON strings; app serializes/parses | Same class of connector limitation as enums; explicit string is honest about the storage. |
| Local dev DB | SQL Server **2022** — `mcr.microsoft.com/mssql/server:2022-latest`, `platform: linux/amd64`, host port **14330** | 2025 was the original pick, but it crashes on this machine's Podman + applehv Rosetta with an AVX assertion (`ThreadContextSignals.cpp`); the CU1 AVX fix only applies to Docker Desktop's Rosetta, and neither Docker Desktop nor OrbStack is installed here. 2022 runs cleanly under the same Podman/Rosetta. Prod is Azure SQL (evergreen) and the schema uses only provider-level `sqlserver` features, so 2022-vs-2025 makes no functional difference. Host port 14330 (not 1433) avoids colliding with a pre-existing local SQL Server. Azure SQL Edge is retired (2025-09-30) and dropped ARM64, so it is not an option. |
| PK type | UUID **v4** (random), `@default(uuid(4))`, mapped `@db.UniqueIdentifier` | Non-enumerable party ids is the security goal (open name lookup); v7 leaks a sortable timestamp prefix, v4 does not. |
| Prisma runtime | Driver adapter `@prisma/adapter-mssql` (uses the `mssql` driver) + `new PrismaClient({ adapter })` | Prisma 7 removed the bundled query engine; a driver adapter is required for SQL Server. |
| Client generation | `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`, gitignored, regenerated via `postinstall` | Prisma 7's default generator requires an explicit output path and no longer writes into `node_modules/@prisma/client`. |
| Config | `prisma.config.ts` (`defineConfig`) — schema path, migrations path + seed command, datasource url | Prisma 7 moved datasource/CLI config out of `schema.prisma`; `.env` is not auto-loaded, so `dotenv` is imported there. |
| Seed runner | `node --env-file=.env prisma/seed.ts` | Node 24 runs TypeScript natively (type stripping) and loads `.env` natively — no `tsx` dependency. Fall back to `tsx` only if native stripping chokes on the generated-client import. |
| Tests | DB-integration vitest suite wrapped in `describe.skipIf(!process.env.DATABASE_URL)` | The real behavior (migrate applies, seed populates) needs a DB; CI has none, so the suite skips in CI and runs locally. Pure DB-free unit tests over a const map would assert almost nothing. |

## Data model (4 tables)

All PKs are UUIDv4 (`String @id @default(uuid(4)) @db.UniqueIdentifier`).
`createdAt`/`updatedAt` use `@default(now())` / `@updatedAt`.

### Party
`id`, `displayName String`, `message String?` (to the couple),
`addGuestCap Int @default(5)`, `createdAt`, `updatedAt`, `guests Guest[]`,
`auditEntries AuditEntry[]`.

### Guest
`id`, `partyId` (FK → Party, `onDelete: Cascade`), `firstName`, `lastName`,
`rsvpStatus String @default("pending")`, `songRequest String?`,
`source String @default("admin")`, `flaggedForReview Boolean @default(false)`,
`createdAt`, `updatedAt`.

### AuditEntry
`id`, `partyId` (FK → Party), `guestId String?` (nullable — some actions are
party-level), `action String`, `actorType String`, `actorEmail String?`,
`before String?` (`@db.NVarChar(Max)`, JSON), `after String?`
(`@db.NVarChar(Max)`, JSON), `ipAddress String?`, `createdAt`.

### Settings (singleton)
`id Int @id @default(1)` with a `CHECK (id = 1)` constraint,
`rsvpDeadline DateTime`, `defaultAddGuestCap Int @default(5)`.

## Enum modeling (`src/lib/enums.ts`)

Const objects are the single source of truth; the `type` is derived from the
values. CHECK constraints enforce the **closed** sets at the DB.

- `RSVP_STATUS` — `pending | attending | declined` → **CHECK** on `Guest.rsvpStatus`
- `GUEST_SOURCE` — `admin | guest_added` → **CHECK** on `Guest.source`
- `ACTOR_TYPE` — `guest | admin` → **CHECK** on `AuditEntry.actorType`
- `AUDIT_ACTION` — starter set: `party_created`, `party_updated`, `guest_created`,
  `guest_updated`, `guest_deleted`, `rsvp_submitted`, `guest_added`,
  `guest_moderated`, `settings_updated`, `import`. **No DB CHECK** — the audit
  vocabulary grows across the API issues (#64/#65); a CHECK would force a
  migration per new verb. Enforced by the TS union only.

## Migration workflow (how CHECK constraints land)

Prisma migrate does not model CHECK constraints, so they are appended by hand to
the generated SQL:

1. `npx prisma migrate dev --create-only --name init` — generate the migration
   without applying it.
2. Append `ALTER TABLE [Guest] ADD CONSTRAINT CK_Guest_rsvpStatus CHECK (...)`
   (and the source/actorType/Settings-id constraints) to the generated
   `migration.sql`.
3. `npx prisma migrate dev` — apply.
4. `npx prisma generate` — emit the typed client.

## Local dev ergonomics

- **`docker-compose.dev.yml`** (separate from the prod `docker-compose.yml`):
  `mcr.microsoft.com/mssql/server:2022-latest`, `platform: linux/amd64`,
  `ACCEPT_EULA=Y`, `MSSQL_SA_PASSWORD`, port `14330:1433`, a named volume for
  persistence, and a healthcheck.
- **npm scripts:** `db:up`, `db:down`, `db:migrate` (`prisma migrate dev`),
  `db:seed` (`prisma db seed`), `db:reset` (`prisma migrate reset`),
  `db:studio` (`prisma studio`).
- **`.env.example`** documents `DATABASE_URL`
  (`sqlserver://localhost:14330;database=rsvp;user=sa;password=...;encrypt=true;trustServerCertificate=true`).
  Confirm the real `.env` is gitignored; never commit a connection string.

## Client singleton (`src/lib/prisma.ts`)

`globalThis`-cached singleton (Next.js HMR-safe) constructing
`new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL) })`,
importing `PrismaClient` from the generated output `@/generated/prisma`.

## CI safety (no database in CI)

- `postinstall: prisma generate` so the gitignored client exists for
  lint/build/typecheck (generation needs no DB connection).
- Re-verify the lockfile's `@emnapi/*` cross-platform optional deps survive after
  adding dependencies (`npm ci --dry-run`) — known pruning gotcha on this Mac
  that breaks CI's `npm ci` on Linux.
- No app route imports the client, so the existing site build is functionally
  unchanged; only the singleton and the test typecheck against generated types.

## Testing

`describe.skipIf(!process.env.DATABASE_URL)` suite that, after seeding, asserts:
parties exist with nested guests, guest `rsvpStatus`/`source` values are members
of the const unions, and the singleton `Settings` row is present. CI has no
`DATABASE_URL`, so the suite is skipped there and runs locally against the
container.

## New dependencies

`prisma`, `@prisma/client`, `@prisma/adapter-mssql`, `mssql`, `dotenv`
(+ `@types/mssql` if the singleton needs it).

## Deliverables

- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/migrations/<ts>_init/migration.sql` (with appended CHECK constraints)
- `prisma/seed.ts` (+ optional pure `prisma/seed-data.ts` builder)
- `src/lib/prisma.ts`, `src/lib/enums.ts`
- `docker-compose.dev.yml`, `.env.example`
- seed integration test (skipped in CI)
- `package.json` scripts + dependencies; `.gitignore` for `src/generated/`

## Acceptance (from the issue)

`prisma migrate dev` creates the schema; seed runs; typed client generated —
demonstrated locally against the SQL Server 2025 container with real output
attached to the PR.

## Out of scope (later waves)

API routes, guest/admin UI, CSV import/export, Auth.js, Azure SQL provisioning
and managed-identity auth (infra issue #61), and the `prisma migrate deploy`
step in `deploy.yml`.
