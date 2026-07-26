# ship-it — Learnings

A running log of what the skill under-specified, or what surprised a run. Append
a dated bullet whenever a run hits friction the skill didn't anticipate (Phase 9).
Periodically **promote** recurring entries into `SKILL.md` — a gotcha, a phase
tweak — and prune what's been folded in. This file is how the skill improves.

## Machine quirks (consult during Phase 0)

Persistent facts about the current dev machine — not todos; Phase 0 reads these.

- **Container runtime:** the `docker` CLI is a dangling symlink (Docker Desktop
  uninstalled). Use Podman — `export PATH="/opt/podman/bin:$PATH"`; the
  `podman-machine-default` (applehv, Rosetta) is normally already running.
- **DB port:** host `1433` is taken by another local SQL Server container. The
  wedding DB uses host `14330` (`docker-compose.dev.yml`); don't disturb the other.
- **SQL Server image:** 2025 crashes under Podman/Rosetta with an AVX assertion —
  use `2022-latest`. Deeper context: personal memory `rsvp-data-layer-stack`.

## Run log

Append a dated bullet when a run hits friction the skill didn't anticipate. Once a
lesson is folded into `SKILL.md` (or captured as a machine quirk above), prune it.

### 2026-07-26 — issue #64 (guest API)

- **`npm test` and `npm run lint` do not typecheck; only `npm run build` does.**
  A refactor used a type name it never imported. ESLint doesn't resolve type
  names and Vitest transpiles via esbuild, which strips types without checking —
  both passed. `next build` failed. Treat `build` as its own gate, not a
  formality after green tests, and don't reorder it out of the CI sequence.
  (`npx tsc --noEmit` is not a substitute here: it reports 21 pre-existing
  errors in `src/proxy.test.ts` on `master`, so its exit code is already
  non-zero — check errors *by file* against `master` before blaming your diff.)
- **Vitest parallelizes test *files*, so two DB test files sharing one database
  race.** Adding a second `test/db/*.test.ts` that calls `seedDatabase()` broke
  the suite on the `Settings` singleton — and it passed when run alone, so only
  the full gate caught it. Fix is Vitest's documented recipe: `test.projects`
  with `fileParallelism: false` on the DB project only, `extends: true` to
  inherit root plugins/resolve. Unit tests stay parallel. Any future DB test
  belongs under `test/db/` or it will race.
- **A verification script that changes DB state must restore it.** Proving the
  deadline lock meant moving `Settings.rsvpDeadline` into the past; leaving it
  there would have silently 403'd every later check. Re-seed after, and prefer
  passing a `now` parameter to mutating shared state where the code allows it.
- **`npx tsx -e` emits CJS and rejects top-level `await`.** Write the throwaway
  script to a real `.ts` file with an `async main()`, run it, delete it.

### 2026-07-25 — issue #63 (admin auth)

- **A green fast gate does not prove a gate is closed.** Lint, 55 tests, and a
  build that printed `ƒ Proxy (Middleware)` all passed while `/admin` was
  reachable unauthenticated. Auth.js's `export { auth as proxy }` only attaches
  `req.auth`; it denies nothing. Only driving the running app caught it. For any
  issue whose deliverable is a *restriction*, Phase 6's browser step is the gate,
  not a formality — assert the denial, not just the happy path.
- **`npm ci` must be proven in the Linux image, not on the Mac.** `npm install`
  here pruned `@emnapi/core`/`@emnapi/runtime` from the lockfile; local `npm ci`
  and `npm ci --dry-run` both passed, and only `podman build` failed. When a run
  adds a dependency, regenerate the lockfile inside the image
  (`podman run --rm -v "$PWD":/app -w /app node:24-alpine npm install
  --package-lock-only <pkg>`) rather than fixing it up afterwards. See personal
  memory `npm-version-lockfile-mismatch`.
- **Piping a command to `tail` discards its exit code.** `podman build ... | tail
  -25` reported success on a failed build. Redirect to a file and check `$?`.
- **Don't put `$` in any value destined for `.env`.** A `$`-separated hash
  (`scrypt$16384$…`) was silently mangled by Next's env loader — `$16384` became
  `$1` + `6384` — breaking every sign-in. The same trap waits in shell, Terraform,
  and Container App secrets. Colons are safe and base64-compatible.
- **Verify a subagent's "verified by inspection" claims.** An agent reported
  password masking working based on reading the code; a real pty (`script -q
  /dev/null`) showed the password echoing. Terminal echo happens in the driver
  before Node sees input — only `setRawMode` suppresses it.
- **Plan prose beats plan sample code.** The plan's Global Constraints forbade
  revealing which half of a credential was wrong, while its own sample
  `verifyAdminCredentials` returned early on an unknown email — a timing oracle.
  When a reviewer flags plan-mandated code that contradicts a stated constraint,
  the constraint governs; fix the code and the plan snippet.

### 2026-07-18 — issue #62 (RSVP data layer)

All findings folded into `SKILL.md` (Phase 0 precheck, Phase 4 research memos,
Phase 5 subagent-driven impl, Phase 6/7 CI-mirrored gate + one-time docker + output
trimming) or captured as machine quirks above. No pending items.
