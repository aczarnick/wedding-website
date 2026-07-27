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

## Phase 0 — Environment precheck

Before touching the issue, confirm the tools the run will need so substitutions
surface now, not at the verify gate. Read `LEARNINGS.md` first for this machine's
known quirks, then check only what the issue will actually use:

- **Container runtime** (only if the change may touch the DB or Docker): is a
  runtime on PATH? `docker` may be a dangling symlink here — fall back to `podman`
  and confirm its machine is running. Note which command the rest of the run uses.
- **DB port** (only if the work needs a local database): confirm the target host
  port is free before `db:up` — a pre-existing container may hold the default.
- **Gate tools**: `node`/`npm` satisfy `engines`; `gh` is authenticated.
- **`.env`** (only if the work touches the DB, auth, or any runtime check): a
  fresh worktree has none, and it is gitignored, so *nothing warns you* — the gap
  surfaces as a failing DB test or a broken sign-in much later. Copy it from the
  previous issue's worktree and confirm the keys this issue actually needs;
  `DATABASE_URL` for anything data-touching, plus `AUTH_SECRET` / `ADMIN_EMAIL` /
  `ADMIN_PASSWORD_HASH` for anything auth-touching. The keys are often spread
  across different worktrees — check the values are non-empty, not just present.

Keep this to a few quick commands. Don't block a docs- or content-only issue on
container checks it will never use.

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

If the issue names dependencies ("Depends on: #62, #63"), **confirm each is merged
rather than inferring it from local branch state**. A dependency's branch or
worktree existing locally says nothing about whether it landed:

```bash
git fetch origin
gh pr view <dep> --json state,mergedAt -q '.state'
```

A dependency that is merged but absent from your base means you are about to
rebuild work that already exists, or build against an API that has since changed.

## Phase 2 — Isolated worktree

Derive a kebab-case slug from the issue title (lowercase, alphanumerics and
hyphens, trimmed). Create a worktree on a new branch off **`origin/master`**,
matching this repo's existing convention (`.claude/worktrees/` is gitignored):

```bash
git fetch origin
slug="<kebab-title>"
git worktree add -b "issue-<n>-${slug}" ".claude/worktrees/issue-<n>-${slug}" origin/master
```

Branch from `origin/master`, never the local `master`. Local `master` here is
routinely stale — it has been several merges behind at the start of a run — and a
worktree cut from it silently omits the merged dependency work the issue is built
on, which surfaces much later as a missing module or a conflicting API.

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

**Plan code blocks are first-draft code that still owes a review.** When a plan
contains complete code, implementers transcribe it faithfully — bugs included.
Across runs, a large share of review findings have traced back to defects in the
plan's own snippets rather than implementer error: a zeroed counter that
contradicted the plan's stated contract, an assertion too weak to catch the
regression its test existed for, a swallowed parse error. Two consequences:

- Re-read your own code blocks against the plan's prose before presenting it.
  Where they disagree, **the prose governs** — it states the contract; the snippet
  is an illustration of it.
- When a review finding traces back to plan text, fix the plan too, not just the
  code. Otherwise later tasks inherit it and the same defect returns.

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

**Spend the strong reviewer on the task that owns control flow.** Reviewer model
choice matters more than reviewer count. On #67, six task reviews on a cheap
model came back clean or with cosmetic minors; the one review dispatched on the
strong model — the task owning the wizard's state machine and error mapping —
returned four Important findings, two of them bugs that would have shipped (a
`404` stranding the user in an editor for a deleted record with no exit, and a
transient refetch failure discarding their whole draft behind a message claiming
the record no longer existed). Cheap reviewers are fine for leaf components; they
are not fine for the state machine, the error mapper, or the orchestrator every
other task routes through. Identify that task when you write the plan.

Where a test surface exists, have the implementing agent use
`superpowers:test-driven-development`. One task in flight at a time; a task is done
only when its slice of the gate is green.

**Adding a dependency? Generate the lockfile inside the Linux image.** `npm
install` on this Mac prunes cross-platform optional deps (`@emnapi/*`) and breaks
CI's `npm ci` — and local `npm ci --dry-run` still passes, so only the container
build catches it. Add the package, then install from the lockfile:

```bash
podman run --rm -v "$PWD":/app -w /app node:24-alpine \
  npm install --package-lock-only <pkg>
npm ci
```

**Verify what a subagent hands back.** Two failure modes recur: a "verified by
inspection" claim that a real run disproves, and faithful transcription of a
broken snippet. If `superpowers:subagent-driven-development`'s `scripts/task-brief`
is used to extract task text, **diff the brief against the plan first** — it has
silently truncated a template literal mid-line, producing invalid code with no
error. Extracting with a tool that does no shell expansion (a short node slice on
the `### Task N:` headings) avoids the class entirely.

## Phase 6 — Verify (autonomous)

Run the fast gate **in the worktree**, in CI order:

```bash
npm run lint && npm run check:images && npm test && npm run build
```

