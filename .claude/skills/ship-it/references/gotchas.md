# Tooling gotchas

Traps that cost a run real time but belong to no single phase. Consult when the
symptom matches; not required reading every run.

## A tool reported success but didn't do the work

- **A bare pipe discards the exit code.** `cmd | tail` reports `tail`'s status,
  always 0. Redirect to a file, echo `$?`, then trim. (Promoted to `SKILL.md`
  Phase 6 — repeated here because the symptom is silent.)
- **`getByRole('alert')` matches the Next dev overlay.** A wait on it resolved
  instantly against a dev-indicator element with empty text while the real submit
  was still in flight, and the step "passed" with `alert text: ""`. Only opening
  the screenshot exposed it. Scope to the app's DOM (`form p[role="alert"]`) and
  treat empty matched text as a failure. Note scrypt verification takes ~1s, so a
  naive wait races it.
- **A screenshot taken mid-`transition-colors` lies.** A toggle rendered grey in a
  full-page shot and a computed-style probe appeared to confirm the bug — both
  sampled the interpolated value. Settle ~400 ms before capturing, and re-probe
  after a delay before reporting any apparent visual defect.

## Playwright / browser

- **A one-off script must live inside the worktree.** Node resolves
  `playwright-core` from the *script's* directory, not the cwd, so a driver in the
  scratchpad dies with `ERR_MODULE_NOT_FOUND`. Write it to the worktree root as
  `tmp-*.mjs` and delete it before committing.
- **A mouse-driven pass structurally cannot catch keyboard-only defects.** A
  status toggle hid its radio with `sr-only`, so focus landed on a 1×1 clipped box
  — WCAG 2.4.7, invisible to 292 tests and the whole Playwright flow. Worse, the
  first fix looked applied and wasn't visible: `ring-sage-700` on `bg-sage-700` is
  a ring the color of the thing it rings. Any control that visually hides its input
  owes an explicit keyboard pass — `Tab` to it, assert `:focus-visible`, read the
  computed `box-shadow`.
- **Locator traps in this app.** `getByText('Additional guest 1')` matches the
  heading, the remove button, *and* an `sr-only` legend — pass `{ exact: true }`.
  An added-guest row nests its name one level deeper than a party-guest row, so
  `.closest('div')` / `.last()` resolve differently for the two; anchor on the row
  that also contains radios.
- **Verify a nav addition at the breakpoint where it first appears.** A 7th header
  link wraps at `md` (768px) while looking fine at 1280 and 390.

## Fixtures and shared state

- **A verification that mutates shared state must restore it.** Proving a deadline
  lock meant moving `Settings.rsvpDeadline` into the past; leaving it there would
  have silently 403'd every later check. Re-seed afterwards, restore any `.env` you
  edited, and prefer passing a `now` parameter over mutating shared state.
- **The seed cannot reach every UI state.** The disambiguation picker needs two
  parties sharing a guest's full name and the seed has none. Create the fixture
  temporarily, verify, then `db:seed` to restore.
- **Vitest parallelizes test *files*,** so two DB test files sharing one database
  race. `vitest.config.ts` splits the suite into projects and runs `db` with
  `fileParallelism: false`. Any DB test belongs under `test/db/` or it will race.

## Shell and search

- **`npx tsx -e` emits CJS and rejects top-level `await`.** Write a real `.ts`
  file with an `async main()`, run it, delete it.
- **A literal U+FEFF makes `grep` print _nothing_** — not "0 matches", not "binary
  file matches", just silence, because the file is classified as binary. A plan
  whose test code embeds a BOM is such a file; three empty greps made an intact
  plan look truncated. When a grep result disagrees with `wc -l`, reach for
  `grep -a`.
- **Read the repo for an existing convention before designing one.** A screenshot
  hosting scheme was designed from scratch while `master` already carried
  `docs/screenshots/rsvp/`. `git ls-tree -r origin/master | grep <thing>` answers
  it in one command.
