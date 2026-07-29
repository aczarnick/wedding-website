# RSVP database backups (#103)

Daily restore points for the production RSVP database, so a bad data change or a
deleted server does not lose the guest list.

## What already exists

Azure SQL backs every database up automatically — full, differential, and log
backups — with **point-in-time restore (PITR) at a 7-day default retention**.
Nothing in this repo configured that; it is the service default. The gap is not
"there are no backups", it is:

- Nothing in Terraform *owns* the retention setting, so a portal edit drifts
  silently.
- There is no long-term retention (LTR) policy, so **every backup dies with the
  logical server**. A deleted server or resource group loses the guest list
  outright.

## Threat model

Two failures are in scope, chosen deliberately over the alternatives:

| Failure | Covered by |
|---|---|
| A botched CSV import or bulk edit corrupts RSVPs | PITR — restore to any second in the last 7 days |
| The database, server, or resource group is deleted | LTR — weekly copies outlive all three |

Out of scope, on the record:

- **Region outage.** `storage_account_type` stays `Local` (LRS), so geo-restore
  remains impossible. Accepted.
- **Loss of the whole Azure subscription.** LTR restore is subscription-scoped.
  Surviving this needs an artifact outside Azure SQL entirely.
- **Backup immutability.** Since February 2026, `immutable_backups_enabled`
  *blocks deletion of the logical server* until every immutable backup is
  removed. That is a strong guardrail, but it breaks the documented teardown
  path. Rejected.

## Why not a bacpac export pipeline

The obvious "daily snapshot to blob storage" design was considered and rejected.
LTR already covers the deletion threat with no moving parts, and the export path
is materially more expensive than it looks:

- `az sql db export` requires `--admin-user`, a SQL login. Reaching for the
  server admin credential — held as a GitHub secret solely for the migrate job —
  to run a daily export widens that credential's blast radius for no coverage
  the LTR policy does not already provide.
- The passwordless alternative, export with managed-identity authentication, is
  **preview** and requires a user-assigned managed identity to *be* the server's
  Entra administrator. This server's Entra admin is the `czw-sql-admins` group.

A CSV artifact is separately available on demand from `GET /api/admin/export`,
which is the right tool when a human wants a file rather than a restore.

## Design

Two policy blocks on `azurerm_mssql_database.rsvp`, plumbed through the module
chain exactly as `sku_name` and `auto_pause_delay_in_minutes` already are. No new
resources, no new credentials, no new workflows.

### Layer 1 — PITR, pinned at 7 days

```hcl
short_term_retention_policy {
  retention_days = var.pitr_retention_days
}
```

Production sets `7`. This is **not** a behavior change — 7 is already the Azure
default — but it moves the setting into Terraform, which reverts portal drift on
the next apply.

7 is also the ceiling here. Azure caps PITR retention at 1–35 days for most
tiers, **but at 1–7 days for Basic**, and #104 moved production to Basic. The
`max_size_gb = 2` ceiling and the ~$5/mo flat rate come with that cap.

### Layer 2 — LTR, weekly for a year

```hcl
dynamic "long_term_retention_policy" {
  for_each = var.ltr_weekly_retention == "" ? [] : [1]
  content {
    weekly_retention = var.ltr_weekly_retention
  }
}
```

Production sets `"P52W"` — a weekly full backup retained one year, covering well
past the 2026-10-10 wedding. These copies live in separate blob storage and
survive deletion of the database, the server, and the resource group; they are
restorable to any server in the same subscription.

The `dynamic` block means an environment that leaves `ltr_weekly_retention` at
its `""` default has **no LTR policy resource at all**, rather than a policy
explicitly configured to zero. Staging takes that path.

Two limits are inherent to LTR and are not defects:

- **Weekly is the finest granularity available.** Microsoft controls backup
  timing; there is no daily LTR option. Sub-daily recovery comes from PITR.
- **The first LTR backup can take up to 7 days to appear** after the policy is
  applied.

### Plan-time guard

The 7-day Basic cap is a rule a future change will trip over. It is enforced with
a `lifecycle.precondition`, matching the pattern #104 established in this same
resource for the serverless/DTU split:

```hcl
precondition {
  condition     = var.pitr_retention_days >= 1 && var.pitr_retention_days <= (var.sku_name == "Basic" ? 7 : 35)
  error_message = "Basic caps PITR retention at 7 days; other SKUs allow up to 35."
}
```

Preconditions evaluate at plan time, so raising retention to 35 while still on
Basic fails the plan rather than erroring partway through an apply against
production.

### Defaults and scope

Both module variables get safe defaults — `pitr_retention_days = 7` (Azure's own
default) and `ltr_weekly_retention = ""` (disabled). Only production overrides
them, so `environments/staging/main.tf` needs no change: staging keeps the
default 7-day PITR and gets no LTR, which is the intended "production only"
outcome with one fewer file touched.

## Cost

**PITR is free.** In the DTU purchasing model there is no charge for PITR backup
storage at any retention — it is bundled into the database price. Production is
Basic, so Layer 1 costs nothing.

**LTR is billed on actual consumption**, with no free allowance in the DTU model
(the vCore model's "free backup storage equal to max data size" does not apply).
The footprint is `retained weekly copies × compressed database size`:

| Database size | 52 weekly copies |
|---|---|
| ~25 MB (realistic guest list) | ~1.3 GB |
| 100 MB | ~5 GB |
| 2 GB (Basic ceiling) | ~104 GB |

The per-GB rate is deliberately **not** quoted here. Microsoft's pricing page
renders backup-storage rates client-side and serves `$-/GB/month` placeholders to
a plain fetch, so any figure written into this repo would be unsourced and would
rot. Multiply the table by the current LRS backup rate on the pricing calculator
when it matters. At ~1.3 GB the result is a rounding error next to the ~$4.90/mo
database; the worst case only becomes material if the guest list somehow
approaches the 2 GB ceiling.

Cost is linear in both retention weeks and database size, so shortening retention
saves a proportional fraction of a very small number — it is not a reason to pick
a shorter window.

LTR inherits the database's `storage_account_type = "Local"`, so the copies are
LRS, the cheapest option and consistent with the no-geo-redundancy decision.

**LTR outlives teardown.** Deleting the database does not delete its LTR backups
— that is the point — so `terraform destroy` leaves up to 52 weeks of backup
storage billing behind. Small, but it belongs in the teardown runbook.

## Documentation

`docs/deployment/README.md` gains a **Backups and restore** subsection under
*RSVP database*, covering what each layer protects against, the Basic 7-day cap
and why it exists, the restore commands for both layers, and the teardown note
above. The issue's stated goal is the restore, not the backup; a backup nobody
knows how to restore is not a backup.

## Verification

CI's infra gate is the acceptance check: `terraform fmt -check -recursive
infra/terraform`, plus `terraform init -backend=false && terraform validate` per
environment. The full app gate (`lint`, `check:images`, `test`, `build`) runs
because the repo is touched.

Beyond the gate, the precondition is checked **empirically** — set
`pitr_retention_days = 35` against the Basic SKU and confirm the plan is rejected
with the intended message, then restore. A guard asserted but never fired is not
a guard.

No Terraform test harness is introduced. The repo has none, and a provider
passthrough does not justify one.

`terraform plan` against live state is deliberately not part of this: CI gives
PRs no cloud credentials, by design. The real plan output lands when `infra.yml`
applies on merge.
