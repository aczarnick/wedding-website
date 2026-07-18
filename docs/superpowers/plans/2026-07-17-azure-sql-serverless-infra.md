# Azure SQL Serverless Database (Terraform) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an Azure SQL logical server + one serverless database per environment in Terraform, reachable passwordlessly from the Container App via managed identity, with Auth.js secret plumbing scaffolded and an (inert-until-#62) migrate step added to CI.

**Architecture:** A new reusable `sql-database` Terraform module is instantiated per-env by `env-stack`. The `container-app` module gains additive inputs (extra identities, env vars, secrets) so the app carries a per-env user-assigned identity and DB/auth env wiring. A guarded migrate job in `deploy.yml` runs `prisma migrate deploy` (and a one-time DB-user grant) once the Prisma schema lands.

**Tech Stack:** Terraform (`hashicorp/azurerm ~> 4.0`, `hashicorp/random`), Azure SQL serverless (`GP_S_Gen5_1`), Azure Container Apps, GitHub Actions.

## Global Constraints

- Terraform provider: `hashicorp/azurerm` version `~> 4.0`; `required_version >= 1.9`. New module needs `hashicorp/random`.
- Every `*.tf` change must pass `terraform fmt -check -recursive infra/terraform`.
- Per-env gate: `terraform -chdir=infra/terraform/environments/<env> init -backend=false && terraform validate` (staging + production).
- Workflow changes must pass `actionlint`.
- Repo gate must stay green: `npm run lint && npm run build && npm run check:images`.
- Resource naming convention: `<type>-czw-<env>` (e.g. `sql-czw-staging`, `id-czw-app-staging`). DB name is `rsvp`.
- DB auth is **passwordless** — no SQL admin login/password anywhere. Server is AAD-only.
- CI passes environment values as `TF_VAR_*` in `_terraform-env.yml` (never local tfvars).
- Do **not** run `terraform apply` from this branch; `infra.yml` applies on merge.

---

### Task 1: `sql-database` Terraform module

**Files:**
- Create: `infra/terraform/modules/sql-database/versions.tf`
- Create: `infra/terraform/modules/sql-database/variables.tf`
- Create: `infra/terraform/modules/sql-database/main.tf`
- Create: `infra/terraform/modules/sql-database/outputs.tf`

**Interfaces:**
- Consumes (module inputs): `environment (string)`, `location (string)`, `resource_group_name (string)`, `aad_admin_login (string)`, `aad_admin_object_id (string)`, `tenant_id (string)`, `auto_pause_delay_in_minutes (number)`, `tags (map(string))`.
- Produces (module outputs): `server_fqdn (string)`, `database_name (string)`.

- [ ] **Step 1: Write `versions.tf`**

```hcl
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}
```

- [ ] **Step 2: Write `variables.tf`**

```hcl
variable "environment" {
  type        = string
  description = "Environment name (staging|production). Used in resource names."
}

variable "location" {
  type        = string
  description = "Azure region for the SQL server and database."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that hosts the SQL server."
}

variable "aad_admin_login" {
  type        = string
  description = "Display name of the Entra principal set as the server's AAD admin (e.g. the czw-sql-admins group)."
}

variable "aad_admin_object_id" {
  type        = string
  description = "Object ID of the Entra admin principal. Set by object ID so an RG-Contributor CI identity needs no Graph permission."
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID for the AAD administrator."
}

variable "auto_pause_delay_in_minutes" {
  type        = number
  description = "Serverless auto-pause idle delay. 60 = pause after 1h idle; -1 = never pause (warm)."
}

variable "tags" {
  type        = map(string)
  description = "Resource tags."
  default     = {}
}
```

- [ ] **Step 3: Write `main.tf`**

