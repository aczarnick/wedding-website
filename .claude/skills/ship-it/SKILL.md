---
name: ship-it
description: Take a GitHub issue from idea to open PR — resolve the issue, plan it (grilling you with questions), implement in an isolated worktree, self-verify, code-review, and open a PR. Use when asked to "ship it", "ship issue <n>", or work an issue end-to-end.
---

# Ship It

End-to-end delivery for a single GitHub issue in this repo. `ship-it` is an
**orchestrator**: it sequences existing skills and `gh`, pausing at exactly two
checkpoints — **plan approval** and **final PR review** — and running the middle
autonomously.

You are working on the **wedding-website** repo. `gh` is authenticated. All paths
are relative to the repo root. The verification gate **mirrors CI**
(`.github/workflows/ci.yml`): `npm run lint && npm run check:images && npm test &&
npm run build`, plus a one-time `docker build` for CI parity. Run the fast gate as
often as needed; run `docker build` once, at the end.

## Checkpoint model

- ⏸ **Plan approval** (phase 4) — never write implementation code until the user
  approves the plan.
- ⏸ **PR review** (phase 8) — the run ends with an open PR the user reviews.
- Everything between (implement → verify → review → push) runs **without
  stopping**, with one exception: a verify/review failure that survives one
  auto-fix attempt STOPS and asks (see [Failure handling](#failure-handling)).

Announce the current phase as you enter it so the run is legible.

## Phase 1 — Resolve the issue

If an issue number was given, fetch it:

```bash
gh issue view <n> --json number,title,body,labels
```

If **no** number was given, list open issues assigned to the user and let them
pick one; fall back to all open issues if none are assigned:

```bash
gh issue list --assignee @me --state open --json number,title,labels \
  || gh issue list --state open --json number,title,labels
```

Present the list and wait for the user to choose. Do not auto-pick.

## Phase 2 — Isolated worktree

Derive a kebab-case slug from the issue title (lowercase, alphanumerics and
hyphens, trimmed). Create a worktree on a new branch off `master`, matching this
repo's existing convention (`.claude/worktrees/` is gitignored):

```bash
slug="<kebab-title>"
git worktree add -b "issue-<n>-${slug}" ".claude/worktrees/issue-<n>-${slug}" master
```

All remaining work happens **inside that worktree**. A fresh worktree has no
`node_modules` — install before any build:

```bash
( cd ".claude/worktrees/issue-<n>-${slug}" && npm ci )
```

If native `git worktree` is unavailable for any reason, fall back to the
`superpowers:using-git-worktrees` skill, but keep the same branch/path naming.

## Phase 3 — Triage (size)

Classify the issue to right-size planning:

- **Small** — single-file, mechanical, copy/content, or config change with
  unambiguous requirements.
- **Large** — multi-file, behavioral, architectural, **or requirements that are
  ambiguous in any way**. When in doubt, treat as large.

## Phase 4 — Plan ⏸

- **Small** → write a short inline plan: the change surface (which files, why)
  and the acceptance check. Present it and wait for approval.
- **Large** → invoke `superpowers:brainstorming` to grill the user, then
  `superpowers:writing-plans`. Commit the spec to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. Present the plan and
  wait for approval.

**Grounding (either size):** when the plan hinges on an external fact — a library
version, an API shape, a platform limit — do **not** pull raw docs (web search,
context7, MCP) into this context. Dispatch a research subagent (a cheaper model is
fine) with the specific question; have it return a short **decision memo** (the
answer + the source URL) and discard the raw pages. Un-delegated research is a
large, silent context cost.

**Do not proceed to implementation until the user approves the plan.**

## Phase 5 — Implement (autonomous)

Build the change in the worktree per the approved plan, following `AGENTS.md`
conventions (Tailwind-only, `@/` alias, data in `src/constants/*`, client/server
boundary rules).

**Delegate by size — the main lever for token spend and speed:**

- **Small** → implement **inline**. A single-file mechanical change is not worth a
  subagent's cold start (a fresh subagent re-derives context you already hold).
- **Large** → run the approved plan via `superpowers:subagent-driven-development`:
  one subagent per plan task on a cheaper model (e.g. Sonnet), review the returned
  diff between tasks, and keep only **task summaries + diffs** in this context — not
  the whole working set. The plan's per-task `Consumes`/`Produces` interface blocks
  exist precisely so a cold subagent can execute one task in isolation. The
  orchestrator stays on the stronger model and only reviews.

Where a test surface exists, have the implementing agent use
`superpowers:test-driven-development`. One task in flight at a time; a task is done
only when its slice of the gate is green.

## Phase 6 — Verify (autonomous)

Run the fast gate **in the worktree**, in CI order:

```bash
npm run lint && npm run check:images && npm test && npm run build
```

**Trim output** — pipe long commands to `tail`/`grep` and keep pass/fail plus any
failing lines. "Show the actual output" means the evidence, not the whole dump;
verbatim gate and build logs are the biggest avoidable context cost.

On failure, apply the [Failure handling](#failure-handling) rule. For
UI/runtime-visible changes, additionally drive the app per the
`run-wedding-website` skill and view the result — a green gate does not prove
rendered behavior.

The heavy **CI-parity check** — `docker build` (or `podman build`; see
`LEARNINGS.md`) — is slow (image pull + `npm ci` + build) and its output is large.
Run it **once**, at the end (Phase 7, after review, before pushing) — never after
every change. Delegating it to a verify subagent that returns only pass/fail plus
any failing lines keeps its large output out of the orchestrator.

## Phase 7 — Code review (autonomous)

Run a code review over the diff and auto-apply its fixes:

```
/code-review high --fix
```

Capture each finding's outcome (`fixed` / `skipped`) — these feed the PR body.
Because fixes can break the build, **re-run the Phase 6 fast gate** after review.
Then run the one-time CI-parity check before shipping:

```bash
docker build -t czw:ci .   # or: podman build -t czw:ci .
```

Apply the [Failure handling](#failure-handling) rule to both.

## Phase 8 — Ship ⏸

Push the branch and open the PR (ready for review, base `master`):

```bash
git push -u origin "issue-<n>-${slug}"
gh pr create --base master --title "<issue title> (#<n>)" --body-file <body>
```

PR body:

```markdown
Closes #<n>

## Plan
<one-paragraph summary, or link to the committed spec for large issues>

## Code review
Fixed: <finding> …
Left open (your call): <finding that review skipped> …
```

Report the PR URL. The run ends here — the user reviews the PR. Leave the
worktree in place (this repo keeps them; do not auto-remove).

## Phase 9 — Retro (autonomous)

Close the improvement loop. If anything surprised you or the skill
under-specified a step — a stale command, a missing env check, a wrong
assumption, a gotcha that cost turns — append one dated bullet per learning to
`.claude/skills/ship-it/LEARNINGS.md`. Skip silently on a frictionless run.

When a learning **recurs** across runs, promote it into this `SKILL.md` (a gotcha
or a phase tweak) and prune the folded entry from `LEARNINGS.md`. That promotion
is what makes the skill improve over time rather than relearning the same lesson.

## Failure handling

When the verify gate (Phase 6/7) or code review fails:

1. Make **one** fix attempt (use `superpowers:systematic-debugging`) and re-run
   the gate.
2. If it is still red, **STOP** — surface the actual failing output and ask the
   user how to proceed. Never open a red PR.

## Notes

- The orchestrator runs on the stronger model and mostly **reviews**; push the
  grunt work — research grounding, per-task implementation, heavy verification — to
  cheaper-model subagents, and keep only their memos, diffs, and pass/fail in this
  context. Delegation earns its cold-start cost on **Large** issues, not Small ones.
- One issue in flight at a time; finish and verify before starting another.
- Never skip the plan-approval or PR checkpoints, even for trivial issues.
- Keep the branch/worktree/PR naming consistent: `issue-<n>-<slug>` throughout.
- Read `LEARNINGS.md` at the start of a run for known gotchas; log new ones there
  at the end (Phase 9). The skill is meant to get sharper each run.