**Trim output** — pipe long commands to `tail`/`grep` and keep pass/fail plus any
failing lines. "Show the actual output" means the evidence, not the whole dump;
verbatim gate and build logs are the biggest avoidable context cost.

**But a pipe discards the exit code** — `cmd | tail` reports the status of `tail`,
which is always 0. A failed build has been reported as a success this way. When
the pass/fail verdict matters, redirect to a file, check `$?`, *then* trim:

```bash
podman build -t czw:ci . > /tmp/build.log 2>&1; echo "EXIT=$?"; tail -12 /tmp/build.log
```

Note `npm run build` is the **only** gate step that typechecks — ESLint doesn't
resolve type names and Vitest strips types via esbuild without checking them. A
wrong type name passes lint and tests and fails here, so never reorder `build`
out of the sequence or treat it as a formality after green tests.

On failure, apply the [Failure handling](#failure-handling) rule.

**Prove runtime behavior, not just a green gate.** For any UI-visible change,
drive the app per the `run-wedding-website` skill and *view* the result. For any
issue whose deliverable is a **restriction** (auth, a deadline lock, a size or
rate limit), the runtime check is the gate rather than a formality, and it must
prove **both directions**:

- The denial — unauthenticated/over-limit calls return the intended status, and
  nothing was written. A gate that rejects everyone also passes a denial-only test.
- The authorized happy path — the real flow still works end to end.

A green suite has passed here while `/admin` sat wide open. For API surfaces,
curl against the running dev server is the honest instrument: it shows status
codes, response headers, and the database's before/after state. To get the
authorized half, generate a throwaway `ADMIN_PASSWORD_HASH` locally, drive the
Auth.js credentials callback with curl and a cookie jar, then **restore `.env`
and re-seed** — any verification that mutates shared state must put it back.

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

**Know which review path applies.** The `/code-review` skill is written around an
*already-open* PR — it fetches with `gh`, fans out scoring agents, and comments
back on the PR. Phase 7 runs before the push, so there is no PR to fetch. Review
the branch diff directly (inline is right for a small diff; the skill's full flow
is for reviewing an open PR later). Say which path you took rather than reporting
`/code-review` output you did not produce.

Capture each finding's outcome (`fixed` / `skipped`) — these feed the PR body.
Because fixes can break the build, **re-run the Phase 6 fast gate** after review.
Then run the one-time CI-parity check before shipping:

```bash
docker build -t czw:ci .   # or: podman build -t czw:ci .
```

The container build must validate **actual HEAD**. If any fix lands after it —
a review fix wave, a late correction — the build you ran no longer describes what
you are about to push, so run it again. This is why the phase order puts review
before the build; keep that order.

**Ask the review what the diff cannot show.** A reviewer reading only a diff
confirms that code exists, not that a guarantee is *tested*. When the change has a
headline property — "on failure nothing persists", "only ever creates", "denied
unless authorized" — ask explicitly which test injects the failure mid-operation.
Per-task reviews have passed an all-or-nothing transaction whose every test
rejected before the transaction even opened; only the whole-branch review caught it.

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

**Any UI-visible change ships with screenshots in the PR.** The Phase 6 browser
proof already produced them; a reviewer should not have to run the branch to see
what changed. Include the states that carry the change — desktop, mobile, and any
opened/focused/empty state the diff touches — and prefer a before/after pair when
the change modifies existing UI rather than adding new UI.

Neither `gh` nor the REST API can attach an image — Markdown needs a URL, and a
local path renders as nothing. **This repo's convention** (established by PR #90)
is to commit them and link by raw URL:

```bash
mkdir -p docs/screenshots/<feature>          # NN-name.png, numbered in reading order
git add docs && git commit -m "Add PR screenshots (#<n>)"
git push                                      # push BEFORE building the body
sha=$(git rev-parse HEAD)                     # raw URLs need the pushed sha
# https://raw.githubusercontent.com/<owner>/<repo>/$sha/docs/screenshots/<feature>/01-….png
```

The sha must be the **pushed** commit, so the order is commit → push → read
`rev-parse` → write the body → `gh pr create` / `gh pr edit --body-file`. Verify
each URL with `curl -o /dev/null -w '%{http_code}'` before publishing — a typo'd
path renders as a broken image, not an error. Pair mobile shots side by side with
`<img width="300">`; plain `![]()` for the rest.

**Keep them small.** A full-bleed hero screenshot is ~2 MB of PNG and lives in git
forever. Downscale (`sips -Z 900`), and convert photo-heavy shots to JPEG
(`sips -s format jpeg -s formatOptions 80`) — that took 1.2 MB to 187 KB here, in
line with the 17–400 KB range already on `master`. UI-chrome shots (drawers, nav
bars, flat color) stay PNG. `check:images` only gates `public/images`, so nothing
enforces this for you.

Uploading through the GitHub web UI instead (canonical `user-attachments` URLs,
zero repo footprint) requires the Claude browser extension; `tabs_context_mcp`
reported it disconnected on 2026-07-27, so don't plan on it without checking first.

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