```hcl
# AAD-only server: no SQL login/password exists, so a public endpoint is not
# anonymously usable — every connection needs a valid Entra token from an
# authorized principal.
resource "azurerm_mssql_server" "this" {
  name                          = "sql-czw-${var.environment}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = "12.0"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true

  azuread_administrator {
    login_username              = var.aad_admin_login
    object_id                   = var.aad_admin_object_id
    tenant_id                   = var.tenant_id
    azuread_authentication_only = true
  }

  tags = var.tags
}

# Serverless General Purpose. min_capacity 0.5 vCore floor; storage LRS (Local)
# since the guest list is re-seedable and does not need geo-redundant backups.
resource "azurerm_mssql_database" "rsvp" {
  name                        = "rsvp"
  server_id                   = azurerm_mssql_server.this.id
  sku_name                    = "GP_S_Gen5_1"
  min_capacity                = 0.5
  max_size_gb                 = 2
  auto_pause_delay_in_minutes = var.auto_pause_delay_in_minutes
  storage_account_type        = "Local"

  tags = var.tags
}

# Lets the Container App (Azure outbound) reach the server. The 0.0.0.0 rule is
# Azure's "Allow all Azure services" convention. Non-Azure clients (e.g. the CI
# runner) add their own IP transiently in the migrate job.
resource "azurerm_mssql_firewall_rule" "allow_azure_services" {
  name             = "AllowAllAzureServices"
  server_id        = azurerm_mssql_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
```

- [ ] **Step 4: Write `outputs.tf`**

```hcl
output "server_fqdn" {
  value       = azurerm_mssql_server.this.fully_qualified_domain_name
  description = "SQL server FQDN, used to build the app connection string."
}

output "database_name" {
  value       = azurerm_mssql_database.rsvp.name
  description = "Database name (rsvp)."
}
```

- [ ] **Step 5: Format + validate the module standalone**

Run:
```bash
cd infra/terraform/modules/sql-database
terraform fmt
terraform init -backend=false && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
git add infra/terraform/modules/sql-database
git commit -m "feat(infra): add sql-database module (AAD-only serverless DB) (#61)"
```

---

### Task 2: Extend `container-app` module (identities, env, secrets)

**Files:**
- Modify: `infra/terraform/modules/container-app/variables.tf`
- Modify: `infra/terraform/modules/container-app/main.tf`

**Interfaces:**
- Consumes: existing inputs unchanged.
- Produces (new inputs, all default empty → backward-compatible): `additional_identity_ids (list(string))`, `extra_env (list(object({ name=string, value=string })))`, `secrets (list(object({ name=string, value=string })))`, `secret_env (list(object({ name=string, secret_name=string })))`.

- [ ] **Step 1: Append new variables to `variables.tf`**

```hcl
variable "additional_identity_ids" {
  type        = list(string)
  description = "Extra user-assigned identity IDs to attach (e.g. the app's DB identity), merged with the AcrPull identity."
  default     = []
}

variable "extra_env" {
  type = list(object({
    name  = string
    value = string
  }))
  description = "Plain (non-secret) environment variables appended to the container."
  default     = []
}

variable "secrets" {
  type = list(object({
    name  = string
    value = string
  }))
  description = "Container App secrets. Empty-valued entries must be filtered out by the caller (ACA rejects empty secret values)."
  default     = []
}

variable "secret_env" {
  type = list(object({
    name        = string
    secret_name = string
  }))
  description = "Environment variables that reference a secret by name (secret_ref)."
  default     = []
}
```

- [ ] **Step 2: Merge identities in `main.tf`**

Replace the `identity` block:
```hcl
  identity {
    type         = "UserAssigned"
    identity_ids = concat([var.acr_pull_identity_id], var.additional_identity_ids)
  }
```

- [ ] **Step 3: Add secret blocks + wire env in `main.tf`**

Add secret blocks at the top of the `resource "azurerm_container_app" "this"` body (after `identity` / `registry`, before `ingress` is fine — ACA `secret` is a top-level block):
```hcl
  dynamic "secret" {
    for_each = { for s in var.secrets : s.name => s.value }
    content {
      name  = secret.key
      value = secret.value
    }
  }
```

Inside `template.container`, after the existing `NODE_ENV` `env` block, append:
```hcl
      dynamic "env" {
        for_each = { for e in var.extra_env : e.name => e.value }
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = { for e in var.secret_env : e.name => e.secret_name }
        content {
          name        = env.key
          secret_name = env.value
        }
      }
```

