# ship-it — Learnings

A running log of what the skill under-specified, or what surprised a run. Append
a dated bullet whenever a run hits friction the skill didn't anticipate (Phase 9).
Periodically **promote** recurring entries into `SKILL.md` — a gotcha, a phase
tweak — and prune what's been folded in. This file is how the skill improves.

## 2026-07-18 — issue #62 (RSVP data layer)

- **Gate is stale.** `SKILL.md` says "there is no test suite," but the repo now
  has a vitest suite (`npm test`) and CI runs both `npm test` and `docker build`.
  Verify should mirror CI: `lint → check:images → test → build → docker build`.
- **No environment precheck.** The `docker` CLI was a dangling symlink; the run
  lost several turns discovering Podman (`/opt/podman/bin`), a port-1433 conflict
  with a pre-existing container, and a SQL Server 2025 AVX crash under Rosetta.
  Check the container runtime + DB port availability up front, not at verify time.
- **Heavy checks re-ran.** `docker build` ran three times (after impl, after
  review, after a fix). Run CI-parity / heavy checks **once**, at the end.
- **Research bloated main context.** Version/API grounding (Prisma 7 via web +
  context7) dumped raw docs inline and never left context. Delegate grounding to
  a subagent that returns a short decision memo.
- **Verify output not trimmed.** Full gate and `docker build` output entered
  context verbatim. Pipe to `tail`/`grep`; keep pass/fail + failing lines only.
