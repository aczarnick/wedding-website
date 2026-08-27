# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Copilot, etc.) working in this repository.

## Commands

- `npm run dev` — dev server at http://localhost:3000
- `npm run build` — production build; must pass with zero errors before any PR
- `npm run lint` — ESLint (`eslint-config-next`); add `--fix` to auto-correct
- `npm run start` — run production build
- `npm run check:images` — fails if any file under `public/images` exceeds size/dimension thresholds (`scripts/check-image-sizes.mjs`); CI-enforced

Validate app changes with `npm test` (Vitest, CI-enforced), `npm run build`, `npm run lint`, and `npm run check:images`.

For changes under `infra/terraform/`, CI additionally enforces `terraform fmt -check -recursive infra/terraform` and, per environment, `terraform -chdir=infra/terraform/environments/<env> init -backend=false && terraform validate`. Workflow file changes are checked with `actionlint`.

## Architecture

Wedding website (wedding date: October 10, 2026, hardcoded in `src/utils/dateUtils.ts`) built with Next.js 16 App Router + React 19 + TypeScript strict mode + Tailwind CSS v4. The public site itself is static data in `src/constants/*`; the RSVP wizard and the admin console it feeds are backed by a SQL Server database via Prisma, documented in the API sections below.

### Data-driven page composition

`src/app/page.tsx` (server component) is the main landing page. It composes presentational components fed entirely by typed constants:

- `src/constants/events.ts` — `EVENTS` record (ceremony, reception) rendered via `EventSection`; also exports `NAV_LINKS`
- `src/constants/hotels.ts` — `HOTELS` record rendered via `TravelSection`
- `src/constants/faqs.ts` — `FAQS` array rendered via `FAQSection`

To change site content, edit the constants — not the components.

### Navigation ↔ section ID coupling

`NAV_LINKS` in `src/constants/events.ts` drives both desktop and mobile nav in `Header.tsx`. `Registry` and `RSVP` are route links (`/registry` redirects to The Knot via `REGISTRY_URL` in `src/constants/registry.ts`); all other links are `/#SectionId` hash links that must match the `id` props on the divider components in `page.tsx` (`Details`, `Travel`, `FAQs`). The dividers (`src/components/dividers/`) are layout wrappers whose `id` prop doubles as the scroll anchor target.

Adding a section: wrap content in a divider with an `id`, add that id string to `NAV_LINKS`. Adding a page route: create `src/app/<name>/page.tsx`, add the capitalized name to `NAV_LINKS`, and update the `isRouteLink` helper in `Header.tsx`.

### Client/server boundary

`'use client'` only on components using state/hooks: `Header.tsx` (mobile drawer) and `HeroSection.tsx`. The countdown (`DaysUntilWedding()`) is deliberately computed client-side in a `useEffect` inside `HeroSection` — initial state is a non-breaking space — to avoid both hydration mismatches and a stale build-time value. Don't move it to the server or call it during render.

### Admin auth

