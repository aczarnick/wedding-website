# Azure SQL Serverless Database (Terraform) — Design

**Date:** 2026-07-17
**Issue:** #61 (RSVP epic #60, Wave 0 · foundation)
**Status:** Approved (design); implementation not started
**Depends on:** none · Blocks: #62 (Prisma data layer), #63 (Auth.js)

## Summary

Provision the RSVP datastore — an Azure SQL logical server plus one serverless
database per environment (staging, production) — in Terraform alongside the
existing stack, and wire the Container App to reach it **passwordlessly** via a
managed identity. Also scaffold the Auth.js secret plumbing (so issue #63 is
values-only) and add an (initially inert) `prisma migrate deploy` step to
`deploy.yml`.

No new compute: the database attaches to the existing Next.js Container App.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| DB auth | **Passwordless managed identity** (AAD-only server) | No secret to store/rotate. Verified supported: Prisma 7 `@prisma/adapter-mssql` handles `ActiveDirectoryManagedIdentity`; azurerm v4 supports `azuread_authentication_only`. |
| Auth.js secrets | **Scaffold the plumbing** | TF generates `AUTH_SECRET`; OAuth secrets defined but empty until #63; admin allowlist as a repo variable. Makes #63 values-only. |
| Production DB | **Warm** (auto-pause disabled) | Honors the existing "no guest-facing cold starts" production principle. Staging auto-pauses. Deliberately exceeds the "~$5/mo" acceptance line (flagged). |
| Network | **Public endpoint + AAD-only + allow-Azure** | AAD-only means no login is usable without a valid Entra token, so a public endpoint is not anonymously reachable. A private endpoint would require recreating the (non-VNet-injected) Container App Environment — out of scope. |

### Why passwordless MI is viable here (grounding)

The RSVP high-level design flagged MI as "preferred, with a Key Vault
connection-string fallback if Prisma's Azure AD token path proves fiddly."
Verified against current versions, the token path is **not** the rough edge it
once was:

- **Prisma 7 `@prisma/adapter-mssql`** supports Entra ID auth as a first-class
  option — `authentication: { type: 'azure-active-directory-default' }`, or
  `authentication=ActiveDirectoryManagedIdentity` (optional `clientId`) in the
  connection string. Token acquisition/refresh is handled by the
  `mssql`/`tedious` + `@azure/identity` stack, not hand-rolled.
- **azurerm v4** supports `azuread_administrator { azuread_authentication_only =
  true }`, so the server can be provisioned AAD-only with no SQL admin password.

The two real (non-Prisma) frictions that remain, and how this design handles
them:

1. **The DB-side grant Terraform can't express.** The app identity must be added
   *inside* the database (`CREATE USER ... FROM EXTERNAL PROVIDER` + role grant);
   there is no native `azurerm` resource for a contained DB user. → Handled by an
   idempotent T-SQL step in the CI migrate job (run as the AAD admin).
2. **CI must reach the DB through the firewall to migrate.** A GitHub-hosted
   runner is not an Azure service, so "allow Azure services" does not cover it.
   → The migrate job adds the runner's egress IP to the firewall for the run and
   removes it after, authenticating passwordlessly via the OIDC token the
   workflow already uses.

## Architecture

Everything attaches to the existing per-environment `env-stack`. Apply order is
unchanged (`shared → staging → production`); the shared stack is untouched.

### 1. New module: `infra/terraform/modules/sql-database/`

Reusable, instantiated once per environment by `env-stack`.

- **`azurerm_mssql_server`**
  - `azuread_administrator` block: `azuread_authentication_only = true`,
    `login_username` = admin group display name, `object_id` = admin group
    object id (variable), `tenant_id`.
  - No `administrator_login` / `administrator_login_password`.
  - `public_network_access_enabled = true`.
- **`azurerm_mssql_database`**
  - SKU `GP_S_Gen5_1` (serverless, Gen5, 1 vCore max), `min_capacity = 0.5`.
  - `max_size_gb = 2`.
  - `storage_account_type = "Local"` (LRS backup — cheaper; geo-redundancy not
    needed for a recoverable, re-seedable guest list).
  - `auto_pause_delay_in_minutes`: **60** (staging) / **-1** = disabled
    (production), passed as a variable.
- **`azurerm_mssql_firewall_rule "allow_azure_services"`** — start/end
  `0.0.0.0` (the ACA outbound reaches the DB from within Azure).
- **Outputs:** `server_fqdn`, `database_name`.

**Server name is globally unique.** Use `sql-czw-${environment}`. If a name is
already taken at apply time, fall back to a short `random_string` suffix
(documented in the module README/variable description). Database name: `rsvp`
(the server differs per env, so the DB name need not).

### 2. App identity + `container-app` module changes (additive, backward-compatible)

- New per-env **user-assigned identity `id-czw-app-${environment}`** (created in
  `env-stack`), attached to the Container App **alongside** the existing
  `acr_pull` identity.
