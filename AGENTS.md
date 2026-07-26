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

Wedding website (wedding date: October 10, 2026, hardcoded in `src/utils/dateUtils.ts`) built with Next.js 16 App Router + React 19 + TypeScript strict mode + Tailwind CSS v4. No backend API — all content is static data in `src/constants/*`.

### Data-driven page composition

`src/app/page.tsx` (server component) is the main landing page. It composes presentational components fed entirely by typed constants:

- `src/constants/events.ts` — `EVENTS` record (ceremony, reception) rendered via `EventSection`; also exports `NAV_LINKS`
- `src/constants/hotels.ts` — `HOTELS` record rendered via `TravelSection`
- `src/constants/faqs.ts` — `FAQS` array rendered via `FAQSection`

To change site content, edit the constants — not the components.

### Navigation ↔ section ID coupling

`NAV_LINKS` in `src/constants/events.ts` drives both desktop and mobile nav in `Header.tsx`. `Registry` and `Gallery` are route links (`/registry` redirects to The Knot via `REGISTRY_URL` in `src/constants/registry.ts`; `/gallery` is a "Coming Soon" placeholder page); all other links are `/#SectionId` hash links that must match the `id` props on the divider components in `page.tsx` (`Details`, `Travel`, `FAQs`). The dividers (`src/components/dividers/`) are layout wrappers whose `id` prop doubles as the scroll anchor target.

Adding a section: wrap content in a divider with an `id`, add that id string to `NAV_LINKS`. Adding a page route: create `src/app/<name>/page.tsx`, add the capitalized name to `NAV_LINKS`, and update the `isRouteLink` helper in `Header.tsx`.

### Client/server boundary

`'use client'` only on components using state/hooks: `Header.tsx` (mobile drawer) and `HeroSection.tsx`. The countdown (`DaysUntilWedding()`) is deliberately computed client-side in a `useEffect` inside `HeroSection` — initial state is a non-breaking space — to avoid both hydration mismatches and a stale build-time value. Don't move it to the server or call it during render.

### Admin auth

`/admin/*` and `/api/admin/*` are gated by `src/proxy.ts` (Next.js 16's renamed `middleware.ts`), which wraps the Auth.js `auth()` function from `src/auth.ts` and matches on those two path prefixes. The matcher is case-sensitive, so any admin route added later must be lowercase to be covered.

The proxy decides the response rather than deferring to Auth.js: an allowlisted session passes through, an unauthenticated or de-allowlisted request to `/api/admin/*` gets a JSON **401**, and the same request to a page path gets a **redirect** to the sign-in page. Returning the bare `auth` export instead would be a security bug — on its own it only attaches `req.auth` and lets every matched request through — and redirecting an API client to an HTML sign-in page would break any caller expecting JSON.

`src/auth.ts` configures a single Auth.js Credentials provider backed by one local admin account: `authorize()` calls `verifyAdminCredentials()` (`src/lib/auth/credentials.ts`), which checks the submitted email against the allowlist and the submitted password against a scrypt hash in `ADMIN_PASSWORD_HASH`. The scrypt primitives (`hashPassword`, `verifyPassword`) live in `src/lib/auth/scrypt.ts`, separate from that admin-specific policy — `scrypt.ts` imports only `node:crypto`/`node:util`, so `scripts/hash-admin-password.ts` (`npm run auth:hash`) can import it directly via `tsx` without pulling in the rest of the app. The allowlist itself (`src/lib/auth/allowlist.ts`) is a single function, `isAdminEmail()`, and is the only reader of `ADMIN_EMAIL` — a comma-separated list, one entry today. It is enforced independently in the `signIn` callback in `auth.ts`, so it applies to any provider added later, not just Credentials. Sessions are JWTs (8-hour max age); no database is involved.

Route handlers call `requireAdminSession()` from `src/lib/auth/session.ts`, which returns either the admin email or a ready-to-return 401/403 `Response` (401 unauthenticated, 403 authenticated but no longer allowlisted).

All auth environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`) are read **inside functions, never at module top level** — `src/proxy.ts` imports `src/auth.ts`, so a top-level throw would break `next build` and `docker build`, neither of which has secrets.

### RSVP guest API

`/api/parties/*` is the public, unauthenticated guest surface: `GET /search?q=` (exact full-name lookup), `GET /:id`, and `PATCH /:id/rsvp` (transactional submit). It is deliberately **not** matched by `src/proxy.ts` — only `/admin/*` and `/api/admin/*` are gated.

Logic is split so the rules are testable without a database: `src/lib/rsvp/policy.ts` holds pure functions (name splitting, deadline check, guest-set reconciliation, add-guest cap) whose tests run in CI; `src/lib/rsvp/parties.ts` owns the queries and the submit transaction and takes the Prisma client as an explicit argument, so the integration suite can pass its own. Route handlers only parse, call, and map `RsvpError` to a status via `errorResponse`. Errors always render as `{ error, code }`.

All three endpoints return **403 `rsvp_closed`** once `Settings.rsvpDeadline` has passed — reads included. This supersedes the epic's "then read-only".

A submit must declare the party's complete guest set; a set that no longer matches the database gets **409 `party_changed`** rather than having its edits silently dropped. `addGuestCap` counts only guests with `source = guest_added`. Guests can write `attending` and `declined` only — `pending` is a server-side initial state.

`src/lib/prisma.ts` exports `getPrismaClient()`, not a client instance: `DATABASE_URL` is read inside the function so `next build` and `docker build`, which have no secrets, can import route handlers. Never move it back to module scope.

Prisma's `mode: 'insensitive'` is PostgreSQL/MongoDB-only and errors on `sqlserver`. Case-insensitive matching comes from the database collation (`SQL_Latin1_General_CP1_CI_AS`).

The database-integration tests under `test/db/` reset the same tables, so `vitest.config.ts` splits the suite into two projects and runs the `db` project with `fileParallelism: false`. Adding another DB test file to that directory is safe; putting one elsewhere would race.

Design: `docs/superpowers/specs/2026-07-26-rsvp-guest-api-design.md`.

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
