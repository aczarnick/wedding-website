---
name: ship-it
description: Take a GitHub issue from idea to open PR — resolve the issue, plan it (grilling you with questions), implement in an isolated worktree, self-verify, code-review, and open a PR. Use when asked to "ship it", "ship issue <n>", or work an issue end-to-end.
---

# Ship It

End-to-end delivery for a single GitHub issue in the **wedding-website** repo.
`ship-it` is an **orchestrator**: it sequences skills and `gh`, pausing at exactly
two checkpoints — **plan approval** (Phase 4) and **PR review** (Phase 8) — and
runs the middle autonomously. Announce each phase as you enter it.

Everything between the checkpoints runs without stopping, with one exception: a
verify or review failure that survives one fix attempt STOPS and asks. Never open
a red PR.

The gate **mirrors CI** (`.github/workflows/ci.yml`): `npm run lint && npm run
check:images && npm test && npm run build`. Run it as often as needed. The
container build is separate and runs **once**, in Phase 7.

## Git safety (applies to every phase)

Other runs work concurrently in sibling worktrees, and the main tree is often not
on `master`.

- **`git status -sb` immediately before** any commit, reset, checkout, or push —
  not five commands earlier. A stale reading has moved the wrong branch.
- **Never `git add -A` or `git add <dir>`.** Stage explicit file paths. A blanket
  add has swept another run's in-flight edits into an unrelated commit.
- **Never commit directly to `master`** — not code, not docs, not learnings.
- `pwd` before any path-relative write; the Bash tool's cwd persists across calls,
  including a `cd` inside a compound command.

## Phase 0 — Environment precheck

Read `references/environment.md` (machine quirks: container runtime, DB port,
`.env` keys) and confirm only what this issue will actually use. A docs- or
content-only issue needs none of it. Keep this to a few commands.

## Phase 1 — Resolve the issue

```bash
gh issue view <n> --json number,title,body,labels
```

With no number given, list open issues and let the user pick — never auto-pick:

```bash
gh issue list --assignee @me --state open --json number,title,labels \
  || gh issue list --state open --json number,title,labels
```

**Verify the issue's premise before planning.** An issue that says "repoint the
*existing* button" may describe something that does not exist. One grep turns a
mechanical task into a design question at the plan checkpoint instead of
mid-implementation.

**Confirm each named dependency is merged** — a local branch or worktree says
nothing about whether it landed. Building on a base that lacks merged dependency
work means rebuilding it, or building against an API that has since changed.

```bash
gh pr view <dep> --json state,mergedAt -q '.state'
```

## Phase 2 — Isolated worktree

Branch from **`origin/master`**, never local `master` — local is routinely several
merges stale, and a worktree cut from it silently omits merged dependency work.

```bash
git fetch origin
slug="<kebab-title>"
git worktree add -b "issue-<n>-${slug}" ".claude/worktrees/issue-<n>-${slug}" origin/master
( cd ".claude/worktrees/issue-<n>-${slug}" && npm ci )
```

All remaining work happens **inside that worktree** (`.claude/worktrees/` is
gitignored). Keep `issue-<n>-<slug>` as the branch, path, and PR name throughout.

## Phase 3 — Triage (size)

- **Small** — single-file, mechanical, copy/content, or config, with unambiguous
  requirements.
- **Large** — multi-file, behavioral, architectural, **or ambiguous in any way**.
  When in doubt, large.

## Phase 4 — Plan ⏸

- **Small** → a short inline plan: change surface (which files, why) and the
  acceptance check.
- **Large** → `superpowers:brainstorming` to grill the user, then
  `superpowers:writing-plans`; commit the spec to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.

**Ground external facts by delegation.** When the plan hinges on a library
version, API shape, or platform limit, dispatch a research subagent (cheap model)
and have it return a short decision memo — the answer plus the source URL. Pulling
raw docs into this context is a large, silent cost.

**Plan code blocks are first-draft code that still owes a review.** Implementers
transcribe them faithfully, bugs included, and a large share of review findings
have traced back to defects in the plan's own snippets. Re-read your snippets
against your prose before presenting; where they disagree **the prose governs**.
When a review finding traces back to plan text, fix the plan too, or later tasks
inherit it.

**Do not write implementation code until the user approves the plan.**

## Phase 5 — Implement (autonomous)

Build per the approved plan, following `AGENTS.md` conventions.

**Delegate by size** — the main lever on token spend:

- **Small** → inline. A subagent's cold start costs more than the work.
- **Large** → `superpowers:subagent-driven-development`, one subagent per plan
  task on a cheap model; keep only task summaries and diffs in this context. The
  orchestrator stays on the strong model and reviews between tasks.

**Spend the strong reviewer on the task that owns control flow** — the state
machine, the error mapper, the orchestrator others route through. Cheap reviewers
are fine for leaf components; on #67 they returned cosmetic minors while the
strong review of the state-machine task found two bugs that would have shipped.
Identify that task when writing the plan.

