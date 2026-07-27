# Admin API — parties/guests CRUD, moderation, settings, audit

Issue #65 · Wave 1 of the RSVP epic (#60). Depends on #62 (data layer), #63
(auth), #64 (guest API) — all merged.

## Goal

Give the admin dashboard (Wave 2) a complete authenticated REST surface over the
RSVP data: party and guest CRUD, moderation of guest-added plus-ones, the change
log, and the deadline/cap settings. Every mutation is attributable.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Delete semantics | Soft delete (`deletedAt`) on Party and Guest | `AuditEntry.partyId` is non-nullable with `onDelete: NoAction`, so a hard delete of any party with history raises an FK violation. Soft delete keeps the change log — the only defense for open name lookup — intact and attributable, and makes a mis-delete recoverable. |
| Deadline vs admins | Admins bypass `rsvpDeadline` entirely | The deadline is a guest-facing freeze. The couple must keep reconciling late replies by phone after guests are locked out. |
| Moderation "approve" | Clears `flaggedForReview`, leaves `source = 'guest_added'` | Provenance is a historical fact. Keeping `source` means an approved plus-one still counts against `addGuestCap`, so the cap stays a ceiling on party size rather than a rate limit on pending additions. |
| Party list shape | All parties with nested guests, unpaginated | ~60 parties / ~150 guests is tens of KB in one payload. The dashboard's summary stats derive from it client-side, so no separate stats endpoint is needed. |
| Concurrency control | None (no `updatedAt` precondition) | 1–2 admins. The guest API's 409 `party_changed` exists because guests race each other; the audit log makes any admin clobber visible after the fact. |
| Error envelope | Reuse `RsvpError` / `errorResponse` from #64 | One error contract across the feature. The `RsvpErrorCode` union gains the admin codes. |

## Schema change

One migration, no backfill and no data loss:

```prisma
model Party      { deletedAt DateTime? }
model Guest      { deletedAt DateTime? }
model AuditEntry { partyId   String?   }  // was non-nullable
```

`AuditEntry.partyId` is relaxed to nullable because a settings change belongs to
no party. The alternative — anchoring the entry to an arbitrary party — would
record an event against a party it never touched, corrupting the one artifact
this feature exists to keep trustworthy. The FK is already `NO ACTION`, so
widening it invalidates no existing row.

**Consequence outside this issue:** the merged guest API reads these tables
without a filter, so a soft-deleted row would still reach the guest wizard.
`searchParties`, `getPartyDetail`, and both party/guest reads inside `submitRsvp`
(`src/lib/rsvp/parties.ts`) gain `deletedAt: null`. A guest soft-deleted while a
party has the wizard open correctly surfaces as the existing 409 `party_changed`.

## Authentication and attribution

`src/proxy.ts` already matches `/api/admin/:path*` and rejects unauthenticated
(401) and non-allowlisted (403) callers. Each handler *additionally* calls
`requireAdminSession()` — not merely defense in depth: the resolved `email` is
what `AuditEntry.actorEmail` records, so the session is needed regardless.

Every mutation writes an `AuditEntry` inside the same transaction as the write:

- `actorType: 'admin'`, `actorEmail` from the session
- `ipAddress` via the existing `clientIpAddress(request)`
- `before` / `after` as JSON, using the party-snapshot projection for party-level
  changes and a guest projection for guest-level ones
- `action` from the existing `AUDIT_ACTION` enum (`party_created`,
  `party_updated`, `guest_created`, `guest_updated`, `guest_deleted`,
  `guest_moderated`, `settings_updated`)

A failed write leaves no audit row; an audit row implies the write committed.

## API surface

All routes are `/api/admin/*`, all JSON, all errors in the `RsvpError` envelope
(`{ error, code, ...details }`).

| Method + path | Behavior |
|---|---|
| `GET /parties` | All non-deleted parties, guests nested, `displayName` ascending. |
| `POST /parties` | Creates a party, optionally with nested `guests[]`. `addGuestCap` defaults from `Settings.defaultAddGuestCap`. |
| `GET /parties/:id` | One party with guests. 404 `party_not_found`. |
| `PATCH /parties/:id` | Updates `displayName`, `message`, `addGuestCap`. |
| `DELETE /parties/:id` | Soft-deletes the party and its guests. |
| `GET /guests` | All non-deleted guests; `?flagged=true` narrows to the moderation queue. |
| `POST /guests` | Creates a guest on a party. `source: 'admin'`, not flagged. |
| `GET /guests/:id` | One guest. 404 `guest_not_found`. |
| `PATCH /guests/:id` | Updates names, `rsvpStatus`, `songRequest`. |
| `DELETE /guests/:id` | Soft-deletes the guest. |
| `POST /guests/:id/moderate` | `{ action: 'approve' \| 'remove' }`. Approve clears the flag; remove soft-deletes. 409 `guest_not_flagged` if the guest was never flagged. |
| `GET /audit` | Change log, newest first. Filters `partyId`, `guestId`, `action`; `limit` (default 100, max 500) and `offset`. `before`/`after` returned parsed, not as JSON strings. |
| `GET /settings` | The singleton row. |
| `PATCH /settings` | Updates `rsvpDeadline` and `defaultAddGuestCap`. Changing the default does not retro-apply to existing parties. |

New error codes: `guest_not_found`, `guest_not_flagged`.

## Structure

```
src/lib/admin/
  route.ts      handleAdminRequest — session, context, error rendering
  audit-log.ts  writeAuditEntry — one shape for every mutation's audit row
  schemas.ts    zod input schemas
  parties.ts    list, get, create, update, softDelete
  guests.ts     list, get, create, update, softDelete, moderate
  settings.ts   read, update
  audit.ts      query
src/app/api/admin/{parties,guests,audit,settings}/…/route.ts
```

`handleAdminRequest(request, fn)` resolves the admin session (short-circuiting
401/403), passes `{ client, actorEmail, ipAddress }` to `fn`, and renders any
`RsvpError` through `errorResponse` while letting unexpected failures surface as
500s. It exists because the eight handlers otherwise repeat the same twelve
lines, and because a forgotten session check in one of them is a silent
authorization hole rather than a visible bug.

Route handlers stay thin — parse, delegate, return. All policy lives in the
service modules, which take a client and plain arguments so they are testable
without HTTP.

## Testing

- **DB integration** (`test/db/admin-*.test.ts`): CRUD round-trips, soft delete
  hiding rows from both admin and guest reads, moderation's two branches, cap
  accounting after approval, settings updates, audit rows written with the right
  action/actor, and audit filtering.
- **Unit**: input schemas, audit projections, and the `handleAdminRequest`
  session short-circuit.

Anything touching the database belongs under `test/db/` — that vitest project
runs with `fileParallelism: false` because those tests reset shared tables.
A DB test placed elsewhere races the suite and fails only intermittently.

Acceptance (from the issue): CRUD, moderation, and settings covered by tests,
and unauthenticated access rejected.
