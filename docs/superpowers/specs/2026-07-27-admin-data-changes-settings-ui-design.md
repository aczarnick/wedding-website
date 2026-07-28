# Admin import/export, change log, and settings UI — design

Issue #70 (wave 2, UI). Depends on #66 (CSV import/export API, merged as PR #88)
and #68 (admin console shell, merged as PR #93).

## Goal

Give the admin a browser surface for the three API capabilities that shipped in
wave 1 without a UI: bulk CSV import and export, the `AuditEntry` change log, and
the two RSVP settings (deadline, default add-guest cap).

Every API this consumes already exists and is tested. This task adds **no server
logic** — no route handlers, no services, no schema changes.

## Routes

Three new pages under the existing `/admin` shell. All lowercase: the matcher in
`src/proxy.ts` is case-sensitive, so a capitalised segment would be ungated.

| Route             | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `/admin/data`     | CSV import (upload + result report) and export    |
| `/admin/changes`  | Paginated, filterable change log                  |
| `/admin/settings` | RSVP deadline and default add-guest cap           |

`ADMIN_NAV_LINKS` (`src/constants/admin.ts`) gains `Data`, `Changes`, and
`Settings`, taking the console nav to four links.

Each `page.tsx` stays a **server component** holding the static heading and
prose, with one client island beneath it — the shape `/admin/page.tsx` already
uses. The export control is a plain `<a href="/api/admin/export" download>` in
the server page, because a download link needs no JavaScript.

## Data flow

Pages read and write exclusively through `/api/admin/*` from client components.
The API is the single enforcement path: `handleAdminRequest` resolves the session
and supplies the `actorEmail`/`ipAddress` that every audit entry is attributed
to, so no second attribution path is introduced.

| Surface           | Request                                                     |
| ----------------- | ----------------------------------------------------------- |
| Import            | `POST /api/admin/import`, the `File` as the **raw body**     |
| Export            | `GET /api/admin/export` via an anchor (browser download)     |
| Change log        | `GET /api/admin/audit?limit=50&offset=<n>[&action=<a>]`      |
| Settings load     | `GET /api/admin/settings`                                    |
| Settings save     | `PATCH /api/admin/settings` with **only changed fields**     |

The import route reads `request.text()`, so the form sends the `File` directly as
`body` — not `FormData`, which would arrive as a multipart envelope the route
does not parse.

`updateSettingsSchema` is built with `nonEmptyPatch`, which rejects `{}` with a
400. The form therefore sends only fields whose value differs from what was
loaded, and disables Save when nothing has changed.

Filter and pagination state live in React state, **not** the URL.
`useSearchParams()` in a client component requires a Suspense boundary and fails
`next build` without one — the trap `/signin` already documents. The cost is that
a filtered change-log view is not bookmarkable, which is acceptable for a
single-admin console.

## Shared request helper

`src/lib/admin/apiClient.ts` — browser-side, importing nothing server-side.

```ts
export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: Record<string, unknown>;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T>;
```

All three panels need the same behaviour on a non-OK response: read the API's
`{ error, code, ...details }` envelope and surface the server's own message
rather than a generic one. That is three usages, so it is extracted once.
`details` is what lets the import panel reach `rowErrors` without the helper
knowing anything about imports.

Loading and submitting state stays local to each component. Those shapes differ
per panel (one has no initial load at all), so factoring them would add coupling
without removing duplication.

A rejected `fetch` (network failure) surfaces as a fixed "Could not reach the
server" message; a non-OK response always surfaces the API's message.

### Expired sessions

`src/proxy.ts` redirects unauthenticated **page** navigations but answers
`/api/admin/*` with a JSON 401. A session that expires while the console is open
therefore shows up as a 401 on a background fetch, not a redirect. Each panel
renders a 401 as "Your session has expired." with a link to `/signin`, so the
admin is not left staring at a raw error.

## Components

All under `src/components/admin/`.

### `ImportForm` (client)

Owns the file selection and the request. States: idle, uploading, result. Submit
is disabled until a file is chosen and while uploading. Renders `<ImportResult>`.

