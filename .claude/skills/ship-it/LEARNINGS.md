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

## Run log

Append a dated bullet when a run hits friction the skill didn't anticipate. Once a
lesson is folded into `SKILL.md` (or captured as a machine quirk above), prune it.

### 2026-07-18 — issue #62 (RSVP data layer)

All findings folded into `SKILL.md` (Phase 0 precheck, Phase 4 research memos,
Phase 5 subagent-driven impl, Phase 6/7 CI-mirrored gate + one-time docker + output
trimming) or captured as machine quirks above. No pending items.
