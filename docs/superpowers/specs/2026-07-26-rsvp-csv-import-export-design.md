# CSV import/export API — design

Issue #66 · Wave 1 · depends on #62 (data layer) and #63 (admin auth) · part of #60

## Goal

Two admin endpoints that bracket the RSVP lifecycle:

- `POST /api/admin/import` — bulk-create parties and guests from a CSV, with a
  row-level error report instead of silent drops.
- `GET /api/admin/export` — one CSV of every guest and their live RSVP state, for
  the caterer and planner.

Acceptance: importing a sample CSV and then exporting reflects what was imported;
malformed rows are reported, never silently skipped.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Import grain | One row per guest; rows sharing `partyDisplayName` form one party | Natural to build in a spreadsheet from an address list. No bookkeeping key to maintain by hand. |
| Bad rows | All-or-nothing — any invalid row rejects the whole file | No half-imported state to untangle. The report lists *every* bad row, so one pass fixes the spreadsheet. |
| Existing parties | Create-only — a display-name collision is a reported error | Import can never modify or delete a party that has already responded. Re-running a file fails safe. |
| Export columns | Superset of the import columns, plus live RSVP state and ids | Makes the round-trip literal and lets an exported row be traced to an audit entry. |
| Transport | Raw request body, `Content-Type: text/csv` | Trivial to `curl` and to test; the future admin UI posts the `File` directly as the fetch body. No multipart machinery. |
| CSV parsing | `csv-parse` + `csv-stringify` (sync APIs) | Node-first, RFC 4180 correct, bundled TypeScript types. Quoted commas, escaped quotes, and quoted newlines are exactly what the round-trip test exercises. |
| Deadline | Admin routes are **not** gated on `Settings.rsvpDeadline` | Export exists to be run after the deadline. This deliberately differs from the guest API, which 403s `rsvp_closed` on reads too. |
| Audit action | `AUDIT_ACTION.import` (`'import'`) | The enum from #62 already defines it. The issue's informal `imported` is not introduced as a second spelling. |

## Import contract

### Columns

A header row is required. Column names are matched case-sensitively. **Unknown
columns are ignored**, which is what lets an export file be fed back in.

| Column | Required | Rule |
|---|---|---|
| `partyDisplayName` | yes | 1–100 chars after `normalizeName` |
| `firstName` | yes | 1–100 chars after `normalizeName` |
| `lastName` | yes | 1–100 chars after `normalizeName` |
| `message` | no | ≤ 1000 chars; blank → `null` |
| `addGuestCap` | no | integer 0–20; blank → `Settings.defaultAddGuestCap` |

A blank `addGuestCap` needs the settings row, so a missing one fails loudly as
`500` `settings_missing` — the same error `requireRsvpOpen` already raises rather
than silently defaulting.

A missing **required** column is a single header-level error, reported without
attempting per-row validation.

### Grouping and party-level consistency

Rows are grouped by `normalizeName(partyDisplayName)` lowercased, **regardless of
row position** — a party's rows need not be contiguous. Lowercasing the key
matches the database's `SQL_Latin1_General_CP1_CI_AS` collation, so in-file
duplicate detection and existing-party collision detection agree on what "same
name" means.

`message` and `addGuestCap` are party-level fields carried on every row. Blank is
"unspecified" and inherits. If a party's rows carry **two different non-blank
values** for either field, that is an error naming the conflicting lines.

The stored `displayName` is the normalized value from the party's first row.

### Row and file errors

Every failure is reported as `{ line, reason }`, where `line` is the 1-based line
number **in the file** (the header is line 1, so the first data row is line 2).
Validation is exhaustive: all rows are checked and all errors collected before
anything is rejected.

Line numbers come from `csv-parse`'s record metadata (`info: true`), **not** from
counting array indices. A quoted field containing a newline spans several file
lines, so an index-derived number would drift for every row after it.

Error conditions:

- A required field is blank or exceeds its length limit.
- `addGuestCap` is not an integer, or falls outside 0–20.
- The same `firstName` + `lastName` appears twice within one party.
- A party's rows disagree on `message` or `addGuestCap`.
- The party's display name already exists in the database.

The last condition is the only one needing a query: one `findMany` over the
distinct display names in the file, resolved before the transaction opens.

### Created rows

Import is a seeding tool, so every created guest starts in the server-side
initial state regardless of what the file says:

- `rsvpStatus` = `pending`
- `source` = `admin`
- `flaggedForReview` = `false`

Two independent guards therefore make re-feeding an export harmless. Against a
populated database the create-only rule rejects it on the display-name
collision. Against an empty one — restoring after a reset — the `rsvpStatus`,
`source`, and `flaggedForReview` columns are read as unknown and ignored, so the
restored parties come back in the correct initial state rather than with stale
responses baked in.

### Limits

- Body larger than **1 MB**, or more than **2000 data rows** → `413`
  `csv_too_large`. The `content-length` header is checked first as a fast reject,
  and the decoded text length is re-checked because the header may be absent or
  wrong.
- Zero data rows → `400` `invalid_csv`.

### Responses

Success is `201`:

```json
{ "partiesCreated": 42, "guestsCreated": 118 }
```

Failure is `400` `invalid_csv`, listing every problem:

```json
{
  "error": "Import rejected: 2 invalid rows",
  "code": "invalid_csv",
  "rowErrors": [
    { "line": 4, "reason": "firstName is required" },
    { "line": 9, "reason": "addGuestCap must be an integer between 0 and 20" }
  ],
  "partiesCreated": 0,
  "guestsCreated": 0
}
```