No client-side size check. The server's 413 is the authority and its message
names the real limit; duplicating `MAX_IMPORT_BYTES` would pull `csvSchemas.ts`
and its zod/policy imports into the client bundle.

### `ImportResult` (presentational)

Two shapes, driven by props:

- **Success** — "Imported N parties and M guests."
- **Failure** — the API's message, an explicit statement that **nothing was
  saved**, and every `rowError` as `Line <n>` + reason in a scrollable region.
  All-or-nothing is the import's headline guarantee, so the report says so
  outright; and truncating the error list would hide work the admin still has to
  do before re-uploading.

A failure body carries `partiesCreated: 0, guestsCreated: 0`, which is what makes
the "nothing was saved" claim the server's, not the UI's.

### `AuditLogViewer` (client)

An action `<select>` (labels from `AUDIT_ACTION_LABELS`, plus "All actions"), the
entry list, and prev/next pagination over `limit=50`. Changing the filter resets
the offset to 0 — otherwise a filter with fewer results than the current offset
renders an empty page.

Newer/Older are disabled at the respective ends of the range.

### `AuditEntry` (presentational)

One entry is a `<details>` element: the `<summary>` carries timestamp, action
label, and actor; expanding reveals the before/after snapshots as formatted JSON
in `<pre>`. A native `<details>` needs no client JavaScript and degrades to a
readable stacked layout on mobile, where a five-column table would not.

`before` is `null` for a creation and `after` is `null` for a deletion; each is
labelled and the absent side reads as "—" rather than "null".

### `SettingsForm` (client)

Loads current settings on mount, then renders:

- A derived status line: RSVPs open with days remaining, or closed on a date.
- `rsvpDeadline` as `<input type="datetime-local">` in the browser's local
  timezone, converted to ISO on submit and back on load, with the resolved value
  echoed in prose beneath the field so the timezone is never implicit.
- `defaultAddGuestCap` as `<input type="number" min="0" max="20">`, matching the
  API's `z.int().min(0).max(20)`.

Save sends only changed fields and is disabled when the form is clean. A
successful save updates the loaded baseline so the form becomes clean again.

The status line is computed after the client-side load resolves, so there is no
server-rendered "now" to mismatch during hydration.

## Constants

`src/constants/admin.ts` gains `AUDIT_ACTION_LABELS`, a record keyed by
`AuditAction` giving each of the eleven actions a human label ("Settings
updated", "Import", …). Keying it by the `AuditAction` type makes a future action
a compile error here rather than a raw `snake_case` string leaking into the
filter dropdown.

The file's existing comment reserving nav space for issues #69 and #70 is updated
to reference only #69.

## Testing

Colocated Vitest + Testing Library tests per component, with `fetch` stubbed.
Tests assert behaviour, not implementation:

- `apiClient` — resolves the parsed body on OK; throws `AdminRequestError`
  carrying status, code, and the extra `details` fields on non-OK; surfaces a
  network rejection distinctly.
- `ImportForm` — submit disabled with no file; a 201 renders the counts; an
  `invalid_csv` 400 renders **every** row error and the "nothing was saved"
  statement; a 413 renders the server's size message.
- `AuditLogViewer` — renders returned entries; selecting an action refetches with
  `action=` in the query and `offset=0`; Older/Newer move the offset; both are
  disabled at their ends; a snapshot is reachable in the expanded entry.
- `SettingsForm` — loads current values into the fields; Save is disabled when
  clean; saving sends only the changed field; the deadline round-trips ISO ↔
  `datetime-local`; the status line reads open vs. closed against a pinned
  `vi.setSystemTime()`.

No database tests: this task adds no server code, and the underlying services are
already covered under `test/db/`.

## Browser verification

Beyond the gate, the deliverable is verified against a running app in both
directions:

- **Denied** — signed out, `/admin/data` redirects to `/signin`.
- **Authorized** — signed in: a valid CSV imports and reports its counts; an
  invalid CSV is rejected with the row list and creates nothing; export downloads
  a CSV; a settings change saves; the change log then shows the resulting
  `import` and `settings_updated` entries.

Import and the settings change both mutate shared state, so the database is
re-seeded afterwards.
