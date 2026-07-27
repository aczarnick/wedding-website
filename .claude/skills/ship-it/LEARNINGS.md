# ship-it — Learnings

The run log: what the skill under-specified, or what surprised a run. Append a
dated bullet at Phase 9 **only when there is something actionable** — a
frictionless run gets no entry, not a tombstone saying it had none.

When a lesson **recurs**, promote it and prune it from here:

| Destination | For |
| --- | --- |
| `SKILL.md` | a rule that changes how a phase runs |
| `references/environment.md` | a fact about this machine |
| `references/gotchas.md` | a tool that lies, or a trap with no home phase |
| `references/pr-screenshots.md` | anything about getting images into a PR |

Learnings ship as **their own PR** (see `SKILL.md` Phase 9) — never a commit to
`master`, and never staged with `git add -A` from the main tree, which may hold
another run's uncommitted edits.

## Run log

### 2026-07-27 — issue #68 (admin dashboard shell)

- **Committed the run's learnings straight to local `master`, and the `git add`
  swept in a concurrent run's in-flight edits to the same file.** Never pushed, but
  it conflated two runs' findings in one commit and took a reset to untangle —
  during which a *stale* `git status` reading (the main tree had moved off `master`
  between turns) caused a second wrong-branch reset. Both are now rules in
  `SKILL.md` → Git safety, and the learnings-PR workflow is in Phase 9.

### 2026-07-27 — issue #71 (wire RSVP button)

- **The premise of an issue can be false.** #71 said "point the site's *existing*
  RSVP call-to-action at /rsvp"; no such button existed anywhere in `src/`. Now a
  Phase 1 rule.
- Working-directory drift bit twice in one run — a dev server started in the wrong
  tree, then `docs/screenshots/` written into the main repo instead of the branch
  worktree. Harmless only because it was untracked. Now a Git safety rule.

### 2026-07-27 — issue #67 (guest RSVP wizard UI)

First UI-heavy run; the browser step carried the weight the gate could not. The
reviewer-model finding is in `SKILL.md` Phase 5; the UI-verification traps are in
`references/gotchas.md`.

### 2026-07-26 — issue #64 (guest API)

- Vitest's file-level parallelism races DB tests sharing one database. Fixed with
  `test.projects` + `fileParallelism: false` on the `db` project only, and
  documented in `AGENTS.md`. Retained as the origin of that constraint.
