# RSVP Guest Wizard UI (`/rsvp`) — Design

**Date:** 2026-07-27
**Issue:** #67 (wave 2) · Part of epic #60 · Depends on #64 (guest API)
**Status:** Approved (design); implementation not started

## Summary

The public, unauthenticated guest flow at `/rsvp`: look up your party by name,
disambiguate if several match, set everyone's yes/no and song request on one
page, optionally add guests up to the party cap, leave a message, and submit —
then see an on-screen confirmation you can reopen and edit until the deadline.

The page consumes the three endpoints shipped in #64 and adds no server logic.
Its whole job is state, validation, and rendering, so every acceptance
criterion is reachable from React Testing Library with the API mocked.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Post-deadline behavior | **Closed page**, not read-only | Forced by #64: all three endpoints 403 after the deadline, so the wizard cannot fetch a submitted RSVP to display. See [Deadline](#deadline). |
| Routing | Single `/rsvp` route, steps in client state | The party UUID is the only thing protecting a party's RSVP; keeping it out of the URL keeps it out of history, screenshots, and referrer headers. Re-entry is by name lookup anyway, so a refresh costs one search. |
| Edit layout | One page: statuses, songs, add-guest, message, one Submit | Mirrors the API, which takes the complete party state in a single `PATCH`. A 2–5 person party is one thumb-scroll on mobile; step chrome would add taps and state for no gain. |
| "Can't find yourself?" | Plain text: contact the bride or groom | No mailto and no phone number on a public page. Supersedes the epic's "contact mailto". |
| Response types | Extracted to a Prisma-free `types.ts` | Lets client code type itself against the API without importing a module that pulls in Prisma. |
| API access | One `client.ts` module wrapping the three endpoints | Single seam for error mapping and for `vi.mock` in tests. |
| Status typing | Keep `rsvpStatus`/`source` as `string` | They are Prisma enum-as-String. The wizard treats anything that is not `attending`/`declined` as unanswered — no unchecked cast, no type that overstates what the server guarantees. |

### Deadline

The epic and issue #67 both say RSVPs are "editable until a configurable
deadline, then read-only". **This design supersedes that**, as the #64 design
anticipated it would.

`GET /search`, `GET /:id`, and `PATCH /:id/rsvp` all return `403 rsvp_closed`
once `Settings.rsvpDeadline` has passed. A read-only view would require reading,
so it is not available. After the deadline `/rsvp` renders a terminal closed
page: the deadline date and a line directing the guest to the bride or groom.
No lookup form, no read-back.

This was confirmed as a product decision rather than worked around by relaxing
the API, which would have meant reopening shipped #64 code and its tests.

## Architecture

```
src/app/rsvp/page.tsx                     server component: <Header/> + <RsvpWizard/>
src/lib/rsvp/types.ts                     Prisma-free response interfaces (new)
src/lib/rsvp/client.ts                    typed fetch wrappers + RsvpApiError (new)
src/components/rsvp/
  RsvpWizard.tsx                          'use client' state machine; owns all API calls
  PartyLookup.tsx                         search form, inline validation, not-found state
  PartyPicker.tsx                         disambiguation list
  PartyForm.tsx                           the one-page editor; owns the draft
  RsvpStatusToggle.tsx                    Attending/Declined radio group
  GuestRsvpFields.tsx                     one existing guest row
  AddedGuestFields.tsx                    one draft new-guest row
  RsvpConfirmation.tsx                    post-submit summary + "Edit your response"
  RsvpClosed.tsx                          terminal closed-page state
```

`page.tsx` stays a server component so the route costs no client JavaScript
beyond the wizard itself, matching `/gallery`'s shape.

`RsvpStatusToggle` is extracted at its second use rather than its third. It is a
distinct widget carrying accessibility structure (a labelled radio group), not
incidental duplication of markup.

### State machine

`RsvpWizard` holds one discriminated union. Every step carries exactly the data
that step needs, so no component reads a field that is meaningless in its state.

```ts
type WizardState =
  | { step: 'lookup' }
  | { step: 'picking';   query: string; matches: PartySearchResult[] }
  | { step: 'editing';   party: PartyDetail; notice?: string }
  | { step: 'confirmed'; party: PartyDetail }
  | { step: 'closed';    deadline: string }
```

Transitions:

- `lookup` → `picking` on 2+ matches; → `editing` directly on exactly one match
  (a picker with one option is a wasted tap); stays on `lookup` with the
  not-found state on zero matches.
- `picking` → `editing` on selection; → `lookup` on "search again".
- `editing` → `confirmed` on a successful submit, using the `PartyDetail` the
  `PATCH` returns — the API gives back post-write state, so no refetch.
- `confirmed` → `editing` on "Edit your response".
- **any** → `closed` on `403 rsvp_closed`.

### Client/server boundary

`page.tsx` is a server component. `RsvpWizard` and everything under it are
`'use client'`. Nothing in `src/components/rsvp/` imports Prisma, `@/lib/prisma`,
`@/lib/rsvp/parties`, or `@/lib/rsvp/errors`.

## The `types.ts` extraction

`PartySearchResult`, `PartyDetailGuest`, and `PartyDetail` currently live in
`src/lib/rsvp/parties.ts`, which imports `@/generated/prisma/client`. A client
component typing itself against them must `import type` from that module.
Type-only imports are erased, so this works — until someone adds a value import
to the same statement and the Prisma client lands in the browser bundle.

