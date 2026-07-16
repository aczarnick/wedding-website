# Cloudflare Custom Domains + TLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `czarnickwedding.com`, `www`, and `staging` through the Cloudflare proxy (Full strict) from the Azure Container Apps, all managed by Terraform, with the origin IP-locked to Cloudflare and smoke tests routed through the public hostnames (GitHub issue #23).

**Architecture:** Extend the existing `shared → staging → production` Terraform roots. `shared` issues one Cloudflare Origin CA certificate (apex + wildcard) and sets zone SSL to strict; the `env-stack` module gains optional custom-domain inputs that create per-env DNS records, cert upload, and hostname bindings. The live apex record (currently a Cloudflare Tunnel to a home server, carrying guest traffic) is cut over zero-downtime via a targeted apply + import.

**Tech Stack:** Terraform ≥1.9, azurerm ~>4.0, cloudflare ~>5 (v5 schemas!), hashicorp/tls ~>4, GitHub Actions, `az`/`gh` CLIs.

**Spec:** `docs/superpowers/specs/2026-07-10-cloudflare-custom-domain-tls-design.md`

**Post-review amendments (2026-07-14):** Part A was implemented and code-reviewed; the as-built code differs from the task snippets below in these ways: host-record `content` wrapped in `sensitive()` (origin IP/FQDN out of public plan logs); TXT content pre-quoted (`"\"...\""`); env cert has `create_before_destroy` + fingerprint-suffixed name (safe rotation); module custom-domain variables are required (no empty defaults, `custom_domains=[]` is the opt-out) and the `zone_id != ""` gate is gone; no `provider "cloudflare"` blocks in staging/production roots; orphaned `custom_domain_verification_id`/`environment_static_ip` outputs removed from env roots + env-stack. Auth is **token-only** (2nd review round): Origin CA keys are deprecated by Cloudflare (removed 2026-09-30) and the provider forbids dual credentials — `CLOUDFLARE_API_USER_SERVICE_KEY` is gone from the workflow and Task 8; the token's SSL and Certificates:Edit covers Origin CA issuance. Shared cert chain got `create_before_destroy`; module `custom_domains` is `set(string)` (no locals); module providers are version-pinned. Part B expected-plan descriptions still hold.

## Global Constraints

- **NO git commits and NO PRs** — the user commits/PRs after review. Task boundaries end at verification, not commit. (Deviation from the usual plan style, per explicit user instruction.)
- All work happens in the worktree `.claude/worktrees/issue-23-cloudflare-domains` (branch `worktree-issue-23-cloudflare-domains`, based on `origin/master` @ `6ff83cd`).
- Verification gate for repo changes (from `AGENTS.md`): `terraform fmt -check -recursive infra/terraform`; per env `terraform -chdir=infra/terraform/environments/<env> init -backend=false && terraform validate`; `actionlint` for workflow changes.
- `.terraform.lock.hcl` files are committed artifacts — regenerate them with hashes for `linux_amd64` (CI) **and** `darwin_arm64` (local applies).
- Cloudflare provider is **v5**: resources are `cloudflare_dns_record` (not `cloudflare_record`), `cloudflare_zone_setting`, data `cloudflare_zone` uses `filter = { name = ... }`.
- Provider auth is env-var only, never in HCL: a single `CLOUDFLARE_API_TOKEN` (Zone:Read + DNS:Edit + Zone Settings:Edit + SSL and Certificates:Edit on the zone; the last covers Origin CA issuance).
- The apex serves live guest traffic from the old origin until Task 11 — nothing before Task 11 may modify the existing apex DNS record.
- Known live values: subscription `39aaecb8-c5d9-4cd4-9dab-125353808a9b`, state account `czwtfstate17540`, ACR `czwacr11821`, budget start `2026-08-01T00:00:00Z`, staging env static IP `52.154.166.48`, production env static IP `172.169.206.47`, prod default FQDN `ca-czw-production.whiteriver-ca9e24a5.centralus.azurecontainerapps.io`, staging default FQDN `ca-czw-staging.yellowforest-20879e09.centralus.azurecontainerapps.io`.
- **Change freeze during Part B (Tasks 9–14):** local state runs ahead of `master`, so no merges to master and no manual Infra/Deploy dispatches except Task 13's. A master Infra run would fail loudly (missing cloudflare provider/creds), not destroy — but don't rely on it: Task 9 disables the Infra workflow, Task 14 re-enables it. **PR #24 (eslint bump) is open — hold it until this merges.**
- **Execution shell model:** each Bash invocation gets a fresh shell — `export`/`cd` do NOT persist. Task 8 writes a `chmod 600` env file in the scratchpad; every Part B command is prefixed with `source "$ENVFILE" &&` and uses absolute `terraform -chdir=` paths (`WT=/Users/aczarnick/personal/repos/wedding-website/.claude/worktrees/issue-23-cloudflare-domains`).

---

## Part A — Repository changes (Tasks 1–7)

### Task 1: Cloudflare + TLS providers in all roots and the env-stack module