- [ ] **Step 4: Format + validate**

Run:
```bash
cd infra/terraform/modules/container-app
terraform fmt
terraform init -backend=false && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/terraform/modules/container-app
git commit -m "feat(infra): container-app supports extra identities, env, and secrets (#61)"
```

---

### Task 3: Wire the database + auth scaffold into `env-stack`

**Files:**
- Modify: `infra/terraform/modules/env-stack/versions.tf`
- Modify: `infra/terraform/modules/env-stack/variables.tf`
- Modify: `infra/terraform/modules/env-stack/main.tf`
- Modify: `infra/terraform/modules/env-stack/outputs.tf`

**Interfaces:**
- Consumes: `sql-database` module (Task 1), extended `container-app` module (Task 2).
- Produces (new env-stack inputs): `sql_admin_group_name (string)`, `sql_admin_group_object_id (string)`, `tenant_id (string)`, `db_auto_pause_delay_in_minutes (number)`, `google_client_id (string, default "")`, `google_client_secret (string, default "")`. New output: `sql_server_fqdn (string)`.

- [ ] **Step 1: Add the `random` provider to `versions.tf`**

```hcl
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
```

- [ ] **Step 2: Append new variables to `variables.tf`**

```hcl
variable "sql_admin_group_name" {
  type        = string
  description = "Display name of the Entra group set as the SQL server AAD admin (contains human admins + the CI deploy SP)."
}

variable "sql_admin_group_object_id" {
  type        = string
  description = "Object ID of the SQL admin Entra group."
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID."
}

variable "db_auto_pause_delay_in_minutes" {
  type        = number
  description = "Serverless auto-pause delay. 60 for staging (pause when idle); -1 for production (stay warm)."
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth client ID for Auth.js. Empty until issue #63 supplies it."
  default     = ""
}

variable "google_client_secret" {
  type        = string
  description = "Google OAuth client secret for Auth.js. Empty until issue #63 supplies it."
  default     = ""
  sensitive   = true
}
```

- [ ] **Step 3: Add DB, app identity, secret plumbing, and DB wiring to `main.tf`**

Append to `main.tf` (the existing `data.azurerm_resource_group.env`, `azurerm_container_app_environment.this`, and `module.app` stay; the `module.app` call is edited in Step 4):

```hcl
# Per-env identity the app uses for passwordless (managed identity) DB access.
# Granted inside the database (CREATE USER ... FROM EXTERNAL PROVIDER) by the CI
# migrate job, not by Terraform (no azurerm resource for contained DB users).
resource "azurerm_user_assigned_identity" "app" {
  name                = "id-czw-app-${var.environment}"
  location            = data.azurerm_resource_group.env.location
  resource_group_name = data.azurerm_resource_group.env.name
  tags                = var.tags
}

module "database" {
  source = "../sql-database"

  environment                 = var.environment
  location                    = data.azurerm_resource_group.env.location
  resource_group_name         = data.azurerm_resource_group.env.name
  aad_admin_login             = var.sql_admin_group_name
  aad_admin_object_id         = var.sql_admin_group_object_id
  tenant_id                   = var.tenant_id
  auto_pause_delay_in_minutes = var.db_auto_pause_delay_in_minutes
  tags                        = var.tags
}

# Auth.js session secret — generated, never hand-managed. Base64 of 32 bytes.
resource "random_id" "auth_secret" {
  byte_length = 32
}

locals {
  database_url = "sqlserver://${module.database.server_fqdn}:1433;database=${module.database.database_name};authentication=ActiveDirectoryManagedIdentity;clientId=${azurerm_user_assigned_identity.app.client_id};encrypt=true"

  # ACA rejects empty secret values, so OAuth secrets appear only once #63
  # supplies real values. AUTH_SECRET is always present (generated).
  app_secrets = concat(
    [{ name = "auth-secret", value = random_id.auth_secret.b64_std }],
    var.google_client_id == "" ? [] : [{ name = "google-client-id", value = var.google_client_id }],
    var.google_client_secret == "" ? [] : [{ name = "google-client-secret", value = var.google_client_secret }],
  )

  app_secret_env = concat(
    [{ name = "AUTH_SECRET", secret_name = "auth-secret" }],
    var.google_client_id == "" ? [] : [{ name = "AUTH_GOOGLE_ID", secret_name = "google-client-id" }],
    var.google_client_secret == "" ? [] : [{ name = "AUTH_GOOGLE_SECRET", secret_name = "google-client-secret" }],
  )
}
```

