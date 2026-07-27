# RSVP Guest API — Design

**Date:** 2026-07-26
**Issue:** #64 (wave 1) · Part of epic #60 · Depends on #62 (data layer)
**Status:** Approved (design); implementation not started

## Summary

Three public, unauthenticated route handlers that let a guest find their party,
read it, and submit the whole party's RSVP in one transaction:

- `GET /api/parties/search?q=` — exact full-name lookup
- `GET /api/parties/:id` — party + guests
- `PATCH /api/parties/:id/rsvp` — transactional submit, add-guest cap, audit

All logic that can be decided without a database lives in pure functions, so
cap enforcement, deadline lock, name matching and validation are covered by
tests that run in CI — where no database exists.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Search matching | Exact first + last name, normalized (trimmed, internal whitespace collapsed); case-insensitivity comes from the SQL Server collation | Tightest sensible gate on an open endpoint; scraping the guest list requires already knowing the names. Normalization keeps stray whitespace and capitalization from causing a false miss. |
| Search result shape | `{ id, displayName, guestFirstNames[] }` per match | Enough to disambiguate two John Smiths, per the epic's "show member first names". Leaks no RSVP status. |
| Add-guest cap | `Party.addGuestCap` caps guests with `source = guest_added` only | Matches the field name and the plus-one intent. Admin-seeded party size is the couple's decision, not the guest's. |
| Deadline behavior | **All three endpoints 403 after `Settings.rsvpDeadline`** | Chosen deliberately. **Supersedes the epic's "then read-only"** — see [Deadline](#deadline) below. |
| Submit payload | Full declarative party state; server diffs against the DB | Idempotent; re-submitting the wizard is naturally safe, and there is no "unchanged vs cleared" ambiguity. |
| Writable statuses | `attending` \| `declined` only | `pending` stays a server-side initial state, so "undecided" and "never opened the wizard" never blur together in admin stats. |
| Guest removal | Not supported on this endpoint, ever | Removal is admin-only (#65). A guest added by mistake is a moderation case. |
| Validation | zod (direct dependency) | Parses and narrows in one step, giving typed handlers and per-field errors. |
| Structure | Pure policy → thin service → thin handlers | Puts the acceptance criteria in CI-runnable unit tests instead of DB-only tests that skip. |
| Abuse control | Out of scope; follow-up issue | Cloudflare fronts the site; search exposes only names and exact-match makes enumeration impractical. |

### Deadline

The epic (`2026-07-17-rsvp-design.md`) says RSVPs are "editable until a
configurable deadline, then read-only". **This design supersedes that:** after
the deadline, `search`, party read, and submit all return `403`. The RSVP is
not read-only, it is closed.

Consequence for #67: the wizard must render a **closed-page state** — it cannot
render a read-only view of a submitted RSVP, because it can no longer fetch one.
This must be noted on #67 before that issue is planned.

## Prerequisite: lazy Prisma client

`src/lib/prisma.ts` currently reads `DATABASE_URL` and throws at **module top
level**. Nothing imports it today (the seed script and DB test construct their
own clients), so `next build` passes. The first route handler that imports it
breaks `next build` and `docker build`, neither of which has secrets.

`AGENTS.md` already documents this rule for the auth environment variables:
env vars are read **inside functions, never at module top level**.

Fix, as part of this issue: `src/lib/prisma.ts` exports a memoized
`getPrismaClient(): PrismaClient` that reads `DATABASE_URL` inside the function
and keeps the existing `globalThis` reuse in non-production. No other module
changes — nothing imports the current `prisma` export.

## Endpoints

Every response is JSON. Errors share one shape:

```json
{ "error": "human-readable message", "code": "machine_code" }
```

### `GET /api/parties/search?q=`

`q` is normalized, then split at each internal space to produce first/last
candidates, so multi-part names resolve without guessing where the surname
starts. `"mary jo van der berg"` yields candidates
`(mary, jo van der berg)`, `(mary jo, van der berg)`,
`(mary jo van, der berg)`, `(mary jo van der, berg)`; the query ORs them.

A guest matches when `firstName` and `lastName` equal a candidate pair. The
comparison is case-insensitive because the database collation
(`SQL_Latin1_General_CP1_CI_AS`) is — Prisma's `mode: 'insensitive'` is
PostgreSQL/MongoDB-only and raises a validation error on `sqlserver`, so it is
used nowhere in this codebase.

```
200 { "parties": [ { "id": "...", "displayName": "The Smith Family",
                     "guestFirstNames": ["John", "Jane"] } ] }
```

No match is `200` with an empty array, not `404` — "not found" is a normal
outcome the wizard renders as "Can't find yourself?".

`400 invalid_request` when `q` is under 2 characters or has no internal space
(a single token cannot be a full name).

### `GET /api/parties/:id`

```
200 {
  "id": "...", "displayName": "...", "message": "..." | null,
  "addGuestCap": 5, "addedGuestsRemaining": 4,
  "rsvpDeadline": "2026-09-10T00:00:00.000Z",
  "guests": [ { "id": "...", "firstName": "...", "lastName": "...",
                "rsvpStatus": "attending", "songRequest": "..." | null,
                "source": "admin" } ]
}
```

Guests are ordered by `createdAt`, then `id`, so the wizard's row order is
stable across reloads.

`addedGuestsRemaining` is `max(0, addGuestCap − count(source = 'guest_added'))`.
It clamps at zero because an admin can lower a cap below a party's existing
added-guest count; that makes further additions impossible, not negative.

`flaggedForReview` is **never** exposed — moderation state belongs to the admin
API. `source` is exposed so the wizard can mark guests the party added.

A malformed UUID and an unknown UUID both return `404 party_not_found`, keeping
ids opaque.

### `PATCH /api/parties/:id/rsvp`

```json
{
  "message": "Can't wait!",
  "guests": [
    { "id": "a1…", "rsvpStatus": "attending", "songRequest": "September" },
    { "id": "b2…", "rsvpStatus": "declined",  "songRequest": null }
  ],
  "newGuests": [
    { "firstName": "Sam", "lastName": "Rivera", "rsvpStatus": "attending",
      "songRequest": null }
  ]
}
```

Rules, in the order they are checked:

1. **Deadline** — closed → `403 rsvp_closed`.
2. **Party exists** — else `404 party_not_found`.
3. **Guest set matches exactly** — `guests[]` ids must equal the party's current
   guest ids as a set. Any missing, extra, or foreign id → `409 party_changed`.
   This catches a stale client whose party an admin edited mid-session, instead
   of silently dropping or misapplying edits.
4. **Add-guest cap** — existing `guest_added` count + `newGuests.length` must
   not exceed `addGuestCap`, else `409 add_guest_cap_exceeded`.

Everything then happens inside one `prisma.$transaction(async (tx) => …)`
(supported by `@prisma/adapter-mssql`): party `message` update, per-guest
`rsvpStatus`/`songRequest` updates, new guest inserts with
`source = 'guest_added'` and `flaggedForReview = true`, and the audit rows.

Returns `200` with the same body shape as `GET /api/parties/:id`, reflecting
post-write state — the wizard gets its refresh in the same round trip.

### Field constraints

All string columns are `NVARCHAR(1000)`, so validation caps sit under the
column width and reject at the edge rather than at the database:

| Field | Rule |
|---|---|
| `firstName`, `lastName` | trimmed, 1–100 chars, required |
| `songRequest` | trimmed, ≤ 200 chars, empty → `null` |
| `message` | trimmed, ≤ 1000 chars, empty → `null` |
| `rsvpStatus` | `attending` \| `declined` |

Trimming happens in the schema, so `null` and `""` both persist as `null`.

### Error catalogue

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | zod parse failure, or a `q` that is too short / single-token |
| 403 | `rsvp_closed` | past `Settings.rsvpDeadline`; body carries `deadline` |
| 404 | `party_not_found` | unknown or malformed party id |
| 409 | `party_changed` | submitted guest id set ≠ current guest id set |
| 409 | `add_guest_cap_exceeded` | added-guest count would exceed `addGuestCap`; body carries `cap` and `remaining` |
| 500 | `settings_missing` | no `Settings` row |

`settings_missing` fails loud rather than defaulting to "open". `Settings` is a
seeded singleton guarded by a CHECK constraint; its absence is a
misconfiguration, not a state to paper over.

## Module structure

```
src/lib/rsvp/
  policy.ts        pure: name normalization + split candidates, deadline check,
                   guest-set reconciliation, cap check, audit payload derivation
  policy.test.ts   no DB → runs in CI
  schemas.ts       zod schemas for the search query and the submit body
  schemas.test.ts  no DB → runs in CI
  errors.ts        RsvpError { status, code } + errorResponse(error)
  parties.ts       service: searchParties / getPartyDetail / submitRsvp
src/app/api/parties/search/route.ts
src/app/api/parties/[id]/route.ts
src/app/api/parties/[id]/rsvp/route.ts
test/db/parties.test.ts    integration, under the existing skipIf(!DATABASE_URL)
```

**`policy.ts`** — pure functions, no imports beyond the enums. No database, no
Prisma types, no `Date.now()` (the clock is a parameter). This is where the
acceptance criteria live.

**`schemas.ts`** — zod 4. Field errors come from the top-level
`z.flattenError(result.error)`; the v3 `error.flatten()` instance method is
gone.

**`errors.ts`** — `RsvpError` carries `status` and `code`; `errorResponse()`
maps it to a `Response`. Anything that is not an `RsvpError` propagates as a
500 rather than being swallowed.

**`parties.ts`** — takes the Prisma client as an explicit first argument. Route
handlers pass `getPrismaClient()`; the integration test passes its own client.
The dependency points inward: the service knows nothing about HTTP, and the
handlers know nothing about SQL.

**Route handlers** — parse, call the service, map errors. Three lines of real
work each.

## Audit trail

One successful submit writes:

- **One `rsvp_submitted`** row on the party. `before`/`after` are JSON snapshots
  of the party `message` plus every guest's `rsvpStatus` and `songRequest`, so
  the change log can render a full diff from one row.
- **One `guest_added`** row per new guest, carrying its `guestId`, so #69's
  moderation UI can link a flagged guest to the moment it was added.

Both use `actorType = 'guest'`, `actorEmail = null`, and `ipAddress` taken from
`cf-connecting-ip`, falling back to the first entry of `x-forwarded-for`
(Cloudflare proxies the site; the Container App adds the forwarded header).
The header is read in the route handler and passed to the service — the service
never touches a `Request`.

Audit rows are written inside the same transaction as the data change, so a
failed submit leaves no trail entry and a successful one is never missing.

## Testing

The existing DB suite is wrapped in `describe.skipIf(!process.env.DATABASE_URL)`
and therefore **skips in CI**. Splitting policy out from persistence is what
keeps this issue's acceptance criteria from skipping with it.

**Runs in CI (no database):**

- name normalization and split candidates, including multi-part surnames and
  the single-token rejection
- deadline open/closed at, before, and after the boundary
- guest-set reconciliation: exact match, missing id, extra id, foreign id
- cap check: under, exactly at, and over the cap; cap counts only `guest_added`
- audit payload derivation from a before/after pair
- schema validation: status rejection (`pending`, unknown), length caps,
  trimming, empty-to-null

**Runs locally against SQL Server (skipped in CI):**

- search finds a party by exact full name and is case-insensitive in practice
  (collation behavior cannot be asserted without a database)
- submit updates statuses, songs and message, and inserts new guests with
  `source = 'guest_added'` and `flaggedForReview = true`
- submit writes exactly one `rsvp_submitted` row plus one `guest_added` per new
  guest
- a rejected submit (cap exceeded) leaves the database untouched — the
  transaction rolls back
- `403` after the deadline on all three endpoints

Local DB is podman, SQL Server `2022-latest`, host port **14330**
(`docker-compose.dev.yml`) — see `.claude/skills/ship-it/LEARNINGS.md`.

## Dependency change

zod resolves to 4.3.6 in the tree today, but only **transitively** via
`eslint-config-next → eslint-plugin-react-hooks`. Runtime code must not depend
on a lint plugin's transitive dependency, so zod is added as a direct
`dependency`. Because the version is already resolved and deduped, this is a
lockfile-metadata change.

Per `LEARNINGS.md`, the lockfile is regenerated **inside the Linux image**, not
on this Mac, which prunes cross-platform optional dependencies and breaks CI's
`npm ci`:

```
podman run --rm -v "$PWD":/app -w /app node:24-alpine \
  npm install --package-lock-only --save zod
```

## Out of scope

- **Rate limiting the public endpoints** — follow-up issue, sibling to #83.
  In-process limiting would be per-replica (production runs up to 2) and so
  leaky enough to be misleading.
- **Admin endpoints** — #65.
- **CSV import/export** — #66.
- **Any UI** — #67 consumes this API.
- **Guest deletion, party creation, moderation** — admin-only surfaces.
