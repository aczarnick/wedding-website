# Admin Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `/admin/*` pages and `/api/admin/*` route handlers behind an authenticated, allowlisted admin session backed by a single env-configured local account.

**Architecture:** `next-auth` v5 supplies JWT sessions, CSRF, and sign-in/out routes. A Credentials provider authenticates one admin against a scrypt hash held in an environment variable; a `signIn` callback authorizes the address against an email allowlist. Protection is two-layered — `src/proxy.ts` covers whole route trees, and `requireAdminSession()` re-checks inside each admin handler.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.7, TypeScript strict, `next-auth@5.0.0-beta.32`, `node:crypto` scrypt, Vitest 4.

Spec: `docs/superpowers/specs/2026-07-25-admin-auth-design.md`

## Global Constraints

- `next-auth` is pinned to the exact version `5.0.0-beta.32` — no `^`, no `~`.
- **Never read `process.env` at module top level.** `src/proxy.ts` imports `src/auth.ts`, so a top-level throw breaks `next build` and `docker build`, which have no secrets. Read env inside the function that needs it.
- Fail closed: unset or empty configuration denies access; it never grants it.
- Never reveal which half of a credential was wrong, and never echo a submitted address back to the client.
- Path alias `@/` → `src/`. Tailwind utility classes only; no custom CSS.
- Tests assert behavior, arrange-act-assert. No comments on self-explanatory private code.
- The gate for every task: `npm run lint && npm test` must pass before commit.
- This issue ships the mechanism only. Create **no** `/admin` page (#68) and **no** `/api/admin/*` route (#65).

---

### Task 1: Install and pin next-auth

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: the `next-auth` module, importable as `next-auth` and `next-auth/providers/credentials`.

- [ ] **Step 1: Install the exact version**

```bash
npm install --save-exact next-auth@5.0.0-beta.32
```

- [ ] **Step 2: Verify the pin has no range prefix**

Run: `node -e "console.log(require('./package.json').dependencies['next-auth'])"`
Expected output exactly: `5.0.0-beta.32`

If it shows `^5.0.0-beta.32`, edit `package.json` to remove the caret and re-run `npm install`.

- [ ] **Step 3: Verify the install did not prune cross-platform optional dependencies**

This repo has been bitten before by `npm install` on macOS dropping Linux/WASM optional deps, which breaks `npm ci` in CI.

Run: `git diff --stat package-lock.json` then `npm ci --dry-run 2>&1 | tail -5`
Expected: `npm ci --dry-run` completes without error. If `git diff package-lock.json` shows removals of `@emnapi/*` or other `*-wasm32-wasi` / `*-linux-*` entries, restore them — the lockfile must keep the complete cross-platform tree.

- [ ] **Step 4: Hold the major with a Dependabot ignore**

Read `.github/dependabot.yml` first and match its existing structure. In the npm ecosystem entry, add to the existing `ignore` list:

```yaml
      - dependency-name: "next-auth"
        update-types: ["version-update:semver-major", "version-update:semver-minor", "version-update:semver-patch"]
```

The pin is deliberate — a pre-GA dependency in the auth path should move only when someone chooses to move it.

- [ ] **Step 5: Verify the workflow file still parses**

Run: `npx --yes actionlint -version >/dev/null 2>&1; python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml')); print('dependabot.yml OK')"`
Expected: `dependabot.yml OK`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .github/dependabot.yml
git commit -m "chore: pin next-auth 5.0.0-beta.32 for admin auth (#63)"
```

---

### Task 2: Email allowlist

**Files:**
- Create: `src/lib/auth/allowlist.ts`
- Test: `src/lib/auth/allowlist.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isAdminEmail(email: string): boolean` — reads `ADMIN_EMAIL` at call time. This module is the only reader of `ADMIN_EMAIL`; every other unit asks it rather than reading the variable again.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/allowlist.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminEmail } from '@/lib/auth/allowlist';

function withAllowlist(value: string | undefined) {
  vi.stubEnv('ADMIN_EMAIL', value ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAdminEmail', () => {
  it('accepts the single allowlisted address', () => {
    withAllowlist('admin@example.com');
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });

  it('accepts any address in a multi-entry list', () => {
    withAllowlist('one@example.com,two@example.com');
    expect(isAdminEmail('two@example.com')).toBe(true);
  });

  it('ignores surrounding whitespace in the list and the input', () => {
    withAllowlist('  one@example.com ,  two@example.com  ');
    expect(isAdminEmail(' two@example.com ')).toBe(true);
  });

  it('compares case-insensitively', () => {
    withAllowlist('Admin@Example.COM');
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });

  it('rejects an address absent from a populated list', () => {
    withAllowlist('one@example.com');
    expect(isAdminEmail('intruder@example.com')).toBe(false);
  });

  it('denies everyone when the allowlist is unset', () => {
    withAllowlist(undefined);
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('denies everyone when the allowlist is empty or only separators', () => {
    withAllowlist(' , , ');
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('rejects an empty address even when the list contains an empty entry', () => {
    withAllowlist('one@example.com,');
    expect(isAdminEmail('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/auth/allowlist.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/allowlist`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/auth/allowlist.ts`:

```typescript
const ALLOWLIST_SEPARATOR = ',';

function parseAllowlist(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(ALLOWLIST_SEPARATOR)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Reports whether an address is authorized for admin access.
 * `ADMIN_EMAIL` is treated as a comma-separated allowlist — one entry today.
 * An unset or empty value denies everyone.
 */
export function isAdminEmail(email: string): boolean {
  const candidate = email.trim().toLowerCase();

  if (candidate.length === 0) {
    return false;
  }

  return parseAllowlist().includes(candidate);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/auth/allowlist.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/allowlist.ts src/lib/auth/allowlist.test.ts
git commit -m "feat: admin email allowlist (#63)"
```

---

### Task 3: scrypt password hashing and verification

**Files:**
- Create: `src/lib/auth/scrypt.ts`
- Create: `src/lib/auth/credentials.ts`
- Test: `src/lib/auth/credentials.test.ts`

**Interfaces:**
- Consumes: `isAdminEmail` (Task 2).
- Produces:
  - From `@/lib/auth/scrypt` — `hashPassword(password: string): Promise<string>` returning `scrypt$<cost>$<blockSize>$<parallelization>$<base64Salt>$<base64Key>`, and `verifyPassword(password: string, storedHash: string): Promise<boolean>`.
  - From `@/lib/auth/credentials` — `verifyAdminCredentials(email: string, password: string): Promise<boolean>`, which delegates identity to `isAdminEmail` and hashing to `verifyPassword`, reading `ADMIN_PASSWORD_HASH` at call time.

**Why two modules:** `scrypt.ts` holds the hashing primitives and imports nothing but `node:crypto` — no `@/` alias anywhere in its import chain. That is what lets Task 7's CLI script import the real hashing code rather than reimplementing its constants.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/credentials.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAdminCredentials } from '@/lib/auth/credentials';
import { hashPassword, verifyPassword } from '@/lib/auth/scrypt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function configureAdmin(email: string, password: string) {
  vi.stubEnv('ADMIN_EMAIL', email);
  vi.stubEnv('ADMIN_PASSWORD_HASH', await hashPassword(password));
}

describe('hashPassword', () => {
  it('produces a self-describing scrypt string', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.split('$')).toHaveLength(6);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('salts each hash so identical passwords differ', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');
    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  it('accepts the password that produced the hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects a malformed hash without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(false);
  });
});

describe('verifyAdminCredentials', () => {
  it('accepts the configured email and password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('matches the configured email case-insensitively', async () => {
    await configureAdmin('Admin@Example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'wrong password'),
    ).resolves.toBe(false);
  });

  it('rejects an unknown email', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('intruder@example.com', 'correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it('rejects when no admin is configured', async () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    vi.stubEnv('ADMIN_PASSWORD_HASH', '');
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects an address that is not the configured admin even with a valid hash', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('someone-else@example.com', 'correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'not-a-valid-hash');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects a hash naming an unsupported algorithm', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'bcrypt$16384$8$1$c2FsdA==$a2V5');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects an empty password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(verifyAdminCredentials('admin@example.com', '')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/auth/credentials.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/credentials`.

- [ ] **Step 3: Write the hashing primitives**

Create `src/lib/auth/scrypt.ts`. **Import nothing but `node:crypto` and `node:util` here** — Task 7's CLI script imports this module by relative path, and any `@/` alias in the chain would break it.

```typescript
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const ALGORITHM = 'scrypt';
const FIELD_SEPARATOR = '$';
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const DEFAULT_PARAMETERS = { cost: 16384, blockSize: 8, parallelization: 1 } as const;

type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
};

type ParsedHash = ScryptParameters & {
  salt: Buffer;
  key: Buffer;
};

async function deriveKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  return (await scryptAsync(password, salt, KEY_BYTES, {
    N: parameters.cost,
    r: parameters.blockSize,
    p: parameters.parallelization,
    maxmem: 256 * parameters.cost * parameters.blockSize,
  })) as Buffer;
}

function parseHash(stored: string): ParsedHash {
  const [algorithm, cost, blockSize, parallelization, salt, key] = stored.split(FIELD_SEPARATOR);

  if (algorithm !== ALGORITHM) {
    throw new Error(`Unsupported password hash algorithm: ${algorithm}`);
  }

  const parsed: ParsedHash = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt ?? '', 'base64'),
    key: Buffer.from(key ?? '', 'base64'),
  };

  const hasValidParameters = [parsed.cost, parsed.blockSize, parsed.parallelization].every(
    (value) => Number.isInteger(value) && value > 0,
  );

  if (!hasValidParameters || parsed.salt.length === 0 || parsed.key.length === 0) {
    throw new Error('Malformed password hash');
  }

  return parsed;
}

/**
 * Hashes a password with scrypt, returning a self-describing string that
 * carries its own salt and cost parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, DEFAULT_PARAMETERS);

  return [
    ALGORITHM,
    DEFAULT_PARAMETERS.cost,
    DEFAULT_PARAMETERS.blockSize,
    DEFAULT_PARAMETERS.parallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join(FIELD_SEPARATOR);
}

/**
 * Verifies a password against a stored scrypt hash.
 * Returns false rather than throwing when the stored hash is unusable.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (password.length === 0 || storedHash.trim().length === 0) {
    return false;
  }

  try {
    const { salt, key, ...parameters } = parseHash(storedHash.trim());
    const candidate = await deriveKey(password, salt, parameters);

    return candidate.length === key.length && timingSafeEqual(candidate, key);
  } catch (error) {
    console.error('Stored password hash is unusable', error);
    return false;
  }
}
```

- [ ] **Step 3b: Write the admin credential policy**

Create `src/lib/auth/credentials.ts`:

```typescript
import { isAdminEmail } from '@/lib/auth/allowlist';
import { verifyPassword } from '@/lib/auth/scrypt';

/**
 * Verifies a submitted email and password against the configured admin account.
 * Returns false for an unknown email, a wrong password, or unusable
 * configuration — the caller cannot distinguish the cases.
 */
export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const emailMatches = isAdminEmail(email);
  const passwordMatches = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH ?? '');

  return emailMatches && passwordMatches;
}
```

**Do not short-circuit on the email check.** Returning early when the email is unknown skips the ~100ms scrypt derivation, so an unknown address answers measurably faster than a known address with a wrong password — which leaks the admin address by timing. Always await the password work, then combine.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/auth/credentials.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/scrypt.ts src/lib/auth/credentials.ts src/lib/auth/credentials.test.ts
git commit -m "feat: scrypt admin credential verification (#63)"
```

---

### Task 4: Auth.js instance

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Consumes: `isAdminEmail` (Task 2), `verifyAdminCredentials` (Task 3).
- Produces: `handlers`, `auth`, `signIn`, `signOut` exported from `@/auth`. `auth()` resolves to a session whose `user.email` is the admin address, or `null`.

- [ ] **Step 1: Write the Auth.js configuration**

Create `src/auth.ts`:

```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { verifyAdminCredentials } from '@/lib/auth/credentials';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!(await verifyAdminCredentials(email, password))) {
          return null;
        }

        return { id: email.trim().toLowerCase(), email: email.trim().toLowerCase() };
      },
    }),
  ],
  callbacks: {
    signIn({ user }) {
      return isAdminEmail(user.email ?? '');
    },
  },
});
```

`trustHost` is set because production runs behind Cloudflare → Azure Container Apps, where the host arrives in `X-Forwarded-Host`.

- [ ] **Step 2: Expose the Auth.js route handlers**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
export { GET, POST } from '@/auth';
```

