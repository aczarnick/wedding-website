# ship-it — Learnings

A running log of what the skill under-specified, or what surprised a run. Append
a dated bullet whenever a run hits friction the skill didn't anticipate (Phase 9).
Periodically **promote** recurring entries into `SKILL.md` — a gotcha, a phase
tweak — and prune what's been folded in. This file is how the skill improves.

## 2026-07-18 — issue #62 (RSVP data layer)

Pending (not yet folded into `SKILL.md`):

- **No environment precheck.** The `docker` CLI was a dangling symlink; the run
  lost several turns discovering Podman (`/opt/podman/bin`), a port-1433 conflict
  with a pre-existing container, and a SQL Server 2025 AVX crash under Rosetta.
  Check the container runtime + DB port availability up front, not at verify time.
- **Research bloated main context.** Version/API grounding (Prisma 7 via web +
  context7) dumped raw docs inline and never left context. Delegate grounding to
  a subagent that returns a short decision memo.

Promoted into `SKILL.md` (gate mirrors CI, `docker build` runs once, output is
trimmed — Phase 6/7): stale-gate, repeated-heavy-checks, untrimmed-output.