- [ ] **Step 4: Pass the new wiring into the `module "app"` call in `main.tf`**

Add these arguments to the existing `module "app"` block:
```hcl
  additional_identity_ids = [azurerm_user_assigned_identity.app.id]
  extra_env               = [{ name = "DATABASE_URL", value = local.database_url }]
  secrets                 = local.app_secrets
  secret_env              = local.app_secret_env
```

- [ ] **Step 5: Add the server FQDN output to `outputs.tf`**

```hcl
output "sql_server_fqdn" {
  value       = module.database.server_fqdn
  description = "SQL server FQDN for the environment."
}
```

- [ ] **Step 6: Format + validate the module standalone**

Run:
```bash
cd infra/terraform/modules/env-stack
terraform fmt
terraform init -backend=false && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 7: Commit**

```bash
git add infra/terraform/modules/env-stack
git commit -m "feat(infra): wire serverless DB + app identity + auth secret scaffold into env-stack (#61)"
```

---

### Task 4: Pass new variables through the staging + production roots

**Files:**
- Modify: `infra/terraform/environments/staging/main.tf`
- Modify: `infra/terraform/environments/staging/variables.tf`
- Modify: `infra/terraform/environments/production/main.tf`
- Modify: `infra/terraform/environments/production/variables.tf`

**Interfaces:**
- Consumes: `env-stack` new inputs (Task 3).
- Produces: root variables `sql_admin_group_name`, `sql_admin_group_object_id`, `tenant_id`, `google_client_id`, `google_client_secret` (fed by CI as `TF_VAR_*`).

- [ ] **Step 1: Add the shared root variables to BOTH `staging/variables.tf` and `production/variables.tf`**

```hcl
variable "sql_admin_group_name" {
  type        = string
  description = "Display name of the Entra group set as the SQL server AAD admin."
}

variable "sql_admin_group_object_id" {
  type        = string
  description = "Object ID of the SQL admin Entra group."
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID."
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth client ID for Auth.js. Empty until issue #63."
  default     = ""
}

variable "google_client_secret" {
  type        = string
  description = "Google OAuth client secret for Auth.js. Empty until issue #63."
  default     = ""
  sensitive   = true
}
```

- [ ] **Step 2: Pass them into the `module "stack"` call in `staging/main.tf`**

Add to the existing `module "stack"` block, with staging's auto-pause = 60:
```hcl
  sql_admin_group_name           = var.sql_admin_group_name
  sql_admin_group_object_id      = var.sql_admin_group_object_id
  tenant_id                      = var.tenant_id
  db_auto_pause_delay_in_minutes = 60
  google_client_id               = var.google_client_id
  google_client_secret           = var.google_client_secret
```

- [ ] **Step 3: Pass them into the `module "stack"` call in `production/main.tf`**

Add to the existing `module "stack"` block, with production's auto-pause = -1 (warm):
```hcl
  sql_admin_group_name           = var.sql_admin_group_name
  sql_admin_group_object_id      = var.sql_admin_group_object_id
  tenant_id                      = var.tenant_id
  db_auto_pause_delay_in_minutes = -1
  google_client_id               = var.google_client_id
  google_client_secret           = var.google_client_secret