If `handlers` is not directly re-exportable as `GET`/`POST` in this version, use the explicit form instead:

```typescript
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

Prefer whichever compiles; verify in Step 3.

- [ ] **Step 3: Verify the app builds and typechecks**

Run: `npm run lint && npm run build 2>&1 | tail -20`
Expected: lint clean; build succeeds. Critically, the build must **not** fail on missing `AUTH_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD_HASH` — nothing reads env at module scope.

If the build fails complaining about env, find the top-level `process.env` read and move it inside a function.

- [ ] **Step 4: Verify the existing suite still passes**

Run: `npm test 2>&1 | tail -10`
Expected: all prior tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "feat: Auth.js credentials provider with allowlist gate (#63)"
```

---

### Task 5: Admin session helper

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Task 4), `isAdminEmail` (Task 2).
- Produces: `requireAdminSession(): Promise<AdminSessionResult>` where

```typescript
type AdminSessionResult =
  | { authorized: true; email: string }
  | { authorized: false; response: Response };
```

Issue #65's route handlers consume this: on `authorized: false` they return `result.response` unchanged; otherwise they proceed with `result.email`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/session.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth }));

import { requireAdminSession } from '@/lib/auth/session';

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  auth.mockReset();
});

describe('requireAdminSession', () => {
  it('authorizes a session whose email is allowlisted', async () => {
    auth.mockResolvedValue({ user: { email: 'admin@example.com' } });

    const result = await requireAdminSession();

    expect(result).toEqual({ authorized: true, email: 'admin@example.com' });
  });

  it('returns 401 when there is no session', async () => {
    auth.mockResolvedValue(null);

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(401);
  });

  it('returns 401 when the session carries no email', async () => {
    auth.mockResolvedValue({ user: {} });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(401);
  });

  it('returns 403 when the session email is no longer allowlisted', async () => {
    auth.mockResolvedValue({ user: { email: 'removed@example.com' } });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(403);
  });

  it('does not echo the rejected address back to the client', async () => {
    auth.mockResolvedValue({ user: { email: 'removed@example.com' } });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    await expect(result.response.text()).resolves.not.toContain('removed@example.com');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/auth/session.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/session`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/auth/session.ts`:

```typescript
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';

export type AdminSessionResult =
  | { authorized: true; email: string }
  | { authorized: false; response: Response };

function deny(status: number, message: string): AdminSessionResult {
  return {
    authorized: false,
    response: Response.json({ error: message }, { status }),
  };
}

/**
 * Resolves the current admin session for use in route handlers.
 * Returns 401 when unauthenticated and 403 when the authenticated address is
 * no longer allowlisted, so revoking an admin takes effect on the next request
 * rather than at token expiry.
 */
export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return deny(401, 'Authentication required');
  }

  if (!isAdminEmail(email)) {
    return deny(403, 'Not authorized');
  }

  return { authorized: true, email };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/auth/session.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: requireAdminSession helper for admin route handlers (#63)"
```

---

### Task 6: Route protection via proxy

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Task 4).
- Produces: request-time protection of `/admin/*` and `/api/admin/*`.

Next.js 16 renamed `middleware.ts` to `proxy.ts`. Confirmed in this repo's `next@16.2.10`: `node_modules/next/dist/lib/constants.js` defines `PROXY_LOCATION_REGEXP = (?:src/)?proxy`, so `src/proxy.ts` is the correct location alongside `src/app`.

- [ ] **Step 1: Write the proxy**

Create `src/proxy.ts`:

```typescript
export { auth as proxy } from '@/auth';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
```

- [ ] **Step 2: Verify Next.js picks the file up**

Run: `npm run build 2>&1 | grep -i -E "proxy|middleware|error" | head -10`
Expected: the build output lists a proxy/middleware entry. If nothing appears, the file is not being detected — confirm it sits at `src/proxy.ts` (sibling of `src/app`, not inside it).

- [ ] **Step 3: Verify the full gate**

Run: `npm run lint && npm run check:images && npm test && npm run build 2>&1 | tail -15`
Expected: all four green.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: protect /admin and /api/admin via Next 16 proxy (#63)"
```

---

### Task 7: Password hashing script and configuration docs

**Files:**
- Create: `scripts/hash-admin-password.ts`
- Modify: `package.json` (add the `auth:hash` script)
- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-07-17-rsvp-design.md`

**Interfaces:**
- Consumes: `hashPassword` from `src/lib/auth/scrypt.ts` (Task 3), imported by **relative** path.
- Produces: an operator-facing way to generate `ADMIN_PASSWORD_HASH`.

The script reimplements nothing. It is TypeScript run through `tsx` (already a devDependency, already used for `prisma/seed.ts`) and imports the same `hashPassword` the application uses, so the hash it prints cannot drift from the hash the verifier expects.

Use a **relative** import (`../src/lib/auth/scrypt`), not the `@/` alias — `tsx` is not configured for path aliases in this repo, and `scrypt.ts` was deliberately written with no alias in its import chain.

- [ ] **Step 1: Write the script**

Create `scripts/hash-admin-password.ts`:

```typescript
import { createInterface } from 'node:readline';
import { hashPassword } from '../src/lib/auth/scrypt';

const MINIMUM_PASSWORD_LENGTH = 12;

function promptSilently(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    const onData = (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === '\n' || char === '\r' || char === '') {
        process.stdin.removeListener('data', onData);
        return;
      }
      process.stdout.write('*');
    };

    process.stdout.write(question);
    process.stdin.on('data', onData);

    rl.question('', (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = await promptSilently('Admin password: ');

if (password.length < MINIMUM_PASSWORD_LENGTH) {
  console.error(`Refusing to hash a password shorter than ${MINIMUM_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const confirmation = await promptSilently('Confirm password: ');

if (confirmation !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

const hash = await hashPassword(password);

console.log('\nAdd this line to .env (never commit it):\n');
console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
```

- [ ] **Step 1b: Add the npm script**

In `package.json`, alongside the existing `db:*` scripts, add:

```json
    "auth:hash": "tsx scripts/hash-admin-password.ts",
```

- [ ] **Step 2: Verify the script round-trips against the verifier**

```bash
printf 'test-password-1234\ntest-password-1234\n' | npm run auth:hash --silent | grep ADMIN_PASSWORD_HASH
```

Expected: one `ADMIN_PASSWORD_HASH="scrypt$16384$8$1$...$..."` line.

Then confirm that exact hash verifies, substituting the value printed above:

```bash
ADMIN_PASSWORD_HASH='<paste hash>' npx tsx -e "import('./src/lib/auth/scrypt').then(async (m) => console.log(await m.verifyPassword('test-password-1234', process.env.ADMIN_PASSWORD_HASH)))"
```

Expected output: `true`.

If `tsx` cannot resolve the relative import, check that `scripts/hash-admin-password.ts` imports `../src/lib/auth/scrypt` and that `scrypt.ts` imports only `node:` builtins. Do **not** fix this by copying the scrypt constants into the script — that reintroduces the drift this design removes.

- [ ] **Step 3: Document the environment variables**

Append to `.env.example`:

```bash
# Admin auth (issue #63). Generate the hash with:
#   npm run auth:hash
# AUTH_SECRET: generate with `openssl rand -base64 32`.
# ADMIN_EMAIL doubles as the authorization allowlist; comma-separate to add admins.
AUTH_SECRET=""
AUTH_TRUST_HOST="true"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD_HASH=""
```

- [ ] **Step 4: Document the auth surface in AGENTS.md**

Read `AGENTS.md` and add a subsection under **Architecture**, matching the surrounding prose style:

```markdown
### Admin auth

`/admin/*` and `/api/admin/*` are gated by `src/proxy.ts` (Next.js 16's renamed `middleware.ts`), which delegates to the Auth.js instance in `src/auth.ts`. Authentication is a single local admin — `ADMIN_EMAIL` plus a scrypt hash in `ADMIN_PASSWORD_HASH`, generated by `npm run auth:hash`. `ADMIN_EMAIL` doubles as the authorization allowlist (comma-separated; `src/lib/auth/allowlist.ts` is its only reader), enforced in the `signIn` callback so it applies to any provider added later. Sessions are JWTs; no database is involved.

Route handlers call `requireAdminSession()` from `src/lib/auth/session.ts`, which returns either the admin email or a ready-to-return 401/403 `Response`.

All auth environment variables are read **inside functions, never at module top level** — `src/proxy.ts` imports `src/auth.ts`, so a top-level throw would break `next build` and `docker build`, neither of which has secrets.
```

- [ ] **Step 5: Correct the superseded decision in the RSVP design**

In `docs/superpowers/specs/2026-07-17-rsvp-design.md`, replace the `| Admin auth |` table row with:

```markdown
| Admin auth | Local admin account (scrypt hash in env) + email allowlist | No external IdP to register and no redirect-URI management per environment; fully exercisable locally. Supersedes the original Auth.js OAuth choice — see `2026-07-25-admin-auth-design.md`. OAuth remains a drop-in: the allowlist is enforced in the `signIn` callback, which runs for every provider. |
```

Also update the "Infra / CI changes" bullet that reads "Auth.js secrets (OAuth client id/secret, `NEXTAUTH_SECRET`)" to:

```markdown
- Admin auth secrets (`AUTH_SECRET`, `ADMIN_PASSWORD_HASH`) via Container App secrets / Key Vault; `ADMIN_EMAIL` — which doubles as the allowlist — as a GitHub repo variable.
```

- [ ] **Step 6: Verify nothing secret is staged**

Run: `git status --short && git diff --cached --name-only | grep -E '^\.env$' && echo "STOP: .env staged" || echo ".env not staged"`
Expected: `.env not staged`.

- [ ] **Step 7: Commit**

```bash
git add scripts/hash-admin-password.ts package.json .env.example AGENTS.md docs/superpowers/specs/2026-07-17-rsvp-design.md
git commit -m "docs: admin auth configuration and password hashing script (#63)"
```

---

### Task 8: Browser verification

**Files:**
- Create (untracked, local only): `.env`

**Interfaces:**
- Consumes: everything above.
- Produces: the runtime evidence the issue's acceptance criteria require.

This mechanism ships no UI of its own — #68 owns the admin pages and sign-in styling — so evidence comes from Auth.js's built-in endpoints.

- [ ] **Step 1: Configure a local admin**

Generate a hash and assemble `.env` (already gitignored; keep the existing `DATABASE_URL` line):

```bash
npm run auth:hash                      # use: local-dev-password-123
openssl rand -base64 32                # value for AUTH_SECRET
```

Append `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `ADMIN_EMAIL=admin@example.com`, and the generated `ADMIN_PASSWORD_HASH` to `.env`.

- [ ] **Step 2: Start the dev server**

Use the `run-wedding-website` skill. Confirm it serves on http://localhost:3000.

- [ ] **Step 3: Verify unauthenticated /admin is blocked**

Navigate to `http://localhost:3000/admin`.
Expected: redirected to the Auth.js sign-in page showing Email and Password fields. Screenshot it.

- [ ] **Step 4: Verify a wrong password is rejected**

Submit `admin@example.com` with `wrong-password`.
Expected: sign-in fails; no session is created. Screenshot it.

- [ ] **Step 5: Verify a non-allowlisted address is denied**

Submit `intruder@example.com` with the correct password `local-dev-password-123`.
Expected: denied — no session is created. Screenshot it.

Note what this does and does not show. Because `ADMIN_EMAIL` is both the account identity and the allowlist, the rejection happens at the identity check; authentication and authorization cannot be separated at runtime while there is one admin. The independent authorization path — a session whose email has since been removed from the allowlist, yielding 403 rather than 401 — is covered by `src/lib/auth/session.test.ts`, and becomes browser-observable in #65 once an admin route exists to call `requireAdminSession()`.

- [ ] **Step 6: Verify a valid sign-in establishes a session**

Sign in with `admin@example.com` / `local-dev-password-123`, then navigate to `http://localhost:3000/api/auth/session`.
Expected: JSON containing `"email":"admin@example.com"`. Screenshot it.

- [ ] **Step 7: Verify the gate actually opened**

While signed in, navigate to `http://localhost:3000/admin`.
Expected: Next.js **404**, not a redirect to sign-in. The 404 is the correct result — the proxy allowed the request through and no page exists yet (#68 builds it). A redirect here would mean the session is not being read.

- [ ] **Step 8: Confirm no secret leaked into the repo**

Run: `git status --short`
Expected: `.env` does not appear (it is gitignored).

- [ ] **Step 9: Run the full gate one final time**

Run: `npm run lint && npm run check:images && npm test && npm run build 2>&1 | tail -15`
Expected: all green.

---

## Definition of done

- Full gate green: `npm run lint && npm run check:images && npm test && npm run build`.
- `docker build` (or `podman build`) succeeds — proving the image builds with **no** auth environment variables present.
- Browser evidence for all five behaviors in Task 8.
- No `/admin` page and no `/api/admin/*` route added.
- No secret committed.