`partiesCreated` and `guestsCreated` are present and zero on rejection so a
client can read the same two fields on either outcome.

### Transaction and audit

All writes run inside one `client.$transaction`. Per created party: the `Party`
row, its `Guest` rows, and **one** `AuditEntry`:

- `action` = `import`, `actorType` = `admin`, `actorEmail` = the session email
- `before` = `null` (nothing existed), `after` = the created party snapshot
- `ipAddress` from the existing `clientIpAddress(request)`

One entry per party rather than per batch because `AuditEntry.partyId` is
non-nullable — a batch-level entry has nowhere to live.

## Export contract

`GET /api/admin/export` returns `200` with:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="rsvps-YYYY-MM-DD.csv"` (today, UTC)
- A leading UTF-8 BOM, so Excel renders names like "Nguyễn" correctly. Import
  passes `bom: true`, so the BOM does not break the round-trip.

Columns, in order:

```
partyDisplayName,firstName,lastName,message,addGuestCap,
rsvpStatus,songRequest,source,flaggedForReview,partyId,guestId
```

One row per guest, ordered by `displayName` ascending, then by the existing
`GUEST_ORDER` (`createdAt`, then `id`) within a party. `null` message and
`songRequest` render as empty fields; `flaggedForReview` renders as `true` /
`false`. An empty database yields the header row alone.

## Module layout

Mirrors the split #64 established — pure rules separate from queries, thin route
handlers — so the interesting logic is unit-tested without a database.

| File | Purpose | Consumes | Produces |
|---|---|---|---|
| `src/lib/rsvp/csvSchemas.ts` | Zod schema for one import row; `IMPORT_COLUMNS`, `EXPORT_COLUMNS` | `zod`, `policy.normalizeName` | `importRowSchema`, column constants |
| `src/lib/rsvp/csvImport.ts` | **Pure.** Parsed rows → grouped, validated parties **or** a `rowErrors` list | `csvSchemas` | `parseImportCsv(text)`, `groupImportRows(rows)` |
| `src/lib/rsvp/csvExport.ts` | **Pure.** Guest records → CSV text | `csv-stringify`, `EXPORT_COLUMNS` | `toExportCsv(records)` |
| `src/lib/rsvp/admin/import.ts` | Collision query + create transaction + audit rows | Prisma, `csvImport` | `importParties(client, text, actorEmail, ipAddress)` |
| `src/lib/rsvp/admin/export.ts` | The single read query, projected to export records | Prisma | `loadExportRecords(client)` |
| `src/app/api/admin/import/route.ts` | Auth, size guard, body → service → response | above | `POST` |
| `src/app/api/admin/export/route.ts` | Auth, service → CSV response | above | `GET` |

Both service functions take the Prisma client as an explicit argument, matching
`parties.ts`, so the integration suite passes its own.

### Changes to existing files

- `src/lib/rsvp/errors.ts` — extend `RsvpErrorCode` with `invalid_csv` and
  `csv_too_large`. `RsvpError.details` already carries arbitrary keys, so
  `rowErrors` needs no new machinery.
- `package.json` / `package-lock.json` — add `csv-parse` and `csv-stringify`.
  Per the known lockfile gotcha, they are added **inside the Linux node image**
  so `npm ci` stays valid in CI.
- `AGENTS.md` — document the admin CSV surface alongside the guest API section.

## Auth

`src/proxy.ts` already matches `/api/admin/:path*` and returns 401
unauthenticated / 403 non-allowlisted. Both handlers additionally call
`requireAdminSession()`:

1. The route is not secured by middleware matcher configuration alone.
2. Import needs the session email for `AuditEntry.actorEmail`.

## Testing

**Unit (runs in CI, no database):**

- `csvImport` — grouping across non-contiguous rows; case-insensitive party keys;
  blank-inherits vs. conflicting party-level values; every row-error condition;
  exhaustive collection (a file with three bad rows reports three); correct
  1-based line numbers including a quoted embedded newline shifting later lines.
- `csvExport` — quoting of a value containing a comma, a quote, and a newline;
  BOM present; null fields empty; header-only output for no records.
- `csvSchemas` — trimming, length bounds, `addGuestCap` coercion and range.

**Database integration — `test/db/csvImportExport.test.ts`:**

- Round-trip: import a sample CSV → export → the export contains exactly those
  parties and guests, with `rsvpStatus` `pending`.
- Round-trip through live state: import, submit an RSVP, export → the export
  shows the submitted statuses and song requests.
- A file with one malformed row leaves the database completely untouched.
- A display name already present is rejected, and nothing is written.
- A created party has exactly one `import` audit entry with the actor email.
- Re-feeding an export does not overwrite live `rsvpStatus` (it is rejected on
  the collision, which is the safe outcome).

The file lives under `test/db/` so the serialized `db` vitest project picks it
up; placing it elsewhere would race the other DB suite.

**Browser verification:** these are API-only endpoints with no UI in this issue.
Verification drives the running app with authenticated and unauthenticated
requests, asserting the 401/403 denial as well as the happy path — per the
lesson that a green gate does not prove a gate is closed.

## Out of scope

- Admin import/export **UI** — issue #10, Wave 2.
- Upsert or delete semantics on import; import only ever creates.
- Streaming very large files; the sync parser is right for ~150 guests.
