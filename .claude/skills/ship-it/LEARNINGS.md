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

### 2026-07-29 — issue #103 (RSVP database backups)

First infra-only run. The gate can't reach the cloud, so the interesting question
was what "verified" even means for Terraform.

- **An issue's premise can be *inverted*, not merely false.** #103 asked for
  backups "so we can restore" — Azure SQL had been taking automated PITR backups
  all along. The real gaps were narrower and different: nothing in Terraform
  *owned* the retention value, and there was no long-term retention policy, so
  every backup died with the logical server. Had I built what the issue literally
  asked for, the result would have been a redundant daily-export pipeline that
  still didn't survive a server deletion. This is the #71 "premise can be false"
  rule again, one turn further: for any issue naming a managed service, establish
  **what the platform already does** before designing anything. Recurrence noted —
  promote to Phase 1 if it happens a third time.
- **Check the main tree for uncommitted work before planning, not just
  `origin/master`.** Mid-brainstorm, the working tree gained a SKU change moving
  production from serverless to Basic. That silently invalidated a design I had
  already presented: Basic caps PITR at 7 days where the vCore tiers allow 35, so
  "extend retention to 35 days" went from the centrepiece to impossible. Phase 2
  already warns that local `master` is *stale*; the opposite failure — local
  `master` being **ahead**, with in-flight edits to the very files the issue
  touches — costs a replanned design and a rebased worktree. `git status` in the
  main tree belongs in Phase 0.
- **`terraform test` + `mock_provider` is credential-free plan-time
  verification.** CI deliberately gives PRs no cloud credentials, which reads like
  "no empirical proof is possible for infra." It isn't: a `mock_provider "azurerm"
  {}` test runs `command = plan` with no auth, and `lifecycle` preconditions *are*
  evaluated, so `expect_failures = [resource.addr]` proves a guard fires. Four
  cases ran in seconds. Kept as a throwaway and deleted, since `ci.yml` runs only
  `fmt`/`validate` and committing a test CI never executes is decorative — but for
  any infra run with a conditional or a precondition, this is the tool.
- **A mutation that doesn't compile proves nothing.** Mutation-testing that
  precondition, the obvious break — `condition = true` — was rejected by Terraform
  itself: "The condition expression must refer to at least one object from
  elsewhere in the configuration." The test went red for a reason unrelated to the
  logic, which looks like success and isn't. The valid mutation was dropping the
  upper bound (`var.pitr_retention_days >= 1`), which is also the realistic bug.
  **Confirm a mutation is a valid program that is merely wrong**, and check that
  the failure message names the assertion rather than a syntax error.
- **Never write a price into the repo that can't be sourced.** I put "~$0.07/mo"
  into a Terraform comment, the runbook, and the spec, derived from a $/GB backup
  rate recalled from memory. Azure's pricing pages render rates client-side and
  serve `$-/GB/month` placeholders to any fetch, so it was unverifiable by
  construction. Caught at self-review; the fix was to keep the part that *is*
  derivable (the GB footprint and the formula) and point at the pricing
  calculator. The general rule: a number a reader will trust needs a source, and
  "I recall the rate" is not one. Structural claims from docs — "PITR is free on
  DTU", "LTR survives server deletion" — quote cleanly; unit prices do not.

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
