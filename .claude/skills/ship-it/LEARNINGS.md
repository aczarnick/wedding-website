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
- **Never put `$` in a value destined for `.env`.** Next's env loader expands it —
  a `$`-separated scrypt hash had `$16384` read as `$1` + `6384`, breaking every
  sign-in. The same trap waits in shell, Terraform, and Container App secrets.
  Colons are safe and base64-compatible. Personal memory: `env-var-dollar-expansion`.
- **Pre-existing `tsc` noise:** `npx tsc --noEmit` reports ~21 errors in
  `src/proxy.test.ts` plus a few image-import files on a clean `master`, so its
  exit code is already non-zero. Check errors *by file* before blaming your diff.

## Tooling gotchas

Cross-cutting traps that cost a run real time but belong to no single phase.

- **`npx tsx -e` emits CJS and rejects top-level `await`.** Write the throwaway
  script to a real `.ts` file with an `async main()`, run it, then delete it.
- **A file containing a literal U+FEFF makes `grep` print _nothing_** — not "0
  matches", not "Binary file matches", just silence, because the file is
  classified as binary. A plan whose test code embeds a BOM (`const BOM = '﻿'`)
  is such a file. Three empty greps made an intact plan look truncated. The moment
  a grep result disagrees with a `wc -l` that says the content is there, reach for
  `grep -a`.
- **A verification that mutates shared state must restore it.** Proving a deadline
  lock meant moving `Settings.rsvpDeadline` into the past; leaving it there would
  have silently 403'd every later check. Re-seed afterwards, restore any `.env` you
  edited, and prefer passing a `now` parameter over mutating shared state where the
  code allows it.

## Run log

Append a dated bullet when a run hits friction the skill didn't anticipate. Once a
lesson is folded into `SKILL.md` (or captured above), prune it.

### 2026-07-27 — issue #67 (guest RSVP wizard UI)

First UI-heavy run, so the browser step carried the weight the gate could not.
The reviewer-model finding is folded into `SKILL.md` (Phase 5); these are the
UI-verification lessons the skill did not anticipate.

- **A mouse-driven browser pass structurally cannot catch keyboard-only
  defects.** A status toggle hid its radio with `sr-only`, so the focus ring
  landed on a 1×1 clipped box and a keyboard guest had no idea which row they
  were on — WCAG 2.4.7, invisible to 292 tests and to the whole Playwright flow,
  caught only by a reviewer reading markup. Worse, the first fix *looked* applied
  and still wasn't visible: `ring-sage-700` on `bg-sage-700` is a ring the exact
  color of the thing it rings. Any control that visually hides its input owes an
  explicit keyboard pass — `Tab` to it, assert `:focus-visible` matches, and read
  the computed `box-shadow`, because a screenshot of a mouse-driven run will not
  show you the problem or the fix.
- **A screenshot taken mid-`transition-colors` lies.** A toggle rendered grey in
  a full-page shot and looked like a real styling bug; a computed-style probe run
  immediately after the click appeared to confirm it. Both were sampling the
  interpolated value — settling 400 ms first showed every toggle at the correct
  `rgb(53,82,67)`. Settle before capturing, and re-probe after a delay before
  reporting any apparent visual defect.
- **The seed cannot reach every UI state.** The disambiguation picker needs two
  parties sharing a guest's full name, and the seed has none, so that screen was
  unreachable in the browser. Create the fixture temporarily, verify, then
  `db:seed` to restore — the same mutate-and-restore discipline the deadline
  check already needs.
- **Two Playwright locator traps in this app.** `getByText('Additional guest 1')`
  matches the heading, the remove button, *and* an `sr-only` legend — pass
  `{ exact: true }`. And an added-guest row nests its name one level deeper than
  a party-guest row, so `.closest('div')` / `.last()` resolve to different
  elements for the two; anchor on the row that also contains radios.
- **Refresh every screenshot a change invalidates, not just the obvious one.**
  De-emphasizing a control updated the desktop shots; the mobile shot still
  advertised the old "(4 left)" copy in the PR for a commit and a half. `git log
  -1 -- <file>` per image tells you which ones predate the change.

### 2026-07-27 — issue #66 (CSV import/export)

All findings folded into `SKILL.md` — confirming a dependency is merged rather
than inferring it (Phase 1), `origin/master` as the base (Phase 2), plan snippets
owing a review (Phase 4), `task-brief` corruption and lockfile-in-Linux-image
(Phase 5), exit codes lost through pipes and `build` as the only typechecker
(Phase 6), asking the review which test injects the failure mid-operation
(Phase 7) — or captured as tooling gotchas above. No pending items.

### 2026-07-27 — issue #65 (admin API)

All findings folded into `SKILL.md` — stale local `master` (Phase 2), missing
`.env` in a fresh worktree (Phase 0), plan code blocks carrying defects into
faithful transcription (Phase 4), proving a restriction in **both** directions
(Phase 6), and re-running the container build when fixes land after it (Phase 7).
No pending items.

### 2026-07-26 — issue #64 (guest API)

- **Vitest parallelizes test *files*, so two DB test files sharing one database
  race.** Fixed with `test.projects` + `fileParallelism: false` on the DB project
  only; unit tests stay parallel. Now documented in `AGENTS.md` — any future DB
  test belongs under `test/db/` or it will race. Retained here as the origin of
  that constraint; everything else from this run is folded into `SKILL.md`.

### 2026-07-25 — issue #63 (admin auth)

All findings folded into `SKILL.md` (Phase 5 lockfile-in-Linux-image and verifying
subagent claims, Phase 6 runtime proof of a restriction and exit codes through
pipes, Phase 4 plan prose governing plan snippets) or captured as machine quirks
above. No pending items.

### 2026-07-18 — issue #62 (RSVP data layer)

All findings folded into `SKILL.md` (Phase 0 precheck, Phase 4 research memos,
Phase 5 subagent-driven impl, Phase 6/7 CI-mirrored gate + one-time docker + output
trimming) or captured as machine quirks above. No pending items.