- `container-app` module gains three optional inputs, all defaulting to
  empty/no-op so existing behavior is unchanged:
  - `additional_identity_ids : list(string)` — merged into the `identity` block.
  - `extra_env : list(object({ name, value }))` — appended to the container `env`.
  - `secrets : list(object({ name, value }))` + `secret_env : list(object({ name,
    secret_name }))` — ACA `secret` blocks and their `env { secret_ref }` wiring.
- The `registry.identity` and `acr_pull` wiring is untouched.

### 3. Env-var contract consumed by #62 / #63 (documented, set here)

Wired onto the Container App now so downstream issues are values-only:

- `DATABASE_URL` (non-secret) — app connection string, e.g.
  `sqlserver://sql-czw-staging.database.windows.net:1433;database=rsvp;authentication=ActiveDirectoryManagedIdentity;clientId=<app-uami-client-id>;encrypt=true`.
- `AUTH_SECRET` (secret) — generated by `random_password`, ACA secret
  `auth-secret`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (secrets) — ACA secrets
  `google-client-id` / `google-client-secret`, **empty** until #63 supplies real
  values via CI.

CI migrations use their **own** connection string with
`authentication=DefaultAzureCredential` (the runner authenticated as the AAD
admin), never the app's MI clientId.

### 4. `deploy.yml` migrate job (inert until #62)

A migrate step runs before each environment's deploy, preserving the
build-once / promote-same-digest flow:

```
build → migrate+deploy staging → smoke → (approval) → migrate+deploy production → smoke
```

Each migrate step:

1. `azure/login` via existing OIDC (deploy service principal).
2. Add the runner's current egress IP as a temporary SQL firewall rule.
3. Idempotently ensure the app DB user (run as AAD admin):
   `IF NOT EXISTS (...) CREATE USER [id-czw-app-<env>] FROM EXTERNAL PROVIDER;`
   then add it to `db_datareader`, `db_datawriter`, `db_ddladmin`.
4. `npx prisma migrate deploy`.
5. Remove the temporary firewall rule (always, even on failure).

**Guarded on `scripts/ensure-db-user.mjs` existence.** The deploy job checks out
the repo and early-exits when that file is absent, so CI stays green. #62 landed
the Prisma schema + local-dev tooling but **not** the deploy-migration path, so
the guard's sentinel is deliberately the still-absent `ensure-db-user.mjs` rather
than `prisma/schema.prisma` (which now exists). Activating the step is a distinct
follow-up: create `scripts/ensure-db-user.mjs`, add a `db:migrate:deploy` npm
script (`prisma migrate deploy`), add `actions/setup-node` + `npm ci` to the
deploy job, and grant the deploy identity SQL firewall-rule write (bootstrap
step 5). `deploy.yml` still ignores `infra/terraform/**` and `docs/**` pushes;
that is unchanged.

### 5. Bootstrap / operational prerequisites (Owner-run, not CI — documented only)

The CI deploy identity is RG-scoped Contributor and **cannot** create Entra
directory objects. So, out-of-band (in `scripts/bootstrap-azure.sh` +
`docs/deployment/README.md`):

- Create an Entra **group `czw-sql-admins`** and add (a) the human admin(s) and
  (b) the **CI deploy service principal** (so CI can run the grant + migrations
  as the AAD admin).
- Expose the group's **object id** and display name as GitHub repo variables
  (e.g. `SQL_AAD_ADMIN_GROUP_OBJECT_ID`, `SQL_AAD_ADMIN_GROUP_NAME`); tenant id
  already exists as `AZURE_TENANT_ID`.
- Add `ADMIN_EMAIL_ALLOWLIST` as a GitHub repo variable (consumed by #63).

Setting the AAD admin by **object id** needs no Graph permission for the CI
identity — it is an ARM write on the SQL server, which RG Contributor already
grants.

## Cost

| Environment | Idle behavior | Approx. idle cost |
|---|---|---|
| Staging | Auto-pauses after 60 min | ~$5/mo (storage floor; compute $0 while paused) |
| Production | Warm (auto-pause disabled), min 0.5 vCore | ~$15–30/mo |

Production deliberately exceeds the issue's "~$5/mo idle floor" acceptance line —
a conscious trade for zero guest-facing DB resume latency, consistent with the
existing production `min_replicas = 1` warm-replica policy. Flagged in the PR.

## Scope boundaries

**In scope:** SQL server + serverless DB per env, firewall, app MI + DB-user
grant (via CI job), Auth.js secret scaffold, admin-allowlist repo variable,
guarded migrate step, bootstrap/docs updates.

**Out of scope (owned by later issues):** Prisma schema/migrations/seed (#62),
Auth.js app code + real OAuth apps (#63), private-endpoint networking, Key Vault.

## Verification

- `terraform fmt -check -recursive infra/terraform` clean.
- Per-env `terraform -chdir=infra/terraform/environments/<env> init -backend=false
  && terraform validate` green (staging + production).
- `actionlint` clean on the `deploy.yml` change.
- `npm run lint && npm run build && npm run check:images` green (no app-code
  change, but the repo gate must pass).
- No live `apply` from the PR; `infra.yml` applies on merge to `master`
  (`shared`/`production` gated by approval).
