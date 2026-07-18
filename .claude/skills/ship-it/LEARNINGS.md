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

Promoted into `SKILL.md`:
- gate mirrors CI, `docker build` runs once, output trimmed (Phase 6/7).
- research grounding delegated to a subagent memo (Phase 4); per-task work and
  heavy verify delegated to cheaper-model subagents (Phase 5/6, Notes).
