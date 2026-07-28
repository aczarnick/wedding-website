# Admin party/guest management + moderation UI — design

Issue: [#69](https://github.com/aczarnick/wedding-website/issues/69) · Wave 2 · depends on
[#65](https://github.com/aczarnick/wedding-website/issues/65) (admin API, merged as PR #87) and
[#68](https://github.com/aczarnick/wedding-website/issues/68) (admin shell, merged as PR #93).

## Goal

Give the couple a console for the guest list: list, search and filter parties and their
guests; create, edit and delete both; set a party's add-guest cap; record an RSVP on a
guest's behalf; and resolve flagged guest-added plus-ones.

## Scope

In scope: the two screens below and the client-side data layer they need.

Out of scope: the global settings screen, CSV import/export UI, and the change-log
viewer — all issue #70. The admin API itself is complete and is **not** modified.

## Architecture

Two lowercase routes inside the existing `/admin` shell:

- `/admin/parties` — the party list and everything reachable from it
- `/admin/moderation` — the flagged-guest queue

Both are thin server pages that render one client component. Routes must stay lowercase:
`src/proxy.ts` matches `/admin/:path*` case-sensitively, so a capitalised segment would
sit outside the auth gate.

### Data path: client fetch to the existing REST API

Client components call `/api/admin/*` through a new typed module,
`src/lib/admin/client.ts`, mirroring the guest-side `src/lib/rsvp/client.ts`.

The alternative — server components reading `src/lib/admin/*` with server actions for
mutations — was rejected. `handleAdminRequest()` centralises the session check,
`actorEmail`, and `ipAddress` that every audit entry is attributed to. A server action
mutating through the services directly would be a **second** mutation entry path that has
to reproduce that plumbing, and an action that omitted `actorEmail` would silently
degrade the audit trail. Going through the API keeps exactly one audited entry path and
reuses the surface that #65's tests already cover.

### Shared HTTP transport

`src/lib/rsvp/client.ts` currently holds a generic `request` helper and an `RsvpApiError`
class that the admin client needs identically. Both move to a new
`src/lib/http/apiClient.ts` as `requestJson` and `ApiError`, and the ~25 references to
`RsvpApiError` in `RsvpWizard.tsx`, `RsvpWizard.test.tsx` and `client.test.ts` are renamed
to `ApiError`. Behaviour is unchanged; the rename keeps one name for one concept rather
than leaving a legacy alias behind.

### Modules

| File | Responsibility | Depends on |
|---|---|---|
| `src/lib/http/apiClient.ts` | `ApiError`; `requestJson<T>(url, init)` — fetch, JSON-decode, throw `ApiError` on a non-2xx or unreachable server | — |
| `src/lib/admin/client.ts` | one function per endpoint: `fetchParties`, `createParty`, `updateParty`, `deleteParty`, `createGuest`, `updateGuest`, `deleteGuest`, `fetchFlaggedGuests`, `moderateGuest` | `apiClient`, `projections` types |
| `src/lib/admin/partyList.ts` | **pure** view derivation: `filterParties(parties, filter)`, `summarizeGuests(guests)` | `projections` types, `enums` |
| `src/app/admin/parties/page.tsx` | server page: heading + `<PartyManager />` | — |
| `src/app/admin/moderation/page.tsx` | server page: heading + `<ModerationQueue />` | — |
| `src/components/admin/PartyManager.tsx` | client: loads parties, owns search text, status filter, expanded-row id, create-form visibility | `client`, `partyList`, `PartyRow`, `NewPartyForm` |
| `src/components/admin/PartyRow.tsx` | one party: summary tallies, expand toggle, party-fields edit, guest table, add-guest form, delete | `PartyFieldsForm`, `GuestRow`, `GuestForm`, `ConfirmButton` |
| `src/components/admin/PartyFieldsForm.tsx` | `displayName` / `message` / `addGuestCap` inputs — shared by create and edit | — |
| `src/components/admin/NewPartyForm.tsx` | party fields plus repeatable guest-name rows, submitted as one `POST /api/admin/parties` | `PartyFieldsForm` |
| `src/components/admin/GuestForm.tsx` | `firstName` / `lastName` / `rsvpStatus` / `songRequest` — serves both add-guest and edit-guest, and is where an RSVP is recorded on a guest's behalf | `RsvpStatusBadge` types |
| `src/components/admin/GuestRow.tsx` | one guest: name, status badge, source and flagged badges, Edit / Remove | `RsvpStatusBadge`, `ConfirmButton` |
| `src/components/admin/RsvpStatusBadge.tsx` | status pill (`pending` / `attending` / `declined`) | — |
| `src/components/admin/ConfirmButton.tsx` | two-step destructive action | — |
| `src/components/admin/ModerationQueue.tsx` | client: loads flagged guests and parties, renders one card per flagged guest with approve / remove | `client` |

Modified: `src/lib/rsvp/client.ts` (use the shared transport), `src/components/rsvp/RsvpWizard.tsx`,
`src/constants/admin.ts` (nav links), `AGENTS.md` (document the new screens).

## Behaviour

### Party list

`GET /api/admin/parties` returns every live party with its live guests nested, ordered by
`displayName`, so the whole screen is one request and expanding a row costs nothing more.

**Search and filter are client-side** over that list — no API change. `filterParties`
matches the search text against the party's display name **or** any guest's full name,
case-insensitively, and the status filter keeps parties having at least one guest with the
selected RSVP status. Both are pure and unit-tested.

Each row summarises via `summarizeGuests`: total guests plus attending / declined /
pending / flagged counts.

### Mutations

Every mutation is an API call followed by **re-fetching the list**, not a local merge of
the response. The server orders parties by `displayName` and guests by `(createdAt, id)`;
reproducing that ordering client-side would be a second source of truth that can disagree
with the database. The extra `GET` is negligible at wedding scale. Expanded-row state is
keyed by party id, so it survives the refresh.

- **Create party** — one `POST /api/admin/parties` carrying the party fields and the guest
  rows, which produces a single `party_created` audit entry covering the whole party.
  Created guests are forced server-side to `pending` / `source=admin`. A blank add-guest
  cap inherits `Settings.defaultAddGuestCap`.
- **Edit party** — `PATCH /api/admin/parties/:id` with the changed fields. The add-guest
  cap is edited here; the *global* default belongs to the settings screen (#70).
- **Delete party** — `DELETE /api/admin/parties/:id`, a soft delete that cascades to the
  party's guests. The confirmation names the cascade: "Remove this party and its 3 guests?"
- **Add guest** — `POST /api/admin/guests` with `partyId`.
- **Edit guest** — `PATCH /api/admin/guests/:id`. Changing `rsvpStatus` here *is* recording
  an RSVP on the guest's behalf; unlike guests, an admin may set `pending`.
- **Delete guest** — `DELETE /api/admin/guests/:id`, soft.

Admins deliberately bypass `Settings.rsvpDeadline` — no admin service calls
`requireRsvpOpen()` — so the console keeps working after RSVPs close. The UI adds no
deadline check of its own.

### Destructive confirmation

`ConfirmButton` renders its label (e.g. "Remove"), and on click replaces itself in place
with the confirmation prompt and `Yes` / `Cancel`. It never calls `window.confirm`: a
native dialog blocks all further browser events, which breaks the browser verification
this issue requires, and it cannot be asserted in RTL without stubbing a global.

### Moderation queue

Loads `GET /api/admin/guests?flagged=true` **and** `GET /api/admin/parties`, because the
flagged-guest payload carries only `partyId` and the question a moderator is answering is
"which party added this person?". Each card shows the guest's name, the party's display
name, and when the guest was added.

- **Approve** → `POST /api/admin/guests/:id/moderate` `{action:'approve'}` — clears
  `flaggedForReview` and leaves `source=guest_added`, so the guest still counts against
  that party's add-guest cap. The card states this, because it is otherwise invisible.
- **Remove** → the same endpoint with `{action:'remove'}`, behind `ConfirmButton`; the
  guest is soft-deleted.

A guest already resolved elsewhere returns **409 `guest_not_flagged`**, which surfaces as
the inline error and is followed by a re-fetch.

### Errors and empty states

Each form renders its own `<p role="alert">` carrying `ApiError.message`; a failed list
load renders the message plus a retry button. Assertions — in RTL and in the browser —
scope to the app's own alert elements, never a bare `getByRole('alert')`, which also
matches the Next dev overlay and can pass vacuously.

Empty states: no parties yet, no parties matching the current search/filter, and an empty
moderation queue.

## Testing

Unit (no DOM): `partyList.test.ts` covers search across party and guest names, the status
filter, and the tallies. `apiClient.test.ts` inherits the transport cases from the
existing `rsvp/client.test.ts`. `admin/client.test.ts` asserts each function's URL, method
and body.

RTL: `PartyManager` (load, search, filter, expand, create, delete, load failure),
`NewPartyForm` (add/remove guest rows, validation, submitted payload), `GuestForm`
(required names, `rsvpStatus` change reaches the PATCH body), `ConfirmButton` (two-step,
cancel restores), `ModerationQueue` (party names resolved, approve, remove, empty state).

Browser (against the local SQL Server + seed): create a party with guests, edit it, add a
guest, record an RSVP for a guest, delete a guest, delete the party, and approve and
remove from the moderation queue. Both auth directions are proven — signed out,
`/admin/parties` and `/admin/moderation` redirect to `/signin`; signed in, the flows above
work end to end. Desktop and mobile screenshots ship with the PR. Any state the
verification mutates is re-seeded afterwards.