**Files:**
- Modify: `infra/terraform/environments/shared/versions.tf`
- Modify: `infra/terraform/environments/staging/versions.tf`
- Modify: `infra/terraform/environments/production/versions.tf`
- Create: `infra/terraform/modules/env-stack/versions.tf`

**Interfaces:**
- Produces: `cloudflare` provider available in all roots and inside `env-stack`; `tls` provider in `shared`.

- [ ] **Step 1: Add providers to `shared/versions.tf`**

Replace the `required_providers` block and append a provider block, keeping the existing azurerm provider block untouched:

```hcl
terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}
```

Append after the azurerm provider block:

```hcl
# Auth via the CLOUDFLARE_API_TOKEN env var — a GitHub secret in CI, exported
# locally; required scopes in docs/deployment/README.md. Never hardcode
# credentials here.
provider "cloudflare" {}
```

- [ ] **Step 2: Add cloudflare to `staging/versions.tf` and `production/versions.tf`**

Same edit in both files: add to `required_providers` (no `tls` needed here):

```hcl
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
```

and append the same commented `provider "cloudflare" {}` block as in Step 1.

- [ ] **Step 3: Create `modules/env-stack/versions.tf`**

Modules using non-hashicorp providers must declare the source themselves:

```hcl
terraform {
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}
```

- [ ] **Step 4: Regenerate lock files for both platforms**

```bash
for env in shared staging production; do
  terraform -chdir=infra/terraform/environments/$env providers lock \
    -platform=linux_amd64 -platform=darwin_arm64
done
```

