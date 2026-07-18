# RSVP Feature — High-Level Design

**Date:** 2026-07-17
**Status:** Approved (design); implementation not started
**Wedding date:** October 10, 2026

## Summary

Add RSVP functionality to the wedding website: a "The Knot"-style guest flow
(name lookup → edit your party's RSVPs → optionally add guests → submit) and an
admin dashboard to manage the guest list, moderate additions, review a change
log, and export results. All work stays inside the existing Next.js Container
App on Azure; the only new cloud resource is an Azure SQL serverless database.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| API location | Next.js API routes in the existing app | One image, one deploy, one Container App; no CORS boundary or second CI pipeline. Right scale for ~150 guests. |
| Datastore | Azure SQL Database, serverless (auto-pause) | Relational data fits parties→guests exactly; cheapest true scale-to-zero relational option on Azure (~$5/mo idle floor); real JOINs for admin reporting. |
| Guest gate | Name lookup only + admin change log | Lowest friction, matches The Knot; open lookup risk is bounded by an audit trail so tampering is visible and reversible. |
| RSVP granularity | Single yes/no for the whole wedding | Simpler model and UI; per-event headcount not needed. |
| Collected data | Song request (per guest) + message to the couple (per party) | No dietary/meal capture in scope. |
| Plus-ones / added guests | Anyone can add guests, soft cap ~5 per party + admin moderation | Preserves open UX while bounding worst-case headcount; added guests are flagged for admin review. |
| Admin auth | Auth.js OAuth (Google/GitHub) + email allowlist | No password to store or rotate; standard Next.js pattern; secure for 1–2 admins. |
| Email | None — on-screen confirmation only | Admin dashboard is source of truth; email deferred as an optional, dependency-free follow-up. |
| Guest-list seeding | CSV import + manual admin CRUD | Bulk initial load plus ongoing edits. |
| Editing window | Editable until a configurable deadline, then read-only | Matches real wedding logistics; supports a hard headcount freeze. |

## Architecture & topology

No new compute. The existing Next.js Container App gains three surfaces:

- `/api/*` — REST/CRUD route handlers, split by auth (guest-public vs admin).
- `/rsvp` — the guest wizard pages.
- `/admin/*` — the auth-gated dashboard pages.

One new Azure resource type: an **Azure SQL logical server + one serverless
database per environment** (staging, production), Terraform-managed alongside
the existing stack.

- **ORM: Prisma** — chosen over Drizzle for mature SQL Server support and
  first-class migrations (needed to evolve schema across staging → production).
- **DB auth: managed identity (passwordless) preferred**, with a Key Vault
  connection-string fallback if Prisma's Azure AD token path proves fiddly.
  Decided inside the infra issue.

## Data model (relational, 4 tables)

All primary keys are **UUIDs, not sequential ints**, so parties are not
guessable/enumerable — the key hardening move given open name lookup.

- **Party** — `id (uuid)`, `displayName`, `message` (to the couple, nullable),
  `addGuestCap` (default 5), `createdAt`, `updatedAt`.
- **Guest** — `id (uuid)`, `partyId (FK)`, `firstName`, `lastName`,
  `rsvpStatus` (`pending | attending | declined`), `songRequest` (nullable),
  `source` (`admin | guest_added`), `flaggedForReview` (bool), `createdAt`,
  `updatedAt`.
- **AuditEntry** — `id`, `partyId`, `guestId` (nullable), `action`,
  `actorType` (`guest | admin`), `actorEmail` (nullable), `before`/`after`
  (json), `ipAddress` (nullable), `createdAt`. Powers the admin change log.
- **Settings** — singleton row: `rsvpDeadline`, `defaultAddGuestCap`.

## Guest flow (`/rsvp` wizard)

1. Lookup by name.
2. Pick your party — disambiguate collisions by showing member first names.
3. Set yes/no per guest, add a song request per guest, optionally a message to
   the couple.
4. Optionally add guests, up to the party cap; added guests are flagged for
   admin review.
5. Submit as one transactional `PATCH`; show on-screen confirmation.
6. Re-openable and editable until the deadline, then read-only.

"Can't find yourself?" routes to a contact mailto — no self-registration; added
guests only attach to an existing party.

## Admin flow (`/admin`)

OAuth sign-in, email allowlist, middleware-protected routes. Surfaces:

- **Summary stats** — invited / attending / declined / pending / flagged.
- **Party + guest management** — CRUD, set cap, edit RSVP on behalf of a guest.
- **CSV import** — bulk seed parties + guests.
- **Moderation** — review flagged added-guests (approve / remove).
- **Change log** — audit-trail viewer.
- **Settings** — RSVP deadline, add-guest cap.
- **CSV export** — for the caterer/planner.

## API surface (REST)

**Guest (public):**

- `GET /api/parties/search?q=` — find parties by name.
- `GET /api/parties/:id` — party + guests (UUID id, not enumerable).
- `PATCH /api/parties/:id/rsvp` — statuses + song requests + message + added
  guests, in one transaction.

**Admin (authenticated):**

- `GET|POST|PATCH|DELETE /api/admin/parties[/:id]`
- `GET|POST|PATCH|DELETE /api/admin/guests[/:id]`
- `POST /api/admin/import` — CSV import.
- `GET /api/admin/export` — CSV export.
- `GET /api/admin/audit` — change log.
- `GET|PATCH /api/admin/settings`
- `POST /api/admin/guests/:id/moderate` — approve/remove flagged.

## Infra / CI changes (Terraform)

- Azure SQL server + serverless DB (auto-pause) per environment.
- Firewall: allow-Azure + managed identity (or Key Vault connection string).
- Auth.js secrets (OAuth client id/secret, `NEXTAUTH_SECRET`) via Container App
  secrets / Key Vault; admin-email allowlist as a GitHub repo variable.
- Add a migration step to `deploy.yml` (`prisma migrate deploy`) before
  promoting the image.
- Cost delta ≈ $5/mo idle floor — within existing guardrails.

## Sub-feature breakdown (GitHub epic + issues)

**Epic:** RSVP feature. Small, parallelizable issues in dependency waves.

**Wave 0 — foundation (parallel):**

1. Infra: Azure SQL serverless (Terraform) — server + DB per env, firewall,
   MI/secret, CI migration step.
2. Data layer: Prisma schema + migrations + seed (develop against a local SQL
   container immediately).
3. Auth: Auth.js OAuth + email allowlist + `/admin` route protection.

**Wave 1 — APIs (after #2, parallel):**

4. Guest API — search, get party, transactional RSVP submit, add-guest with cap
   + flag + audit.
5. Admin API — parties/guests CRUD, moderation, settings, audit read.
6. CSV import/export API.

**Wave 2 — UI (after respective APIs, parallel):**

7. Guest RSVP wizard UI (after #4).
8. Admin dashboard shell + stats (after #3, #5).
9. Admin party/guest management + moderation UI (after #5, #8).
10. Admin import/export + change-log + settings UI (after #6, #8).
11. Wire the existing site's RSVP button → `/rsvp` (tiny, after #7).

**Deferred / optional (no dependents):** Email confirmations via Azure
Communication Services.

Audit logging and tests are folded into each issue rather than split out (the
repo now has a vitest + RTL suite).