`/admin/*` and `/api/admin/*` are gated by `src/proxy.ts` (Next.js 16's renamed `middleware.ts`), which wraps the Auth.js `auth()` function from `src/auth.ts` and matches on those two path prefixes. The matcher is case-sensitive, so any admin route added later must be lowercase to be covered.

The proxy decides the response rather than deferring to Auth.js: an allowlisted session passes through, an unauthenticated or de-allowlisted request to `/api/admin/*` gets a JSON **401**, and the same request to a page path gets a **redirect** to the sign-in page. Returning the bare `auth` export instead would be a security bug — on its own it only attaches `req.auth` and lets every matched request through — and redirecting an API client to an HTML sign-in page would break any caller expecting JSON.

`src/auth.ts` configures a single Auth.js Credentials provider backed by one local admin account: `authorize()` calls `verifyAdminCredentials()` (`src/lib/auth/credentials.ts`), which checks the submitted email against the allowlist and the submitted password against a scrypt hash in `ADMIN_PASSWORD_HASH`. The scrypt primitives (`hashPassword`, `verifyPassword`) live in `src/lib/auth/scrypt.ts`, separate from that admin-specific policy — `scrypt.ts` imports only `node:crypto`/`node:util`, so `scripts/hash-admin-password.ts` (`npm run auth:hash`) can import it directly via `tsx` without pulling in the rest of the app. The allowlist itself (`src/lib/auth/allowlist.ts`) is a single function, `isAdminEmail()`, and is the only reader of `ADMIN_EMAIL` — a comma-separated list, one entry today. It is enforced independently in the `signIn` callback in `auth.ts`, so it applies to any provider added later, not just Credentials. Sessions are JWTs (8-hour max age); no database is involved.

Route handlers call `requireAdminSession()` from `src/lib/auth/session.ts`, which returns either the admin email or a ready-to-return 401/403 `Response` (401 unauthenticated, 403 authenticated but no longer allowlisted).

All auth environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`) are read **inside functions, never at module top level** — `src/proxy.ts` imports `src/auth.ts`, so a top-level throw would break `next build` and `docker build`, neither of which has secrets.

### Admin console UI

`/admin` is the console shell: `src/app/admin/layout.tsx` renders the header, nav
(`ADMIN_NAV_LINKS` in `src/constants/admin.ts`), signed-in email, and a sign-out
server action; `src/app/admin/page.tsx` renders the summary tiles.

The sign-in page lives at **`/signin`**, deliberately outside the `/admin/*`
proxy matcher — a page at `/admin/signin` would be gated by `src/proxy.ts` and
redirect to itself forever. `pages.signIn` in `src/auth.ts` and `SIGN_IN_PATH` in
`src/proxy.ts` must both point at it.

`proxy.ts` writes the *absolute* request URL into `?callbackUrl=`, which makes
that parameter attacker-controllable. `resolveAdminCallbackPath()`
(`src/lib/admin/callbackPath.ts`) is the only thing that may turn it into a
destination: it returns a path, never an origin, and only when that path
addresses `/admin`. Never navigate to a raw `callbackUrl`.

The page reads `callbackUrl` server-side and passes it to `SignInForm` as a prop.
Reading it with `useSearchParams()` in the client component would need a suspense
boundary and fails `next build` without one. Sign-in failures render one generic
"Incorrect email or password" — the same text for an unknown address as for a bad
password, so the form cannot be used to enumerate admins.

The layout re-checks the session itself rather than calling
`requireAdminSession()`: that helper answers with a JSON `Response` built for
route handlers, whereas a browser navigating to a page needs a redirect.

Dashboard totals come from `getSummaryStats()` (`src/lib/admin/stats.ts`), one
`$transaction` so the tiles are a single snapshot. `invited` is the sum of the
three status counts, never a separate query that could disagree with them, and
every count filters `deletedAt: null` on the guest *and* its party.

`/admin/parties` and `/admin/moderation` are the management screens. Both are thin
server pages rendering one client component, and every read and write goes through
`/api/admin/*` via `src/lib/admin/client.ts` — never through the services directly.
Routing mutations through the API keeps `handleAdminRequest()` as the single audited
entry path, so no second code path can write without an `actorEmail`.

Search and the status filter are **client-side** (`filterParties` in
`src/lib/admin/partyList.ts`): `GET /api/admin/parties` already returns every live
party with its live guests nested, so the whole screen is one request. Search spans
guest names as well as the party display name.

Every mutation is followed by a re-fetch rather than a local merge, because the server
orders parties by `displayName` and guests by `(createdAt, id)` — reproducing that
ordering on the client would be a second source of truth. Expanded-row state is keyed
by party id, so it survives the refresh.

Both screens read through `useLoadableResource` (`src/lib/admin/useLoadableResource.ts`),
the read-side mirror of `useAdminMutation`: it owns the mount fetch, the error message,
and the `reload` that every mutation calls. Its `load` argument **must** be a stable
reference — a module-level function or one wrapped in `useCallback` — or the mount
effect re-runs on every render and fetches forever; that is why `ModerationQueue`'s
two-endpoint `loadQueue` sits at module scope. The effect calls `reload` from a function
declared *inside* it, which is what satisfies the React Compiler's
`set-state-in-effect` rule; referencing `reload` directly from the effect body trips it
and would need an `eslint-disable`. The error clears at the start of `reload`, so a
retry click visibly flips to the loading state instead of leaving the failure frozen.

Destructive actions use `ConfirmButton`, never `window.confirm`: a native dialog blocks
every subsequent browser event, which breaks browser-driven verification of these
screens. Deleting a party warns that the delete cascades to its guests, matching
`softDeleteParty`.

The moderation queue fetches flagged guests **and** parties, because
`GET /api/admin/guests?flagged=true` carries only `partyId` and the question a moderator
is answering is which party added the plus-one. Approving clears the flag but leaves
`source = guest_added`, so the guest still counts against that party's add-guest cap —
the card says so, since it is otherwise invisible. A guest resolved elsewhere returns
**409 `guest_not_flagged`**, shown inline.

The per-party `addGuestCap` is edited here; the global `Settings.defaultAddGuestCap`
belongs to the settings screen (#70). `src/lib/http/apiClient.ts` holds the shared
`requestJson`/`ApiError` transport used by both the admin and the guest RSVP clients.

Design: `docs/superpowers/specs/2026-07-27-admin-dashboard-shell-design.md`,
`docs/superpowers/specs/2026-07-27-admin-party-guest-management-design.md`.

### RSVP guest API

`/api/parties/*` is the public, unauthenticated guest surface: `GET /search?q=` (exact full-name lookup), `GET /:id`, and `PATCH /:id/rsvp` (transactional submit). It is deliberately **not** matched by `src/proxy.ts` — only `/admin/*` and `/api/admin/*` are gated.

Logic is split so the rules are testable without a database: `src/lib/rsvp/policy.ts` holds pure functions (name splitting, deadline check, guest-set reconciliation, add-guest cap) whose tests run in CI; `src/lib/rsvp/parties.ts` owns the queries and the submit transaction and takes the Prisma client as an explicit argument, so the integration suite can pass its own. Route handlers only parse, call, and map `RsvpError` to a status via `errorResponse`. Errors always render as `{ error, code }`.

All three endpoints return **403 `rsvp_closed`** once `Settings.rsvpDeadline` has passed — reads included. This supersedes the epic's "then read-only".

A submit must declare the party's complete guest set; a set that no longer matches the database gets **409 `party_changed`** rather than having its edits silently dropped. `addGuestCap` counts only guests with `source = guest_added`. Guests can write `attending` and `declined` only — `pending` is a server-side initial state.

`src/lib/prisma.ts` exports `getPrismaClient()`, not a client instance: `DATABASE_URL` is read inside the function so `next build` and `docker build`, which have no secrets, can import route handlers. Never move it back to module scope.

Prisma's `mode: 'insensitive'` is PostgreSQL/MongoDB-only and errors on `sqlserver`. Case-insensitive matching comes from the database collation (`SQL_Latin1_General_CP1_CI_AS`).

The database-integration tests under `test/db/` reset the same tables, so `vitest.config.ts` splits the suite into two projects and runs the `db` project with `fileParallelism: false`. Adding another DB test file to that directory is safe; putting one elsewhere would race.

Design: `docs/superpowers/specs/2026-07-26-rsvp-guest-api-design.md`.

### Admin API

`/api/admin/*` is gated twice. `src/proxy.ts` rejects unauthenticated or de-allowlisted requests before any admin code runs, and every handler *also* calls `handleAdminRequest()` (`src/lib/admin/route.ts`), which independently resolves the session via `requireAdminSession()`. That's not belt-and-braces: the resolved email is what `writeAuditEntry` attributes the change to, so a handler cannot accidentally omit it. `handleAdminRequest` supplies the Prisma client, `actorEmail`, and `ipAddress` (via `clientIpAddress()`) to the handler, maps thrown `RsvpError`s to a response via `errorResponse`, and JSON-encodes the result. `parseJsonBody()` in the same file reads and Zod-validates the request body, returning **400 `invalid_request`** on malformed JSON or a failed schema — unlike the guest routes, which call `request.json()` unguarded and 500 on bad input; that's a known, separate gap this task didn't touch.

Endpoints (all Zod-validated against `src/lib/admin/schemas.ts`):

- `GET/POST /api/admin/parties`, `GET/PATCH/DELETE /api/admin/parties/:id`
- `GET/POST /api/admin/guests`, `GET/PATCH/DELETE /api/admin/guests/:id`
- `POST /api/admin/guests/:id/moderate` — approve or remove a flagged guest-added plus-one
- `GET/PATCH /api/admin/settings`
- `GET /api/admin/audit` — paginated change log, filterable by `partyId`, `guestId`, `action`

Every `DELETE` is a **soft delete**: `Party.deletedAt`/`Guest.deletedAt` get set rather than the row being removed, because a hard delete would violate the `AuditEntry` foreign key (`onDelete: NoAction`) once the row has change-log history. This makes `deletedAt: null` a filter every party/guest read must apply — in the admin API and the guest-facing `/api/parties/*` alike — or a "deleted" row reappears, including in the guest-facing RSVP wizard. Since `deletedAt` isn't a unique column, those lookups use `findFirst`, not `findUnique` (see `loadParty`/`loadGuest` in `src/lib/admin/parties.ts`/`guests.ts`).

Services (`src/lib/admin/{parties,guests,settings}.ts`) take `(client, audit, ...)` for writes and `(client, ...)` for reads; `AdminParty`/`AdminGuest` projections live once in `src/lib/admin/projections.ts` and are reused for both API responses and audit snapshots. Every mutation writes an `AuditEntry` (`writeAuditEntry` in `src/lib/admin/audit-log.ts`) inside the same `$transaction` as the write it describes, so an audit row exists if and only if the write committed. A settings change has `partyId: null` since it belongs to no party — the reason `AuditEntry.partyId` is nullable in `prisma/schema.prisma`.

Admins deliberately bypass the RSVP deadline: `requireRsvpOpen()` (`src/lib/rsvp/parties.ts`) is called only from the guest routes under `/api/parties/*`, never from an admin service, so parties and guests stay readable and editable from the admin console after `Settings.rsvpDeadline` passes.

Design: `docs/superpowers/specs/2026-07-26-rsvp-admin-api-design.md`.

### Admin CSV import/export

`POST /api/admin/import` takes a raw `text/csv` body; `GET /api/admin/export` returns one CSV row per guest. Both sit behind `src/proxy.ts` **and** call `requireAdminSession()` — the matcher is not the only gate, and import needs the session email for the audit trail. Neither is gated on `Settings.rsvpDeadline`: export exists to be run after it.

Both obey the soft-delete rule above: the export filters `deletedAt: null` on parties *and* guests, so a removed guest never reaches the caterer, and import's collision check considers only live parties — a soft-deleted display name is free to reuse, matching the fact that a deleted party is invisible everywhere else.

Import is **create-only and all-or-nothing**. A live display name that already exists is a reported row error, so a re-import can never overwrite a party that has responded. Created guests are forced to `pending` / `source=admin` / `flaggedForReview=false` regardless of the file, and unknown columns are ignored — together that makes re-feeding an export harmless.

Rows are grouped by `normalizeName(partyDisplayName).toLowerCase()`, matching the database's case-insensitive collation. `message` and `addGuestCap` are party-level: blank inherits, two different non-blank values conflict.

Error reports carry `{ line, reason }` for **every** bad row. The line number comes from `csv-parse`'s `info.lines`, never from an array index — a quoted field containing a newline spans several file lines and would desynchronize a counter.

Export escapes leading formula characters (`escape_formulas`) because song requests and messages are guest-supplied text that lands in a spreadsheet, and emits a UTF-8 BOM so Excel reads it correctly. `csv-stringify` casts booleans to `1`/`''` by default, so `flaggedForReview` uses an explicit cast. Import strips one leading `'` when a formula trigger follows it, so the export→import round trip is lossless.

Design: `docs/superpowers/specs/2026-07-26-rsvp-csv-import-export-design.md`.

## Conventions

- Tailwind utility classes only; no custom CSS components. Custom sage palette (`sage-50`…`sage-800`) and the Playfair Display font (`font-serif`) are defined in `src/app/globals.css` via `@theme inline`
- Path alias `@/` → `src/`
- Images: always Next.js `Image` with meaningful `alt`; local images imported as `StaticImageData` (see `HeroSection` and constants)
- Mobile-first responsive design; `md:` breakpoint toggles desktop vs. mobile nav

## Deployment & infrastructure

The site is a Docker image (Next.js standalone output — `output: 'standalone'` in `next.config.ts`) hosted on Azure Container Apps, with all infrastructure in Terraform and CI/CD in GitHub Actions. Full runbook (bootstrap, DNS/Cloudflare, rollback, teardown): `docs/deployment/README.md`.

### Terraform layout

`infra/terraform/environments/{shared,staging,production}` are three independent root modules sharing the reusable modules in `infra/terraform/modules/` (`env-stack`, `container-app`). Apply order is always **shared → staging → production** — staging/production read shared's remote state outputs (ACR, Log Analytics, identity). Terraform owns everything **except the running image tag**: deploys set it via `az containerapp update`, and the Container App resource uses `ignore_changes` to avoid drift.

Environment variables that CI passes come from GitHub repo variables (e.g. `ACR_NAME`, `ALLOWED_IP_RANGES_JSON`) — do not set them in local `terraform.tfvars`, the pipeline would revert them on the next apply.

### Workflows (`.github/workflows/`)

- `ci.yml` — every PR/push: lint, build, docker build, terraform fmt/validate, actionlint. PRs deliberately get **no cloud credentials**; keep it that way.
- `deploy.yml` — app-code pushes to `master`: builds one image, promotes the **same digest** staging → (approval) production, smoke-testing each. Manual dispatch with an `image` input is the rollback path. Runs are serialized via a `concurrency` group.
- `infra.yml` — pushes to `master` touching `infra/**`: applies shared → staging → production (`shared`/`production` need approval). Changing the workflow files themselves does **not** trigger an apply — dispatch it manually.
- `acr-purge.yml` — monthly cleanup of stale image tags.
- `scripts/bootstrap-azure.sh` — one-time, idempotent Owner-run setup of state storage, OIDC identities, RBAC, and GitHub variables/environments; everything else belongs in Terraform.

### Cost guardrails (pay-as-you-go, no hard cap)

Spend is bounded structurally, not by a spending limit: staging scales to zero (`min_replicas=0`), production keeps one warm replica (`min_replicas=1`, deliberate — no guest-facing cold starts, ~$3–14/mo), capped `max_replicas` (staging 1, production 2), ACR Basic, Log Analytics 1 GB/day quota, Cloudflare proxy in front, plus budget email alerts. Don't add premium SKUs or raise replica caps without flagging the cost implication.