Expected: each `.terraform.lock.hcl` gains `cloudflare/cloudflare` (and `hashicorp/tls` for shared) entries with hashes for both platforms. Verify existing azurerm entries keep both platforms too (`grep -c h1: infra/terraform/environments/shared/.terraform.lock.hcl` — every provider should list multiple hashes). Run this AFTER Step 3 (env-stack's `versions.tf` must exist so staging/production lock cloudflare); if `providers lock` complains about uninstalled modules, run `terraform -chdir=... init -backend=false` first.

- [ ] **Step 5: Verify**

```bash
terraform fmt -check -recursive infra/terraform
for env in shared staging production; do
  terraform -chdir=infra/terraform/environments/$env init -backend=false -input=false >/dev/null \
    && terraform -chdir=infra/terraform/environments/$env validate
done
```

Expected: fmt silent; three `Success! The configuration is valid.`

### Task 2: Origin CA certificate, zone lookup, SSL strict in `shared`

**Files:**
- Create: `infra/terraform/environments/shared/cloudflare.tf`
- Modify: `infra/terraform/environments/shared/variables.tf` (append)
- Modify: `infra/terraform/environments/shared/outputs.tf` (append)

**Interfaces:**
- Produces (remote-state outputs consumed by Task 5): `cloudflare_zone_id` (string), `cloudflare_zone_name` (string), `origin_certificate_pem` (string), `origin_private_key_pem` (string, sensitive).

- [ ] **Step 1: Append to `shared/variables.tf`**

```hcl
variable "cloudflare_zone_name" {
  type        = string
  description = "Cloudflare zone (the site's domain). Zone ID is looked up at plan time."
  default     = "czarnickwedding.com"
}
```

- [ ] **Step 2: Create `shared/cloudflare.tf`**

```hcl
data "cloudflare_zone" "site" {
  filter = {
    name = var.cloudflare_zone_name
  }
}

# Cloudflare-to-origin TLS mode. "strict" requires the origin to present a
# cert Cloudflare trusts — the Origin CA certificate below. Safe to enable
# before the apex cutover: Cloudflare Tunnel traffic ignores this path.
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = data.cloudflare_zone.site.id
  setting_id = "ssl"
  value      = "strict"
}

# One Origin CA certificate (apex + wildcard) shared by both environments.
# Trusted only by the Cloudflare edge, never by browsers. Deliberately NOT the
# ACA free managed cert (it silently fails to renew behind the proxy). The
# private key lives in Terraform state — the state account is AAD-locked.
resource "tls_private_key" "origin" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_cert_request" "origin" {
  private_key_pem = tls_private_key.origin.private_key_pem
  dns_names       = [var.cloudflare_zone_name, "*.${var.cloudflare_zone_name}"]

  subject {
    common_name = var.cloudflare_zone_name
  }
}

resource "cloudflare_origin_ca_certificate" "origin" {
  csr                = tls_cert_request.origin.cert_request_pem
  hostnames          = [var.cloudflare_zone_name, "*.${var.cloudflare_zone_name}"]
  request_type       = "origin-rsa"
  requested_validity = 5475 # 15 years — rotation is a manual re-apply, documented in the runbook
}
```

Note: if `validate`/`plan` reports the zone data source has no `id` attribute, use `zone_id`. One of the two exists in v5 — check `terraform providers schema -json` if unsure.

- [ ] **Step 3: Append to `shared/outputs.tf`**

```hcl
output "cloudflare_zone_id" {
  value       = data.cloudflare_zone.site.id
  description = "Cloudflare zone ID, consumed by the env stacks for DNS records."
}

output "cloudflare_zone_name" {
  value       = var.cloudflare_zone_name
  description = "Zone apex name — env stacks use it to pick A vs CNAME per hostname."
}

output "origin_certificate_pem" {
  value       = cloudflare_origin_ca_certificate.origin.certificate
  description = "Origin CA certificate (PEM), uploaded to each Container App Environment."
}

output "origin_private_key_pem" {
  value       = tls_private_key.origin.private_key_pem
  description = "Origin CA private key (PEM). Sensitive — lives only in state."
  sensitive   = true
}
```

- [ ] **Step 4: Verify** — same fmt/validate commands as Task 1 Step 5. Expected: pass.

### Task 3: `id` output on the container-app module

**Files:**
- Modify: `infra/terraform/modules/container-app/outputs.tf` (append)

**Interfaces:**
- Produces: `module.app.id` (Container App resource ID) for the binding resource in Task 4.

- [ ] **Step 1: Append to `outputs.tf`**

```hcl
output "id" {
  value       = azurerm_container_app.this.id
  description = "Container App resource ID (custom-domain bindings attach to it)."
}
```

- [ ] **Step 2: Verify** — fmt/validate as before. Expected: pass.

### Task 4: Custom-domain resources in the env-stack module

**Files:**
- Create: `infra/terraform/modules/env-stack/custom-domains.tf`
- Modify: `infra/terraform/modules/env-stack/variables.tf` (append)

**Interfaces:**
- Consumes: `module.app.id`, `module.app.default_fqdn`, `module.app.custom_domain_verification_id` (existing + Task 3), `azurerm_container_app_environment.this` (existing).
- Produces: DNS + binding resources at addresses `module.stack.cloudflare_dns_record.verification["<host>"]`, `module.stack.cloudflare_dns_record.host["<host>"]`, `module.stack.azurerm_container_app_environment_certificate.origin[0]`, `module.stack.azurerm_container_app_custom_domain.this["<host>"]` (exact addresses matter for Task 10/11 `-target`/`import`).

- [ ] **Step 1: Append to `modules/env-stack/variables.tf`**

```hcl
variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID. Empty disables all custom-domain management."
  default     = ""
}

variable "cloudflare_zone_name" {
  type        = string
  description = "Zone apex name. Hostnames equal to it get an A record to the environment static IP; others get a CNAME to the app FQDN."
  default     = ""
}

variable "custom_domains" {
  type        = list(string)
  description = "Public hostnames to bind to the app (behind the Cloudflare proxy)."
  default     = []
}

variable "origin_certificate_pem" {
  type        = string
  description = "Cloudflare Origin CA certificate (PEM), from the shared stack."
  default     = ""
}

variable "origin_private_key_pem" {
  type        = string
  description = "Origin CA private key (PEM), from the shared stack."
  default     = ""
  sensitive   = true
}
```

- [ ] **Step 2: Create `modules/env-stack/custom-domains.tf`**

```hcl
locals {
  custom_domains = var.cloudflare_zone_id != "" ? toset(var.custom_domains) : toset([])
}

# Hostname-ownership TXT records. ACA validates via asuid.<host>, which keeps
# working while the host record stays proxied (orange cloud) — that is what
# makes the zero-downtime apex cutover possible.
resource "cloudflare_dns_record" "verification" {
  for_each = local.custom_domains

  zone_id = var.cloudflare_zone_id
  name    = "asuid.${each.value}"
  type    = "TXT"
  content = module.app.custom_domain_verification_id
  ttl     = 1
}

# Cloudflare Origin CA cert for the environment. Deliberately not the ACA free
# managed cert, which silently fails to renew behind the Cloudflare proxy.
resource "azurerm_container_app_environment_certificate" "origin" {
  count = length(local.custom_domains) > 0 ? 1 : 0

  name                         = "cf-origin-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.this.id
  # trimspace + explicit newlines: a missing trailing newline between the two
  # PEM blocks would produce an unparseable bundle (opaque ARM error).
  certificate_blob_base64      = base64encode("${trimspace(var.origin_certificate_pem)}\n${trimspace(var.origin_private_key_pem)}\n")
  certificate_password         = ""
}

resource "azurerm_container_app_custom_domain" "this" {
  for_each = local.custom_domains

  name                                     = each.value
  container_app_id                         = module.app.id
  container_app_environment_certificate_id = azurerm_container_app_environment_certificate.origin[0].id
  certificate_binding_type                 = "SniEnabled"

  # Ownership validation reads the asuid TXT record.
  depends_on = [cloudflare_dns_record.verification]
}

# Proxied host records: apex -> A to the environment static IP; subdomains ->
# CNAME to the app's default FQDN. Created only after the hostname is bound so
# guests are never routed to an unbound host (ACA would 404).
resource "cloudflare_dns_record" "host" {
  for_each = local.custom_domains

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = each.value == var.cloudflare_zone_name ? "A" : "CNAME"
  content = each.value == var.cloudflare_zone_name ? azurerm_container_app_environment.this.static_ip_address : module.app.default_fqdn
  proxied = true
  ttl     = 1

  depends_on = [azurerm_container_app_custom_domain.this]
}
```

Known wrinkles (decide on real plan/apply output, not preemptively):
- Some cloudflare v5 releases require TXT `content` wrapped in escaped quotes (`"\"${...}\""`) and perma-diff otherwise. Task 14's `-detailed-exitcode` no-op check catches any perma-diff.
- ACA accepts PEM cert+key bundles (`az containerapp env certificate upload` documents `.pfx` or `.pem`), but the first live proof is the **staging** apply (safe host). If ARM rejects the PEM there, fall back to a passwordless PFX (e.g. `chilicat/pkcs12` provider) — do not debug on production.

- [ ] **Step 3: Verify** — fmt/validate as before. Expected: pass (module wiring completes in Task 5; defaults keep it inert).

### Task 5: Wire the roots (staging + production) and warm prod

**Files:**
- Modify: `infra/terraform/environments/staging/main.tf`
- Modify: `infra/terraform/environments/staging/variables.tf` (append)
- Modify: `infra/terraform/environments/production/main.tf`
- Modify: `infra/terraform/environments/production/variables.tf` (append + edit `min_replicas`)

**Interfaces:**
- Consumes: shared remote-state outputs from Task 2; module variables from Task 4.

- [ ] **Step 1: Append to `staging/variables.tf`**

```hcl
variable "custom_domains" {
  type        = list(string)
  description = "Public hostnames bound to the staging app (behind the Cloudflare proxy)."
  default     = ["staging.czarnickwedding.com"]
}
```

- [ ] **Step 2: Add to `module "stack"` in `staging/main.tf`** (after `allowed_ip_ranges`):

```hcl
  cloudflare_zone_id     = data.terraform_remote_state.shared.outputs.cloudflare_zone_id
  cloudflare_zone_name   = data.terraform_remote_state.shared.outputs.cloudflare_zone_name
  custom_domains         = var.custom_domains
  origin_certificate_pem = data.terraform_remote_state.shared.outputs.origin_certificate_pem
  origin_private_key_pem = data.terraform_remote_state.shared.outputs.origin_private_key_pem
```

- [ ] **Step 3: Append to `production/variables.tf`**

```hcl
variable "custom_domains" {
  type        = list(string)
  description = "Public hostnames bound to the production app (behind the Cloudflare proxy)."
  default     = ["czarnickwedding.com", "www.czarnickwedding.com"]
}
```

- [ ] **Step 4: Edit `min_replicas` in `production/variables.tf`**

```hcl
variable "min_replicas" {
  type        = number
  description = "Minimum replicas. 1 keeps prod warm so guests never hit a cold start (~$3-14/mo); 0 = cheapest."
  default     = 1
}
```

- [ ] **Step 5: Add the same five module arguments to `production/main.tf`** as Step 2 (identical lines — the remote-state reference name is the same in both roots).

- [ ] **Step 6: Verify** — fmt/validate as before. Expected: pass.

### Task 6: Pipeline gets the Cloudflare secrets

**Files:**
- Modify: `.github/workflows/_terraform-env.yml` (env block, after `TF_VAR_allowed_ip_ranges`)

- [ ] **Step 1: Append to the job `env:` block**

```yaml
      # Cloudflare provider auth — a single zone-scoped API token; required
      # scopes documented in docs/deployment/README.md (Custom domains).
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: Verify**

```bash
actionlint
```

Expected: no output (clean). If `actionlint` is not installed: `brew install actionlint` or `go run github.com/rhysd/actionlint/cmd/actionlint@latest`.

### Task 7: Documentation

**Files:**
- Modify: `docs/deployment/README.md` — replace the whole "Custom domains, TLS, and Cloudflare" section
- Modify: `AGENTS.md` — cost-guardrails paragraph

- [ ] **Step 1: Replace the runbook section** "## Custom domains, TLS, and Cloudflare" (keeping the heading) with:

```markdown
## Custom domains, TLS, and Cloudflare

Terraform manages all of it: Cloudflare DNS (proxied host records + `asuid.*`
verification TXTs), zone SSL mode **Full (strict)**, a 15-year **Cloudflare
Origin CA certificate** (issued in `shared`, uploaded and SNI-bound in each
environment), and the Container App hostname bindings. The committed hostname
sets live in each env root's `custom_domains` variable default.

Two GitHub **secrets** feed the providers (also export them for local applies):

- `CLOUDFLARE_API_TOKEN` — zone-scoped token: Zone:Read, DNS:Edit, Zone
  Settings:Edit, and SSL and Certificates:Edit on the zone (the last is a
  fallback auth path for Origin CA issuance).

Notes:

- The ACA **free managed cert is deliberately not used** — it silently fails to
  renew behind the Cloudflare proxy. The Origin CA cert is trusted only by
  Cloudflare, which is exactly the trust path in use.
- The Origin CA **private key and both Cloudflare credentials live in Terraform
  state** (AAD-locked storage account) — accepted trade-off, see the design doc.
- Hostname ownership is validated via the `asuid.*` TXT records, so records can
  stay **proxied (orange) the whole time**.
- Cert rotation before 2041: taint `tls_private_key.origin` in `shared` and
  re-apply shared → staging → production.

### Origin lock + smoke hosts (after DNS is live)

1. Set repo variable `ALLOWED_IP_RANGES_JSON` to the Cloudflare ranges (verify
   at https://www.cloudflare.com/ips/) and re-run Infra. Only Cloudflare can
   then reach the ACA default FQDNs:

   ```
   [{"name":"cf01","cidr":"173.245.48.0/20"},{"name":"cf02","cidr":"103.21.244.0/22"},
    {"name":"cf03","cidr":"103.22.200.0/22"},{"name":"cf04","cidr":"103.31.4.0/22"},
    {"name":"cf05","cidr":"141.101.64.0/18"},{"name":"cf06","cidr":"108.162.192.0/18"},
    {"name":"cf07","cidr":"190.93.240.0/20"},{"name":"cf08","cidr":"188.114.96.0/20"},
    {"name":"cf09","cidr":"197.234.240.0/22"},{"name":"cf10","cidr":"198.41.128.0/17"},
    {"name":"cf11","cidr":"162.158.0.0/15"},{"name":"cf12","cidr":"104.16.0.0/13"},
    {"name":"cf13","cidr":"104.24.0.0/14"},{"name":"cf14","cidr":"172.64.0.0/13"},
    {"name":"cf15","cidr":"131.0.72.0/22"}]
   ```

   IPv4 ranges only, deliberately: the origin is reached via the IPv4
   environment static IP, so Cloudflare's IPv6 egress ranges never apply here.

2. Set repo variables `STAGING_SMOKE_HOST=staging.czarnickwedding.com` and
   `PRODUCTION_SMOKE_HOST=czarnickwedding.com` so deploy smoke tests go through
   Cloudflare. Set them as soon as the public hostnames serve — mandatory
   before the origin lock, or the next deploy's smoke test hits the
   now-blocked default FQDNs and fails.

Optional hardening: Cloudflare **Authenticated Origin Pull** (mTLS) for a
stronger origin lock than IP allow-listing alone.

### One-time apex cutover (2026-07, for the record)

The apex previously served from a home server via Cloudflare Tunnel. Cutover
was: bind apex+www while the apex record still pointed at the tunnel (TXT
validation), verify `www` end-to-end, then flip the apex record to the
environment static IP (`terraform import` + apply, or an atomic dashboard edit
when the plan would replace rather than update). A targeted apply
(`-target=module.stack.azurerm_container_app_custom_domain.this ...`) was used
once to stage bindings before DNS — do not reach for `-target` in normal
operation.
```

- [ ] **Step 2: Also update the runbook architecture diagram note** — in the top diagram/description, nothing changes (already shows Cloudflare in front). Check the "Keeping prod warm (optional)" section: rewrite its first sentence to reflect that `min_replicas = 1` **is now the committed production default**, keeping the instructions for reverting to 0:

```markdown
## Keeping prod warm

Production's committed default is `min_replicas = 1` (~$3–14/mo) so guests
never hit a scale-from-zero cold start (~20–30 s). To go back to the cheapest
setup, change the committed default back to `0` in
`infra/terraform/environments/production/variables.tf` and let the Infra
pipeline apply it. Don't use a local `terraform.tfvars` — the pipeline only
passes the repo-variable-backed vars, so a tfvars override would be reverted on
the next apply.
```

- [ ] **Step 3: Update `AGENTS.md`** cost guardrails line. Replace:

`Spend is bounded structurally, not by a spending limit: scale-to-zero (min_replicas=0), capped max_replicas (staging 1, production 2), ...`

with:

`Spend is bounded structurally, not by a spending limit: staging scales to zero (min_replicas=0), production keeps one warm replica (min_replicas=1, deliberate — no guest-facing cold starts), capped max_replicas (staging 1, production 2), ...`

(keep the rest of the sentence unchanged).

- [ ] **Step 4: Verify** — `npm run lint` not needed (no app code); re-run the full Terraform gate + `actionlint` once more to close Part A:

```bash
terraform fmt -check -recursive infra/terraform && echo FMT-OK
for env in shared staging production; do
  terraform -chdir=infra/terraform/environments/$env validate
done
actionlint && echo LINT-OK
```

Expected: FMT-OK, 3× valid, LINT-OK.

---

## Part B — Live execution (Tasks 8–14; sequential, each gated on the previous)

> Run from the worktree. Every apply reviews the plan output first. The live
> site must keep serving from the old origin until Task 11 completes.

### Task 8: Credentials and local environment

Shell state does not persist between agent Bash calls — everything lands in an
env file, sourced by every subsequent command. `ENVFILE` below means
`<scratchpad>/issue23.env` (session scratchpad dir); `WT` means the worktree
absolute path (see Global Constraints).

- [ ] **Step 1 (USER):** In the Cloudflare dashboard create ONE API token, zone-scoped to `czarnickwedding.com`: **Zone:Read, DNS:Edit, Zone Settings:Edit, SSL and Certificates:Edit** (the last covers Origin CA issuance — do NOT create/configure an Origin CA key: the provider forbids dual credentials, and Origin CA keys are deprecated, removed 2026-09-30).

- [ ] **Step 2 (USER pastes value interactively):** Store as a GitHub secret AND into the env file without the value touching command args or history. User runs (via `!` prompt or their own terminal):

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo aczarnick/wedding-website        # paste when prompted
```

Then the user writes the value into the env file via a prompt-driven step (e.g. `read -rs` in their own shell, or pasting into the file with an editor). Agent must never echo the value.

- [ ] **Step 3: Build the env file** (agent appends the non-secret entries; file already holds `export CLOUDFLARE_API_TOKEN=...` from Step 2):

```bash
umask 077
cat >> "$ENVFILE" <<'EOF'
export ARM_SUBSCRIPTION_ID=39aaecb8-c5d9-4cd4-9dab-125353808a9b
export TF_VAR_budget_start_date=2026-08-01T00:00:00Z
export TF_VAR_tfstate_storage_account_name=czwtfstate17540
export TF_VAR_acr_name=czwacr11821
EOF
ALERT_EMAILS=$(az consumption budget show --budget-name budget-czw-shared \
  --scope "/subscriptions/39aaecb8-c5d9-4cd4-9dab-125353808a9b/resourceGroups/rg-czw-shared" \
  --query "notifications.*.contactEmails | [0]" -o json | jq -c .)
printf 'export TF_VAR_alert_emails=%q\n' "$ALERT_EMAILS" >> "$ENVFILE"
chmod 600 "$ENVFILE"
```

- [ ] **Step 4: Verify the env file** (without printing secrets):

```bash
source "$ENVFILE" && echo "token:${#CLOUDFLARE_API_TOKEN} emails:$TF_VAR_alert_emails"
```

Expected: non-zero token length, one-element JSON array for emails.

### Task 9: Apply `shared`

- [ ] **Step 1: Change freeze on** — disable the Infra workflow (re-enabled in Task 14) and confirm no Deploy is in flight:

```bash
gh workflow disable infra.yml --repo aczarnick/wedding-website
gh run list --repo aczarnick/wedding-website --workflow deploy.yml -L1 --json status
```

- [ ] **Step 2: SSL-strict pre-flight** — `ssl=strict` is **zone-wide**; every proxied record must be either tunnel-backed (`*.cfargotunnel.com` CNAME — tunnels bypass origin-TLS mode) or one of the three in-scope hosts:

```bash
source "$ENVFILE" && ZONE_ID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=czarnickwedding.com" | jq -r '.result[0].id') \
  && curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?proxied=true&per_page=100" \
  | jq -r '.result[] | [.name,.type,.content] | @tsv'
```

Any proxied record pointing at a raw non-TLS/self-signed origin (not a tunnel) = STOP, resolve with the user before applying strict.

- [ ] **Step 3: Plan:**

```bash
source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/shared" init -input=false -backend-config="storage_account_name=czwtfstate17540" \
  && terraform -chdir="$WT/infra/terraform/environments/shared" plan -input=false -out=tfplan
```

Expected plan: **create** `cloudflare_zone_setting.ssl`, `tls_private_key.origin`, `tls_cert_request.origin`, `cloudflare_origin_ca_certificate.origin`; **no changes** to any existing azurerm resource. Any unexpected diff = stop and investigate (local vars mismatch).

- [ ] **Step 4:** `source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/shared" apply -input=false tfplan`

If `cloudflare_origin_ca_certificate` alone fails 401/403: the token lacks (or mis-scopes) SSL and Certificates:Edit — re-mint the token; nothing else in shared depends on it, so stop-and-fix is safe.

- [ ] **Step 5: Verify** — `terraform -chdir=... output cloudflare_zone_id` non-empty; `terraform -chdir=... output -raw origin_certificate_pem | openssl x509 -noout -subject -enddate` shows CN `czarnickwedding.com`, expiry ~2041. Confirm zone SSL mode is now Full (strict) and the live site (old origin) still loads: `curl -fsS https://czarnickwedding.com/ >/dev/null && echo SITE-OK`.

### Task 10: Apply `staging`, verify the full chain on a safe host

- [ ] **Step 1:**

```bash
source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/staging" init -input=false -backend-config="storage_account_name=czwtfstate17540" \
  && terraform -chdir="$WT/infra/terraform/environments/staging" plan -input=false -out=tfplan
```

Expected creates: `module.stack.cloudflare_dns_record.verification["staging.czarnickwedding.com"]`, `...cloudflare_dns_record.host["staging.czarnickwedding.com"]` (CNAME, proxied), `...azurerm_container_app_environment_certificate.origin[0]`, `...azurerm_container_app_custom_domain.this["staging.czarnickwedding.com"]`. Nothing else.

- [ ] **Step 2:** `source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/staging" apply -input=false tfplan`

If the custom-domain bind fails on TXT validation timing, re-run the apply once (Cloudflare is authoritative; propagation is seconds). If TXT content quoting perma-diffs appear, apply the quoting fix from Task 4 and re-validate.

- [ ] **Step 3: Verify through Cloudflare (allow cold start):**

```bash
for i in $(seq 1 10); do curl -fsS --max-time 30 https://staging.czarnickwedding.com/ | grep -qF "October 10, 2026" && { echo STAGING-OK; break; }; sleep 6; done
curl -sSI https://staging.czarnickwedding.com/ | grep -i '^server: cloudflare' && echo PROXIED-OK
```

Expected: STAGING-OK and PROXIED-OK.

### Task 11: Production — staged bindings, then the apex cutover

- [ ] **Step 1: Targeted apply — everything except the apex host record** (one-time exception; the apex record would conflict with the live tunnel record):

```bash
source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/production" init -input=false -backend-config="storage_account_name=czwtfstate17540" \
  && terraform -chdir="$WT/infra/terraform/environments/production" plan -input=false -out=tfplan \
  -target='module.stack.azurerm_container_app_custom_domain.this' \
  -target='module.stack.cloudflare_dns_record.host["www.czarnickwedding.com"]'
```

Review: creates TXTs (apex + www), env cert, both bindings, the **www** host record, and updates the Container App (`min_replicas` 0→1). It must NOT touch any record named exactly `czarnickwedding.com`. Then:

```bash
source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/production" apply -input=false tfplan
```

If the two bindings (apex + www) 409-conflict against each other (concurrent PATCH of one app's ingress), re-run the apply or repeat it with `-parallelism=1` — don't investigate further.

If the **apex binding** is rejected by ARM despite the TXT record (validation policy on A-record hosts), stop — the live site is unaffected; fall back to binding apex right after the DNS flip in Step 4 (accepting seconds of 404) and note it.

- [ ] **Step 2: Verify www end-to-end** (proves cert + binding + proxy for the exact app the apex will move to):

```bash
for i in $(seq 1 10); do curl -fsS --max-time 30 https://www.czarnickwedding.com/ | grep -qF "October 10, 2026" && { echo WWW-OK; break; }; sleep 6; done
```

Also fingerprint-match www against the prod default FQDN (same `/_next/static/` asset set = same build).

- [ ] **Step 3: Import the live apex record**:

```bash
source "$ENVFILE" \
  && ZONE_ID=$(terraform -chdir="$WT/infra/terraform/environments/shared" output -raw cloudflare_zone_id) \
  && RECORD_ID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=czarnickwedding.com" \
    | jq -re '[.result[] | select(.type=="CNAME" or .type=="A") | .id]
              | if length == 1 then .[0] else error("expected exactly 1 apex host record, got \(length)") end') \
  && terraform -chdir="$WT/infra/terraform/environments/production" import \
       'module.stack.cloudflare_dns_record.host["czarnickwedding.com"]' "$ZONE_ID/$RECORD_ID"
```

The `length == 1` assertion is deliberate: apex names often carry MX/CAA records too, and a multi-line ID would garble the import mid-cutover.

- [ ] **Step 4: Plan the flip and choose the path:**

```bash
source "$ENVFILE" && terraform -chdir="$WT/infra/terraform/environments/production" plan -input=false -out=tfplan
```

- Plan says `~ update in-place` for the apex record (type CNAME→A, content → `172.169.206.47`) → `terraform apply -input=false tfplan` (atomic PATCH).
- Plan says `-/+ destroy and then create replacement` → **do not apply**. USER flips the record in the Cloudflare dashboard instead (edit existing record → type `A`, value `172.169.206.47`, proxy ON — one atomic edit), then `terraform plan` again → expect no changes (or a trivial in-place metadata diff; apply that).

- [ ] **Step 5: Verify the apex serves the ACA build:**

```bash
curl -fsS https://czarnickwedding.com/ | grep -qF "October 10, 2026" && echo APEX-OK
# fingerprint: apex asset set must now match the prod default FQDN, not the old origin
```

Also confirm the `x-served-by: czarnickwedding.com` header (old origin) is gone. The home tunnel is now dark — decommissioning it is the user's follow-up, out of scope.

### Task 12: Smoke hosts first, then the origin lock

- [ ] **Step 1: Set the smoke-host repo variables BEFORE the lock** (both public hostnames already serve after Task 11; doing this first means no window where a deploy would smoke-test the soon-to-be-blocked default FQDNs):

```bash
gh variable set STAGING_SMOKE_HOST --repo aczarnick/wedding-website --body staging.czarnickwedding.com
gh variable set PRODUCTION_SMOKE_HOST --repo aczarnick/wedding-website --body czarnickwedding.com
```

- [ ] **Step 2: Set the origin-lock repo variable and env file entry** (exact JSON below, after eyeballing https://www.cloudflare.com/ips/ for changes; IPv4-only is deliberate — the origin is reached via the IPv4 static IP):

```bash
CF_RANGES='[{"name":"cf01","cidr":"173.245.48.0/20"},{"name":"cf02","cidr":"103.21.244.0/22"},{"name":"cf03","cidr":"103.22.200.0/22"},{"name":"cf04","cidr":"103.31.4.0/22"},{"name":"cf05","cidr":"141.101.64.0/18"},{"name":"cf06","cidr":"108.162.192.0/18"},{"name":"cf07","cidr":"190.93.240.0/20"},{"name":"cf08","cidr":"188.114.96.0/20"},{"name":"cf09","cidr":"197.234.240.0/22"},{"name":"cf10","cidr":"198.41.128.0/17"},{"name":"cf11","cidr":"162.158.0.0/15"},{"name":"cf12","cidr":"104.16.0.0/13"},{"name":"cf13","cidr":"104.24.0.0/14"},{"name":"cf14","cidr":"172.64.0.0/13"},{"name":"cf15","cidr":"131.0.72.0/22"}]'
gh variable set ALLOWED_IP_RANGES_JSON --repo aczarnick/wedding-website --body "$CF_RANGES"
printf 'export TF_VAR_allowed_ip_ranges=%q\n' "$CF_RANGES" >> "$ENVFILE"
```

- [ ] **Step 3: Re-apply staging and production** (plan first; expected change: ingress `ip_security_restriction` blocks added on each app, nothing else):

```bash
source "$ENVFILE" && for env in staging production; do
  terraform -chdir="$WT/infra/terraform/environments/$env" plan -input=false -out=tfplan \
    && terraform -chdir="$WT/infra/terraform/environments/$env" apply -input=false tfplan
done
```

- [ ] **Step 4: Verify the lock:**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 30 https://ca-czw-production.whiteriver-ca9e24a5.centralus.azurecontainerapps.io/   # expect 403 (or connection reset), NOT 200
curl -fsS https://czarnickwedding.com/ | grep -qF "October 10, 2026" && echo STILL-UP
curl -fsS https://staging.czarnickwedding.com/ >/dev/null && echo STAGING-STILL-UP
```

### Task 13: End-to-end pipeline proof

- [ ] **Step 1: Dispatch Deploy** (rebuilds master HEAD — same site — and exercises both smoke tests through Cloudflare; **the production job pauses for the USER's approval** in the GitHub `production` environment):

```bash
gh workflow run deploy.yml --repo aczarnick/wedding-website
RUN_ID=$(gh run list --repo aczarnick/wedding-website --workflow deploy.yml -L1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --repo aczarnick/wedding-website
```

Expected: staging + production deploy jobs green with smoke tests hitting the public hostnames.

### Task 14: Final consistency checks and freeze-off

- [ ] **Step 1: No-op plans everywhere** (proves code == live state):

```bash
source "$ENVFILE" && for env in shared staging production; do
  terraform -chdir="$WT/infra/terraform/environments/$env" plan -input=false -detailed-exitcode
  echo "$env exit: $?"   # expect 0 (no changes) for all three
done
```

If production exits 2 with a perma-diff on `azurerm_container_app` ingress (bound domains surfacing on the computed block), the fix is extending that resource's `lifecycle ignore_changes` — known azurerm quirk, don't debug from scratch.

- [ ] **Step 2: `min_replicas=1` live:** `az containerapp show -g rg-czw-production -n ca-czw-production --query properties.template.scale.minReplicas` → `1`.

- [ ] **Step 3: Re-enable the Infra workflow** (freeze off):

```bash
gh workflow enable infra.yml --repo aczarnick/wedding-website
```

- [ ] **Step 4: Re-run the repo verification gate** (fmt, validate ×3, actionlint) one last time; then hand over to code review (separate workflow step — no commits).

- [ ] **Step 5: Handoff notes for the USER** (include in the final report):
  - PR the worktree branch promptly; until merge, live infra intentionally runs ahead of `master`.
  - The post-merge Infra run pauses **twice** for approvals (`infra` env for shared, `production` env) and should apply as a **no-op** — that no-op is the reconciliation proof.
  - Comment on issue #23 that the open question was resolved: full Terraform automation via the Cloudflare provider, token/key/private key in AAD-locked state accepted; then close it.
  - Decommission the home tunnel whenever convenient (nothing routes to it after the cutover).
  - Delete the scratchpad env file (`rm -P "$ENVFILE"`).

## Rollback notes

- Before Task 11 Step 4, nothing guest-facing changed: abort freely; optionally `terraform destroy -target` the new bindings/records or leave them (harmless).
- After the apex flip, rollback = point the apex record back at the tunnel (dashboard edit), which restores the old origin in seconds; then `terraform state rm 'module.stack.cloudflare_dns_record.host["czarnickwedding.com"]'` to stop Terraform from re-flipping — **and** drop the apex from `production/variables.tf`'s `custom_domains` default (or hold all applies), otherwise the next apply tries to create an A record over the live tunnel CNAME.
- Origin lock rollback = unset `ALLOWED_IP_RANGES_JSON`/`TF_VAR_allowed_ip_ranges` and re-apply (ingress open again).
