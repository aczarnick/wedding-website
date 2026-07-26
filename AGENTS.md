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

`/admin/*` and `/api/admin/*` are gated by `src/proxy.ts` (Next.js 16's renamed `middleware.ts`), which re-exports the Auth.js `auth()` function from `src/auth.ts` as its `proxy` export and matches on those two path prefixes. The matcher is case-sensitive, so any admin route added later must be lowercase to be covered.

`src/auth.ts` configures a single Auth.js Credentials provider backed by one local admin account: `authorize()` calls `verifyAdminCredentials()` (`src/lib/auth/credentials.ts`), which checks the submitted email against the allowlist and the submitted password against a scrypt hash in `ADMIN_PASSWORD_HASH`. The scrypt primitives (`hashPassword`, `verifyPassword`) live in `src/lib/auth/scrypt.ts`, separate from that admin-specific policy — `scrypt.ts` imports only `node:crypto`/`node:util`, so `scripts/hash-admin-password.ts` (`npm run auth:hash`) can import it directly via `tsx` without pulling in the rest of the app. The allowlist itself (`src/lib/auth/allowlist.ts`) is a single function, `isAdminEmail()`, whose only reader is `ADMIN_EMAIL` — a comma-separated list, one entry today — and it's also enforced independently in the `signIn` callback in `auth.ts`, so it applies to any provider added later, not just Credentials. Sessions are JWTs (8-hour max age); no database is involved.

Route handlers call `requireAdminSession()` from `src/lib/auth/session.ts`, which returns either the admin email or a ready-to-return 401/403 `Response` (401 unauthenticated, 403 authenticated but no longer allowlisted).

All auth environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`) are read **inside functions, never at module top level** — `src/proxy.ts` imports `src/auth.ts`, so a top-level throw would break `next build` and `docker build`, neither of which has secrets.

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