Use `superpowers:test-driven-development` where a test surface exists. One task in
flight; a task is done only when its slice of the gate is green.

**Verify what a subagent hands back** — "verified by inspection" claims have been
disproven by a real run, and broken snippets get transcribed faithfully.

**Adding a dependency?** Generate the lockfile inside the Linux image — `npm
install` on this Mac prunes cross-platform optional deps and breaks CI's `npm ci`,
and local `npm ci --dry-run` still passes, so only the container build catches it:

```bash
podman run --rm -v "$PWD":/app -w /app node:24-alpine npm install --package-lock-only <pkg>
npm ci
```

## Phase 6 — Verify (autonomous)

Run the gate **in the worktree**, in CI order. `npm run build` is the **only** step
that typechecks — ESLint doesn't resolve type names and Vitest strips types
without checking them — so never reorder it out or treat it as a formality after
green tests.

```bash
npm run lint && npm run check:images && npm test && npm run build
```

**Trim output, but never through a bare pipe.** `cmd | tail` reports `tail`'s exit
code, which is always 0; a failed build has been reported as success this way.

```bash
npm run build > /tmp/build.log 2>&1; echo "EXIT=$?"; tail -12 /tmp/build.log
```

**Prove runtime behavior, not just a green gate.** For any UI-visible change,
drive the app per the `run-wedding-website` skill and *view* the screenshots — a
passing exit code with an unviewed screenshot proves nothing.

For any issue whose deliverable is a **restriction** (auth, deadline lock, size or
rate limit), the runtime check is the gate, and it must prove **both directions**:

- **Denial** — unauthorized calls return the intended status and nothing was
  written. A gate that rejects *everyone* also passes a denial-only test.
- **Authorized** — the real flow still works end to end. A green suite has passed
  here while `/admin` sat wide open.

curl is the honest instrument for APIs. For the authorized half, generate a
throwaway `ADMIN_PASSWORD_HASH`, drive the credentials callback with a cookie jar,
then **restore `.env` and re-seed** — any verification that mutates shared state
must put it back.

Scope browser assertions to the app's own DOM (`form p[role="alert"]`, not
`getByRole('alert')`, which also matches the Next dev overlay) and treat empty
matched text as a failure, not a pass. More traps: `references/gotchas.md`.

## Phase 7 — Code review (autonomous)

**Review the branch diff directly.** The `/code-review` skill is built around an
*already-open* PR — it fetches with `gh` and comments back — and Phase 7 runs
before the push, so there is nothing to fetch. Inline review is right for a small
diff. Say which path you took; never report `/code-review` output you did not
produce.

**Ask what the diff cannot show.** A reviewer reading a diff confirms code exists,
not that a guarantee is *tested*. When the change has a headline property — "on
failure nothing persists", "denied unless authorized" — ask which test injects the
failure mid-operation. A per-task review once passed an all-or-nothing transaction
whose every test rejected before the transaction opened.

Record each finding as `fixed` / `skipped` for the PR body. Fixes can break the
build, so **re-run the Phase 6 gate**, then run the one-time CI-parity build:

```bash
podman build -t czw:ci . > /tmp/build.log 2>&1; echo "EXIT=$?"; tail -12 /tmp/build.log
```

It must validate **actual HEAD** — if any fix lands after it, run it again. That
is why review precedes the build; keep that order.

## Phase 8 — Ship ⏸

```bash
git push -u origin "issue-<n>-${slug}"
gh pr create --base master --title "<issue title> (#<n>)" --body-file <body>
```

Body: `Closes #<n>`, a one-paragraph plan summary (or a link to the committed
spec), the decisions worth knowing about, verification evidence, and a **Code
review** section listing what was fixed and what was left open for the user.

**Any UI-visible change ships with screenshots** — the Phase 6 browser proof
already produced them, and a reviewer should not have to run the branch to see
what changed. The hosting procedure is fiddly and easy to get wrong: follow
`references/pr-screenshots.md`.

Report the PR URL. The run ends here. Leave the worktree in place.

## Phase 9 — Retro (autonomous)

Append one dated bullet per learning to `LEARNINGS.md`. Skip silently on a
frictionless run. Keep entries actionable — a run that produced nothing new needs
no entry at all, not a tombstone saying so.

When a learning **recurs**, promote it into this `SKILL.md` and prune the folded
entry. That promotion is what makes the skill improve instead of relearning.

**Learnings ship as their own PR — never a commit to `master`.** They are separate
from the feature, and a learning that turns out wrong or confusing must be
reviewable on its own. Do it from a **fresh worktree off `origin/master`**, not
the main tree, which may hold another run's uncommitted edits:

```bash
git worktree add -b ship-it-learnings-<n> .claude/worktrees/ship-it-learnings-<n> origin/master
# edit LEARNINGS.md there, stage the explicit path, push, gh pr create
```

## Failure handling

1. One fix attempt (`superpowers:systematic-debugging`), then re-run the gate.
2. Still red → **STOP**, surface the actual failing output, and ask.