```

- [ ] **Step 4: Format + validate BOTH roots (the integration gate)**

Run:
```bash
cd infra/terraform
terraform fmt -recursive
terraform -chdir=environments/staging init -backend=false && terraform -chdir=environments/staging validate
terraform -chdir=environments/production init -backend=false && terraform -chdir=environments/production validate
```
Expected: `Success! The configuration is valid.` for both.

- [ ] **Step 5: Commit**

```bash
git add infra/terraform/environments
git commit -m "feat(infra): pass SQL admin + auth vars through staging/production roots (#61)"
```

---

### Task 5: Feed the new `TF_VAR_*` values from CI

**Files:**
- Modify: `.github/workflows/_terraform-env.yml:35-51` (the `env:` block)

**Interfaces:**
- Consumes: GitHub repo variables `SQL_AAD_ADMIN_GROUP_OBJECT_ID`, `SQL_AAD_ADMIN_GROUP_NAME`, `AZURE_TENANT_ID` (exists); optional secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (empty until #63).

- [ ] **Step 1: Append to the `env:` map in `_terraform-env.yml`**

```yaml
      TF_VAR_sql_admin_group_object_id: ${{ vars.SQL_AAD_ADMIN_GROUP_OBJECT_ID }}
      TF_VAR_sql_admin_group_name: ${{ vars.SQL_AAD_ADMIN_GROUP_NAME }}
      TF_VAR_tenant_id: ${{ vars.AZURE_TENANT_ID }}
      # Empty until issue #63 registers the OAuth app and sets these secrets.
      TF_VAR_google_client_id: ${{ secrets.GOOGLE_CLIENT_ID || '' }}
      TF_VAR_google_client_secret: ${{ secrets.GOOGLE_CLIENT_SECRET || '' }}
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/_terraform-env.yml`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/_terraform-env.yml
git commit -m "ci(infra): pass SQL admin + Google OAuth TF vars (#61)"
```

---

### Task 6: Guarded `prisma migrate deploy` in the deploy pipeline

**Files:**
- Modify: `.github/workflows/_deploy-env.yml` (add a migrate step before "Deploy image")

**Interfaces:**
- Consumes: existing inputs `resource_group`, `app_name`; derives server (`sql-czw-<env>`) and app identity (`id-czw-app-<env>`) names from the env suffix of `resource_group` (`rg-czw-<env>`).
- Produces: nothing downstream; inert until `prisma/schema.prisma` exists.

- [ ] **Step 1: Add a migrate step to `_deploy-env.yml` after "Assert app exists" and before "Deploy image"**

```yaml
      - name: Run database migrations
        run: |
          set -euo pipefail
          if [ ! -f prisma/schema.prisma ]; then
            echo "No prisma/schema.prisma yet — skipping migrations (inert until issue #62)."
            exit 0
          fi

          ENV_SUFFIX="${{ inputs.resource_group }}"; ENV_SUFFIX="${ENV_SUFFIX#rg-czw-}"
          SERVER="sql-czw-${ENV_SUFFIX}"
          APP_IDENTITY="id-czw-app-${ENV_SUFFIX}"
          RG="${{ inputs.resource_group }}"

          # Open the SQL firewall to this runner for the duration of the job.
          RUNNER_IP=$(curl -fsS https://api.ipify.org)
          RULE="ci-migrate-${GITHUB_RUN_ID}"
          az sql server firewall-rule create -g "$RG" -s "$SERVER" -n "$RULE" \
            --start-ip-address "$RUNNER_IP" --end-ip-address "$RUNNER_IP" -o none
          trap 'az sql server firewall-rule delete -g "$RG" -s "$SERVER" -n "$RULE" -o none || true' EXIT

          # Passwordless: az is logged in as the AAD admin (deploy SP is a member
          # of czw-sql-admins), so DefaultAzureCredential resolves via AzureCliCredential.
          export DATABASE_URL="sqlserver://${SERVER}.database.windows.net:1433;database=rsvp;authentication=DefaultAzureCredential;encrypt=true"

          # Idempotently grant the app's managed identity DB access.
          node scripts/ensure-db-user.mjs "$APP_IDENTITY"

          npm run --silent db:migrate:deploy
        env:
          NODE_ENV: production
```

- [ ] **Step 2: Note the two guarded dependencies for issue #62 (documentation-only in this task)**

The step references `scripts/ensure-db-user.mjs` and the `db:migrate:deploy` npm script. Both are **created by issue #62** (which introduces Prisma + the `mssql` driver). Until `prisma/schema.prisma` exists the step returns early, so CI stays green now. Add a one-line note to the PR body and to the design spec's "inert until #62" section — no file created here.

