# Implementation plan — admin data / changes / settings UI (#70)

Design: `2026-07-27-admin-data-changes-settings-ui-design.md`.

Four tasks. Task 1 is the shared foundation; tasks 2–4 are independent of each
other and each consume only task 1's exports. One task in flight at a time; a
task is done when `npm run lint && npm test && npm run build` is green.

Conventions that apply to every task (`AGENTS.md`): Tailwind only, `@/` alias for
imports, `'use client'` only where state or hooks are used, arrow-function
components typed `React.FC<Props>`, colocated `*.test.tsx`, doc comments on
exported APIs only, no comments narrating self-evident code.

Field styling should reuse the existing look — see `SignInForm.tsx`'s
`FIELD_CLASS` and `StatCard.tsx` for the sage palette in use.

---

## Task 1: Request helper and constants

**Produces**

`src/lib/admin/apiClient.ts`:

```ts
export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: Record<string, unknown>;
}

/** Calls an admin API route and returns its parsed JSON body. */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T>;
```

Behaviour:

- On a non-OK response, parse the `{ error, code, ...rest }` envelope and throw
  an `AdminRequestError` whose `message` is the API's `error`, `code` is its
  `code` (or `null` if absent), and `details` is every remaining top-level field
  — that is how callers reach `rowErrors`.
- If the error body is not JSON (a proxy or platform error page), throw an
  `AdminRequestError` with the status and a fallback message; do not let the
  parse failure escape as a different error type.
- A rejected `fetch` propagates as-is; callers distinguish it from
  `AdminRequestError` and render the network message.

`src/constants/admin.ts` (edit):

- `ADMIN_NAV_LINKS` gains, after Dashboard: `Data` → `/admin/data`, `Changes` →
  `/admin/changes`, `Settings` → `/admin/settings`.
- New `AUDIT_ACTION_LABELS: Record<AuditAction, string>` — a human label for each
  of the eleven `AUDIT_ACTION` values from `@/lib/enums`. Type it as
  `Record<AuditAction, string>` so a new action fails to compile here.
- Update the file comment that reserves nav space for issues #69 and #70 to
  mention only #69.

**Tests** — `src/lib/admin/apiClient.test.ts`: OK returns the parsed body; non-OK
throws with status, code, and the extra fields in `details`; a non-JSON error
body still throws `AdminRequestError` with the right status.

---

## Task 2: `/admin/data` — import and export

**Consumes** — `adminFetch`, `AdminRequestError` from task 1.

**Produces**

- `src/app/admin/data/page.tsx` (server) — heading, one line of prose, an export
  section with `<a href="/api/admin/export" download>Download CSV</a>` styled as
  a button, and `<ImportForm />`.
- `src/components/admin/ImportForm.tsx` (client) — a file input
  (`accept='.csv,text/csv'`), a submit button, and the request lifecycle. Sends
  the selected `File` as the request **body** (not `FormData`) to
  `POST /api/admin/import`. Submit is disabled with no file selected and while
  uploading. Clears any previous result when a new file is chosen.
- `src/components/admin/ImportResult.tsx` (presentational) — success renders the
  `partiesCreated` / `guestsCreated` counts; failure renders the API message, an
  explicit "Nothing was saved." line, and every row error as `Line <n>` plus its
  reason inside a `max-h-*` `overflow-y-auto` region.

The success response shape is `{ partiesCreated, guestsCreated }` (201). A
failure carries `rowErrors: { line, reason }[]` in `AdminRequestError.details`
for `invalid_csv`; `csv_too_large` (413) has no `rowErrors`, so the result
component must render a message-only failure correctly.

**Tests** — `ImportForm.test.tsx`: submit disabled until a file is chosen; a 201
renders both counts; an `invalid_csv` 400 renders every row error and the
"nothing was saved" statement; a 413 renders the server's message with no row
list. `ImportResult.test.tsx`: the two shapes render from props alone.

---

## Task 3: `/admin/changes` — change log

**Consumes** — `adminFetch`, `AdminRequestError` from task 1;
`AUDIT_ACTION_LABELS` from task 1.

**Produces**

- `src/app/admin/changes/page.tsx` (server) — heading, prose, `<AuditLogViewer />`.
- `src/components/admin/AuditLogViewer.tsx` (client) — fetches
  `GET /api/admin/audit?limit=50&offset=<n>` plus `&action=<a>` when filtered.
  Response shape is `{ entries: AuditEntryView[]; total: number }`; the
  `AuditEntryView` type is already exported from `@/lib/admin/audit` — import it
  rather than redeclaring it. Renders an action `<select>` ("All actions" plus
  one option per `AUDIT_ACTION_LABELS` entry), the entry list, a range readout
  (`x–y of total`), and Newer/Older buttons.
- `src/components/admin/AuditEntry.tsx` (presentational) — one `<details>`; the
  `<summary>` shows the formatted timestamp, action label, and actor email
  (falling back to the actor type when the email is null); the body shows
  `before` and `after` as `JSON.stringify(value, null, 2)` in `<pre>`, with an
  absent side rendered as `—`.

Rules:

- Changing the filter resets `offset` to 0.
- Newer is disabled at `offset === 0`; Older is disabled once
  `offset + limit >= total`.
- An unknown action string (one not in `AUDIT_ACTION_LABELS`) renders as the raw
  value rather than blank.

**Tests** — `AuditLogViewer.test.tsx`: entries render; selecting an action
refetches with `action=` and `offset=0` in the query; Older advances the offset
and Newer goes back; both are disabled at their respective ends; an empty result
renders an empty-state message. `AuditEntry.test.tsx`: summary fields render;
a null `before` renders the placeholder, not "null".

---

## Task 4: `/admin/settings` — RSVP settings

**Consumes** — `adminFetch`, `AdminRequestError` from task 1.

**Produces**

- `src/app/admin/settings/page.tsx` (server) — heading, prose, `<SettingsForm />`.
- `src/components/admin/SettingsForm.tsx` (client) — loads
  `GET /api/admin/settings` (`{ rsvpDeadline: string; defaultAddGuestCap: number }`,
  the `AdminSettings` type exported from `@/lib/admin/settings`) on mount, then
  renders the status line, the two fields, and Save.

Rules:

- `rsvpDeadline` is an ISO string; the field is `<input type="datetime-local">`,
  whose value is local wall-clock text. Converting in both directions must not
  drift: build the field value from the date's local components, and submit
  `new Date(fieldValue).toISOString()`.
- Beneath the field, echo the resolved deadline in prose with an explicit note
  that it is the local timezone.
- `defaultAddGuestCap` is `<input type="number" min='0' max='20'>`, matching the
  API's `z.int().min(0).max(20)`.
- Save sends **only** fields whose value differs from the loaded baseline —
  `PATCH` with an empty object is a 400 by design. Save is disabled when the form
  is clean or a request is in flight.
- A successful save replaces the baseline with the response, so the form becomes
  clean again and a second Save is not offered for the same edit.
- The status line derives from the loaded deadline against `new Date()`: open
  with whole days remaining, or closed with the date it closed.

**Tests** — `SettingsForm.test.tsx` with `vi.setSystemTime()` pinned: loaded
values populate both fields; Save is disabled when clean; editing only the cap
sends a body with only `defaultAddGuestCap`; the deadline round-trips ISO ↔
`datetime-local`; the status line reads open before the deadline and closed
after; a failed save surfaces the API message.

---

## Definition of done

`npm run lint && npm run check:images && npm test && npm run build` green, then
the browser verification in the design's final section, then the container build.