Move the three interfaces to `src/lib/rsvp/types.ts`, which imports nothing.
`parties.ts` imports and re-exports them so existing importers and #65's code
are unaffected. Roughly 25 lines moved; this is the only shipped #64 code this
issue touches.

## API client

`src/lib/rsvp/client.ts`:

```ts
export class RsvpApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
}

export function searchParties(query: string): Promise<PartySearchResult[]>;
export function fetchParty(partyId: string): Promise<PartyDetail>;
export function submitRsvp(partyId: string, input: SubmitRsvpBody): Promise<PartyDetail>;
```

Each wrapper checks `response.ok`, parses `{ error, code, ...details }` on
failure, and throws `RsvpApiError`. A non-JSON or unreachable response throws an
`RsvpApiError` with status `0` and code `network_error`, so callers have one
error type to handle rather than two.

`RsvpApiError` is defined here rather than reusing `RsvpError` from
`src/lib/rsvp/errors.ts`: that module also exports `errorResponse`, which
constructs a `Response`, and belongs to the server. The duplication is a class
declaration; the coupling avoided is a server module in the client bundle.

`SubmitRsvpBody` is a plain interface in `types.ts` matching what
`submitRsvpSchema` accepts. The client does not import the zod schema — the
server validates, and shipping a schema to the browser to pre-validate the same
rules twice is duplication that drifts.

## Error handling

| Code | Wizard behavior |
|---|---|
| `400 invalid_request` (search) | Inline error under the field: "Enter a first and last name". Stay on `lookup`. |
| `403 rsvp_closed` | → `closed`, carrying `deadline` from the error body. Reachable from every call. |
| `404 party_not_found` | → `lookup` with "That party is no longer available." Covers a party soft-deleted mid-session. |
| `409 party_changed` | Refetch the party, stay in `editing` with the fresh data and a notice. |
| `409 add_guest_cap_exceeded` | Inline notice on the add-guest section; refetch to resync `addedGuestsRemaining`. |
| `500` / `network_error` | Retry banner. The draft is preserved — nothing is discarded for a failure that may be transient. |

### `party_changed` discards the draft

The API rejects a submit whose guest id set no longer matches the database,
rather than silently applying partial edits. Recovering means refetching, which
replaces the guest list the draft was built from.

The wizard therefore resets the draft from the refetched party and tells the
guest plainly: their party was updated and their answers need re-entering. It
does **not** attempt to merge the old draft onto the new guest set — a merge
would have to guess whether an admin's edit or the guest's stale answer wins,
and getting that wrong silently corrupts an RSVP.

## Form rules

- **Submit gating** — every existing guest and every draft new guest must be
  `attending` or `declined`. `pending` is not submittable (#64), so the button
  stays disabled with "Please answer for everyone" until the set is complete.
  New guests additionally need a first and last name.
- **Song request** — hidden when a guest is Declined, and submitted as `null`.
  A declined guest's song request is not data anyone wants.
- **Add a guest** — the control shows `addedGuestsRemaining` and disappears at
  zero. Draft new guests count against the remaining total client-side, so the
  control disappears as the guest fills the cap rather than only on a rejected
  submit.
- **Removing guests** — a draft new guest can be removed before submitting.
  After submitting, it cannot: removal is admin-only by design in #64. The
  add-guest section says added guests are reviewed by the couple, so the
  one-way door is stated before it is walked through, not after.
- **Re-entry** — existing answers preselect from `rsvpStatus`; existing songs
  and the party message prefill.
- **Not found** — plain text directing the guest to the bride or groom.

## Styling

Tailwind utilities only, sage palette and `font-serif` inherited from the root
layout, mobile-first with the `md:` breakpoint, matching `/gallery`'s page
shell (`min-h-screen flex flex-col bg-sage-50/30` under `<Header />`). No new
colors, no custom CSS, no new fonts.

## Testing

**RTL, in the existing `unit` project**, colocated with each component per the
`Header.test.tsx` convention, mocking `@/lib/rsvp/client` with `vi.mock`:

- lookup rejects a single-token query and renders the API's field error
- zero matches renders the not-found state naming the bride and groom
- 2+ matches renders the picker with each party's member first names
- exactly one match skips the picker and lands on the editor
- the editor preselects existing statuses and prefills songs and the message
- the song field disappears when a guest is set to Declined
- Submit is disabled until every guest is answered, and enabled once they are
- the add-guest control disappears once drafts exhaust `addedGuestsRemaining`
- a draft new guest can be removed
- each error code drives its documented transition, including `403` → closed
  from the search call and from the submit call
- confirmation renders the submitted summary and returns to the editor

**Browser verification** (per the repo's UI-verification rule) against the
seeded local database: full flow end to end — search, pick, answer, add a guest,
message, submit, confirmation, reopen and re-submit. Then the closed state, by
moving `Settings.rsvpDeadline` into the past, checking `/rsvp`, and **restoring
the deadline and re-seeding afterwards** — a verification script that mutates
shared state must put it back (`LEARNINGS.md`, 2026-07-26).

## Out of scope

- **Nav link / RSVP button** — #71. There is no RSVP button in the codebase
  today, so that issue's title ("wire existing RSVP button") is inaccurate;
  it will need to add one. This issue does not touch `NAV_LINKS` or `Header`.
- **Rate limiting** the public endpoints — #85.
- **Admin surfaces** — #68/#69/#70.
- **Any change to the three guest endpoints' behavior**, including the
  post-deadline 403.