- [ ] **Step 3: Lint the workflow**

Run: `actionlint .github/workflows/_deploy-env.yml`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/_deploy-env.yml
git commit -m "ci(deploy): guarded prisma migrate deploy step (inert until #62) (#61)"
```

---

### Task 7: Operational docs — Entra admin group + repo variables

**Files:**
- Modify: `scripts/bootstrap-azure.sh` (add an idempotent block creating the group + repo vars, or a clearly-marked manual section if the script is Owner-run interactive)
- Modify: `docs/deployment/README.md` (RSVP database prerequisites subsection)

**Interfaces:** none (docs/ops).

- [ ] **Step 1: Read the current bootstrap script + README deployment doc to match their style**

Run: `sed -n '1,60p' scripts/bootstrap-azure.sh` and skim `docs/deployment/README.md` headings.

- [ ] **Step 2: Add a bootstrap block for the SQL admin group**

Add an idempotent section that: creates Entra group `czw-sql-admins`; adds the human admin(s) and the CI **deploy** service principal as members; sets GitHub repo variables `SQL_AAD_ADMIN_GROUP_OBJECT_ID` and `SQL_AAD_ADMIN_GROUP_NAME`. Use the script's existing `az ad group` / `gh variable set` idioms. Example core commands:

```bash
GROUP_NAME="czw-sql-admins"
GROUP_ID=$(az ad group show --group "$GROUP_NAME" --query id -o tsv 2>/dev/null || \
  az ad group create --display-name "$GROUP_NAME" --mail-nickname "$GROUP_NAME" --query id -o tsv)
az ad group member add --group "$GROUP_ID" --member-id "$DEPLOY_SP_OBJECT_ID" 2>/dev/null || true
gh variable set SQL_AAD_ADMIN_GROUP_OBJECT_ID --body "$GROUP_ID"
gh variable set SQL_AAD_ADMIN_GROUP_NAME --body "$GROUP_NAME"
```

- [ ] **Step 3: Document the prerequisite in `docs/deployment/README.md`**

Add an "RSVP database (Azure SQL)" subsection covering: the AAD-only server, the `czw-sql-admins` group (must include the deploy SP so CI migrations authenticate), the required repo variables (`SQL_AAD_ADMIN_GROUP_OBJECT_ID`, `SQL_AAD_ADMIN_GROUP_NAME`, `ADMIN_EMAIL_ALLOWLIST`), and that `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets stay empty until issue #63.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-azure.sh docs/deployment/README.md
git commit -m "docs(infra): bootstrap the SQL admin Entra group + repo vars (#61)"
```

---

### Task 8: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Terraform fmt + validate (all)**

Run:
```bash
cd infra/terraform
terraform fmt -check -recursive
terraform -chdir=environments/staging init -backend=false && terraform -chdir=environments/staging validate
terraform -chdir=environments/production init -backend=false && terraform -chdir=environments/production validate
```
Expected: no fmt diff; `Success!` for both roots.

- [ ] **Step 2: actionlint on changed workflows**

Run: `actionlint`
Expected: clean.

- [ ] **Step 3: Repo gate**

Run: `npm run lint && npm run build && npm run check:images`
Expected: all pass (no app-code change).

- [ ] **Step 4: Confirm no apply happened and the tree is clean**

Run: `git status && git log --oneline origin/master..HEAD`
Expected: clean tree; the Task 1–7 commits listed.

---

## Known risks (surface in the PR)

- **`azuread_authentication_only` + omitted admin login:** some azurerm versions historically still required `administrator_login`/`password`. `validate` won't catch a runtime API requirement — first real `apply` (on merge) is the proof. If apply rejects it, add a dummy `administrator_login` with `azuread_authentication_only = true` still enforcing AAD-only.
- **Global SQL server name uniqueness:** `sql-czw-<env>` must be globally unique; if `apply` fails on a name clash, add a `random_string` suffix in the `sql-database` module.
- **Prereq ordering:** the `czw-sql-admins` group + repo vars (Task 7) must exist before the first `infra.yml` apply, or the plan fails on unset `TF_VAR_sql_admin_group_object_id`.
