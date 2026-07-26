# Admin Auth — Design

Issue: #63 (wave 0 of the RSVP epic, #60)
Date: 2026-07-25

## Summary

Gate `/admin/*` pages and `/api/admin/*` route handlers behind an authenticated
admin session. Authentication is a single local admin account whose scrypt
password hash lives in an environment variable; authorization is an email
allowlist — today a single entry, `ADMIN_EMAIL` — applied to every sign-in.
Sessions are JWTs issued by Auth.js — no database involvement.

This issue ships the **mechanism only**. It creates no admin page (#68) and no
admin API route (#65); it provides the session helper those issues consume.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Library | `next-auth` pinned to `5.0.0-beta.32` | Supplies JWT signing, session cookies, CSRF, and sign-in/out routes. Pre-GA, so pinned exactly and held there by a Dependabot ignore. |
| Provider | Credentials (local admin), not OAuth | No external identity provider to register, no cloud round-trip to develop against. Adding Google later is one provider entry — the allowlist already gates it. |
| Credential storage | `ADMIN_PASSWORD_HASH` env var / Container App secret | No schema change, no migration, and sign-in never touches Azure SQL — which is serverless with auto-pause, so a DB-backed login would pay a cold-start wake-up on the first sign-in after idle. |
| Hash | scrypt via `node:crypto`, compared with `timingSafeEqual` | Stdlib. No new production dependency, and no native bindings to break the Alpine Docker build. |
| Session | JWT, 8-hour `maxAge` | No adapter, so no DB dependency and no edge-runtime split-config problem. Eight hours suits an admin console. |
| Allowlist source | `ADMIN_EMAIL` env var, a single-entry list | One admin exists, so a second variable would only be a drift hazard — two values that must stay in sync, with a silent sign-in failure when they don't. The gate itself is real and enforced in the `signIn` callback; widening it to a comma-separated list is a one-line change when a second admin or provider arrives. |
| Email storage | Plaintext, not hashed | An email is an identifier, not a secret. It sits in the same store as `AUTH_SECRET`, and anyone who can read it can forge a session JWT outright — so hashing defends against no reachable attacker, while costing the ability to audit who holds access and to check an OAuth-supplied address against a known list. Sign-in failures are indistinguishable between "unknown email" and "wrong password", so the address cannot be enumerated. |

### Deviation from the RSVP high-level design

`docs/superpowers/specs/2026-07-17-rsvp-design.md` locked admin auth as "Auth.js
OAuth (Google/GitHub) + email allowlist", rationale "no password to store or
rotate". This design reverses that: one password hash is stored, as a secret,
and rotation means updating that secret.

The trade accepted in exchange: no Google Cloud project, no OAuth client
registration, no redirect-URI management per environment, and a flow that is
fully exercisable locally. The OAuth path is not closed — the allowlist is
enforced in the `signIn` callback, which runs for every provider, so adding
Google is a provider entry plus two env vars. The locked-decision row in the
RSVP design is updated to match.

## Components

Each unit below is independently testable and depends only on the environment.

### `src/lib/auth/allowlist.ts`

`isAdminEmail(email: string): boolean`. Parses `ADMIN_EMAIL` as a
comma-separated list — one entry today — trimming entries, dropping empties,
comparing case-insensitively. An unset or empty value denies everyone — failing
closed, never open.

This module is the **only** reader of `ADMIN_EMAIL`, so the admin identity has a
single source of truth.

### `src/lib/auth/credentials.ts`

`verifyAdminCredentials(email: string, password: string): Promise<boolean>` —
the admin-account policy. Delegates the identity check to `isAdminEmail` and the
hash comparison to `verifyPassword`, supplying `ADMIN_PASSWORD_HASH`. Returns
false for an unknown email, a bad password, or a malformed hash — the caller
never learns which.

Hash format, self-describing so parameters can change without a migration:

```
scrypt$<cost>$<blockSize>$<parallelization>$<base64-salt>$<base64-derived-key>
```

### `src/auth.ts`

`NextAuth({...})` exporting `{ handlers, auth, signIn, signOut }`. One
Credentials provider delegating to `verifyAdminCredentials`. A `signIn` callback
returning `false` when `isAdminEmail` rejects the address, which Auth.js surfaces
as `AccessDenied`. JWT strategy, 8-hour `maxAge`, `trustHost: true` for the
Cloudflare → Container Apps path.

### `src/lib/auth/session.ts`

`requireAdminSession()` — the seam #65 builds on. Returns the session when the
caller holds a valid one whose email is still allowlisted; otherwise returns a
`Response`: 401 when unauthenticated, 403 when authenticated but no longer
allowlisted. Re-checking the allowlist here means revoking an admin takes effect
on the next request rather than at token expiry.

### `src/app/api/auth/[...nextauth]/route.ts`

`export const { GET, POST } = handlers`.

### `src/proxy.ts`

Next.js 16 renamed `middleware.ts` to `proxy.ts` (confirmed in this repo's
`next@16.2.10`: `PROXY_LOCATION_REGEXP = (?:src/)?proxy`). Exports
`{ auth as proxy }` with a matcher of `['/admin/:path*', '/api/admin/:path*']`.
Unauthenticated page requests redirect to sign-in.

Protection is deliberately two-layered: the proxy covers whole route trees, and
`requireAdminSession()` re-checks inside each admin handler. A matcher typo
should degrade to a 401, not to an open endpoint.

### `src/lib/auth/scrypt.ts`

`hashPassword(password)` and `verifyPassword(password, storedHash)` — the scrypt
primitives, importing nothing but `node:crypto`. Kept free of the `@/` alias so
the CLI script below can import it directly under `tsx`.

### `scripts/hash-admin-password.ts`

Run via `npm run auth:hash`. Prompts for a password with echo suppressed and
prints the `ADMIN_PASSWORD_HASH=...` line. It imports `hashPassword` rather than
reimplementing it, so the hash it prints cannot drift from what the verifier
expects. The plaintext is never written to disk and never enters shell history.

## Configuration

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | JWT signing key. Required at request time. |
| `AUTH_TRUST_HOST` | `true` — trust `X-Forwarded-*` behind Cloudflare → Container Apps. |
| `ADMIN_EMAIL` | The admin account's address, and the allowlist. Comma-separated; one entry today. |
| `ADMIN_PASSWORD_HASH` | scrypt hash, format above. |

**Every one of these is read lazily, inside the function that needs it — never
at module top-level.** `src/proxy.ts` imports `src/auth.ts`, so a top-level
throw (the pattern `src/lib/prisma.ts` uses for `DATABASE_URL`) would fail
`next build` and `docker build`, neither of which has secrets. Missing
configuration therefore fails loudly on the first request instead of at import.

`.env.example` gains placeholders. `.env` is already gitignored.

## Error handling

- Missing or malformed `ADMIN_PASSWORD_HASH` → verification returns false and a
  descriptive error is logged server-side. Sign-in fails closed.
- Missing `ADMIN_EMAIL` → everyone denied.
- Denied allowlist → Auth.js `AccessDenied`; the submitted address is not echoed
  back to the client.
- No credential detail distinguishes "unknown email" from "wrong password".

## Testing

Vitest, asserting behavior:

- **allowlist** — single entry, multiple entries, whitespace, case-insensitivity,
  unset and empty (both deny), an address absent from a populated list.
- **credentials** — correct password accepts; wrong password rejects; unknown
  email rejects; malformed and absent hash reject; a hash produced by the script
  verifies (round-trip).
- **session** — 401 unauthenticated; 403 authenticated but de-allowlisted;
  session returned when valid.

Browser verification (the mechanism has no UI of its own, so evidence comes from
Auth.js's built-in endpoints):

1. Unauthenticated `/admin` redirects to the sign-in page.
2. Wrong password is rejected.
3. A non-allowlisted address is denied with `AccessDenied`.
4. Correct allowlisted credentials establish a session, visible at
   `/api/auth/session`.
5. `/admin` then falls through to 404 rather than redirecting — proving the gate
   opened, without building #68's page.

## Out of scope

- `/admin` pages and sign-in/out UI — #68.
- `/api/admin/*` routes — #65, consuming `requireAdminSession()`.
- Terraform / Container App secrets, GitHub repo variables — deferred until
  `/admin` actually deploys.
- Google or GitHub OAuth providers.
- **Sign-in rate limiting / lockout.** scrypt makes each guess cost ~100ms, and
  Cloudflare fronts the app, but nothing throttles repeated failed attempts.
  This is the real defense against password guessing and needs a store for
  attempt counts, so it is its own issue — filed as a follow-up and referenced
  from this PR.
