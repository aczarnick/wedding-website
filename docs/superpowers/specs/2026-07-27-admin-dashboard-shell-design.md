# Admin dashboard shell + summary stats — design

Issue: #68 (wave 2 · UI) · Epic: #60 · Depends on: #63 (auth), #65 (admin API)

## Goal

Give the admin console a front door: a branded sign-in page, an authenticated
`/admin` shell with navigation and sign-out, and a summary of where the guest
list stands. Issues #69 and #70 hang their pages off this shell.

## Scope

**In:** `/signin` page, `/admin` layout + dashboard page, summary-stats service,
DB-failure boundary, tests.

**Out (YAGNI):** a `GET /api/admin/stats` endpoint, stub pages for #69/#70,
charts, date-range filtering, session-expiry warnings.

## Route and auth topology

```
/signin            public, NOT matched by proxy.ts   branded credentials form
/admin             gated by proxy.ts                 shell + stat grid
/admin/error.tsx                                     database-failure boundary
```

The sign-in page must live outside the `/admin/*` matcher. A page at
`/admin/signin` would itself be gated, so an unauthenticated visitor would be
redirected to it, matched again, and redirected forever.

Three edits to existing files:

- `src/auth.ts` — add `pages: { signIn: '/signin' }`, so Auth.js's own redirects
  land on our page rather than its built-in one.
- `src/proxy.ts` — `SIGN_IN_PATH` becomes `/signin`.
- `src/app/layout.tsx` — unchanged. The admin chrome is a nested
  `src/app/admin/layout.tsx`, so `/admin` inherits the Playfair body font but not
  the public `Header`/`Footer`.

### Open-redirect guard

`proxy.ts` sets `callbackUrl` to `request.nextUrl.href` — an **absolute** URL.
Navigating to that value unvalidated would make
`/signin?callbackUrl=https://evil.example` bounce a freshly signed-in admin
off-site.

A pure helper resolves it:

```ts
// src/lib/admin/callbackPath.ts
export function resolveAdminCallbackPath(raw: string | undefined): string;
```

**Contract.** Return the callback's `pathname + search` when that pathname is
`/admin` or begins with `/admin/`; otherwise return `/admin`. Absolute URLs are
accepted only for their path component. Protocol-relative input (`//host/admin`)
is rejected — it names a foreign origin regardless of its path. Input that is
absent, empty, or unparseable returns `/admin`.

Restricting the destination to `/admin` is both safe and sufficient: this
sign-in page guards nothing else.

## Sign-in page

`src/app/signin/page.tsx` is a **server** component. It awaits `searchParams`,
resolves the callback through `resolveAdminCallbackPath`, and — when `await
auth()` already yields an allowlisted session — redirects to `/admin` instead of
rendering a form the visitor does not need. It passes the resolved path to the
form as a prop.

That server/client split is not stylistic. Reading `callbackUrl` with
`useSearchParams()` inside the client component fails `next build` with the
missing-suspense-boundary error. The server page reads the URL; the client
component never touches it.

`src/components/admin/SignInForm.tsx` (`'use client'`) holds email and password
state and submits with the Auth.js client helper:

```ts
const result = await signIn('credentials', { email, password, redirect: false });
```

On `result?.error`, render one inline `<p role="alert">` reading *"Incorrect
email or password."* — deliberately not distinguishing an unknown email from a
wrong password, and never echoing the raw error code. On success,
`router.push(callbackPath)` followed by `router.refresh()` so the layout's
server-side session read re-runs.

The submit button is disabled while a request is in flight.

## Summary-stats service

New `src/lib/admin/stats.ts`, following the `(client, ...)` read convention of
`parties.ts` and `guests.ts`:

```ts
export interface SummaryStats {
  parties: number;
  invited: number;
  attending: number;
  declined: number;
  pending: number;
  flagged: number;
}

export async function getSummaryStats(client: PrismaClient): Promise<SummaryStats>;
```

One `client.$transaction([...])` of three reads, so the tiles are a consistent
snapshot rather than three separately-timed queries:

1. `party.count({ where: { deletedAt: null } })`
2. `guest.groupBy({ by: ['rsvpStatus'], _count: { _all: true }, where: LIVE_GUEST })`
3. `guest.count({ where: { ...LIVE_GUEST, flaggedForReview: true } })`

where `LIVE_GUEST = { deletedAt: null, party: { deletedAt: null } }`.

The party-level filter is redundant today — `softDeleteParty` cascades
`deletedAt` to its guests — but it is what `csvExport` already does, and it keeps
the stats honest if a row ever escapes that cascade.

**Two invariants the implementation must preserve:**

- Status counts are seeded from `RSVP_STATUS` so a status absent from the
  `groupBy` result reads `0`, never `undefined`.
- `invited` is the **sum of the three status counts**, not a fourth `count()`
  query. A separate count could disagree with the tiles it is meant to total.

## Shell and dashboard

- `src/app/admin/layout.tsx` (server) — calls `requireAdminSession()` for
  defense-in-depth alongside the proxy gate, then renders the header bar:
  wordmark, `AdminNav`, the signed-in email, and a sign-out `<form>` whose action
  is a server action calling `signOut({ redirectTo: '/signin' })`.
- `src/components/admin/AdminNav.tsx` — driven by a single `ADMIN_NAV_LINKS`
  array holding one entry (Dashboard → `/admin`) today. #69 and #70 append their
  own entries; no placeholder or disabled links now.
- `src/app/admin/page.tsx` (server) — `getSummaryStats(getPrismaClient())`, then
  `<StatGrid stats={...} />`.
- `src/components/admin/StatGrid.tsx` and `StatCard.tsx` — presentational, no
  client JS. `flagged` takes a distinct accent when greater than zero, since it
  is the only number that means "act on this"; the others are uniform sage cards.
- `src/app/admin/error.tsx` (`'use client'`) — "Couldn't load the dashboard. The
  database may still be waking up." plus a retry button calling `reset()`. Azure
  SQL serverless auto-pauses, so a cold start is the likeliest failure and retry
  is the right remedy.

Styling stays within existing conventions: Tailwind utilities only, the sage
palette and `font-serif` from `globals.css`, mobile-first with the `md:`
breakpoint.

## Tests

| File | Asserts |
| --- | --- |
| `src/lib/admin/callbackPath.test.ts` | absolute URL reduced to its path; non-`/admin` path rejected; `//evil.example/admin` rejected; `/adminx` rejected; undefined and unparseable input return `/admin`; query string preserved |
| `test/db/admin-stats.test.ts` | counts by status; soft-deleted guest excluded; guest of a soft-deleted party excluded; flagged counted; `invited === attending + declined + pending`; empty database returns all zeros |
| `src/components/admin/SignInForm.test.tsx` | failed sign-in renders the alert and does **not** navigate; successful sign-in navigates to the passed callback path |
| `src/components/admin/StatGrid.test.tsx` | renders all six labels and values; a zero renders `0` rather than blank |

Database tests belong in `test/db/`; that directory is the one Vitest project
running with `fileParallelism: false`, and a DB test placed elsewhere would race.

## Verification

The gate mirrors CI: `npm run lint && npm run check:images && npm test && npm run
build`, plus a container build for parity.

Because the deliverable is a **restriction**, the runtime check must prove both
directions against a running dev server:

- **Denial** — `curl -i /admin` with no cookie returns a redirect to `/signin`.
- **Authorized** — signing in through the real form lands on `/admin`, and the
  rendered tiles match `getSummaryStats` run against the seeded database. Signing
  out returns the visitor to `/signin`, and `/admin` bounces again.
