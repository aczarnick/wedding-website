# Environment — machine quirks (Phase 0)

Persistent facts about this dev machine. Read at Phase 0; check only what the
issue will actually touch.

## Container runtime

The `docker` CLI is a dangling symlink (Docker Desktop uninstalled). Use Podman:

```bash
export PATH="/opt/podman/bin:$PATH"
podman machine list          # podman-machine-default (applehv, Rosetta), usually running
```

## Database

- Host `1433` is taken by an unrelated local SQL Server container. The wedding DB
  uses host **`14330`** (`docker-compose.dev.yml`). Don't disturb the other one.
- Use the **`2022-latest`** SQL Server image. 2025 crashes under Podman/Rosetta
  with an AVX assertion.
- `npm run db:seed` restores the canonical fixture: 3 parties, 5 guests
  (3 attending, 1 pending + flagged, 1 declined).

## `.env`

A fresh worktree has **no `.env`**, and it is gitignored, so nothing warns you —
the gap surfaces much later as a failing DB test or a broken sign-in. Copy one
from a previous issue's worktree and confirm the keys this issue needs:

| Key | Needed for |
| --- | --- |
| `DATABASE_URL` | anything data-touching |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | anything auth-touching |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | anything auth-touching |

Keys are often spread across different worktrees — check values are **non-empty**,
not merely present:

```bash
awk -F= '{v=$0; sub(/^[^=]*=/,"",v); print $1 " => " (length(v)>0 ? "set" : "EMPTY")}' .env
```

**Never put `$` in a value destined for `.env`.** Next's env loader expands it — a
`$`-separated scrypt hash had `$16384` read as `$1` + `6384`, breaking every
sign-in. Colons are safe and base64-compatible. The same trap waits in shell,
Terraform, and Container App secrets.

## Known-noisy commands

`npx tsc --noEmit` reports ~21 pre-existing errors (`src/proxy.test.ts` plus some
image-import files) on a clean `master`, so its exit code is already non-zero.
It is **not** part of the gate — `npm run build` is the typecheck. If you run it
anyway, check errors by file before blaming your diff.
