# Deploying czarnickwedding.com to Azure

Hosts the Next.js site on **Azure Container Apps** (scale-to-zero, ~$5–8/mo),
built and shipped by **GitHub Actions**, with all infrastructure in
**Terraform**. Staging and production are isolated environments; production
deploys require your approval.

```
Cloudflare (proxied, Full strict)
  czarnickwedding.com / www  ─▶ Container App (production)
  staging.czarnickwedding.com ─▶ Container App (staging)

Azure subscription
├── rg-czw-tfstate     state storage (AAD-auth only, versioned)      [bootstrap]
├── rg-czw-identity    id-czw-infra, id-czw-deploy (GitHub OIDC)      [bootstrap]
├── rg-czw-shared      ACR (Basic) · Log Analytics · id-czw-acrpull · budget
├── rg-czw-staging     Container App Env + App (min=0,max=1) · budget
└── rg-czw-production  Container App Env + App (min=0,max=2) · budget
```

## How it fits together

- **CI (`ci.yml`)** runs on every PR and push: lint, `next build`, `docker build`,
  `terraform fmt`/`validate`, `actionlint`. **PRs never receive cloud credentials.**
- **Infra (`infra.yml`)** runs on push to `master` under `infra/**`: `terraform
  apply` for `shared` → `staging` → `production`. `shared` and `production`
  require approval; `staging` is automatic.
- **Deploy (`deploy.yml`)** runs on push to `master` for app code: builds one
  image, pushes to ACR, deploys the **same digest** to staging then (after
  approval) production, blocking on a health-gated smoke test each time.
- Terraform owns everything **except the running image tag** (deploys set it via
  `az containerapp update`; `ignore_changes` prevents drift).

## One-time bootstrap

Run as subscription **Owner**, with `az`, `gh`, and `jq` installed:

```bash
az login
gh auth login
# edit the CONFIG block first if defaults don't suit you
ALERT_EMAIL="you@example.com" ./scripts/bootstrap-azure.sh
```

This creates the resource groups, the AAD-locked state storage, the two GitHub
OIDC identities (with federated credentials matching each job's environment
context), least-privilege RBAC, the required resource-provider registrations,
and the GitHub repo variables + environments. The alert email is stored as a
GitHub **secret** (`ALERT_EMAILS_JSON`), not a variable, so GitHub masks it in
Actions logs.

Then, by hand:

1. **GitHub → Settings → Environments**: add yourself as a **required reviewer**
   on `infra` and `production`. Confirm `production` is limited to the `master`
   branch.
2. **Cost control on pay-as-you-go.** This subscription runs on PAYG (the
   free-trial $200 spending limit — which was a hard cap — no longer applies;
   PAYG is required because free-trial subscriptions allow only one Container App
   Environment). There is **no hard spend cap on PAYG**; spend is bounded instead
   by:
   - **Structural caps (the real guard):** apps scale to zero (`min_replicas=0`),
     `max_replicas` capped (staging 1, prod 2 × 0.25 vCPU → compute ~$30/mo worst
     case), ACR Basic, Log Analytics `daily_quota_gb=1`, no premium resources,
     Cloudflare caching in front.
   - **Alerting:** a subscription-wide budget emails at 50/75/90/100% (actual +
     forecasted), plus per-RG budgets. Alerts only — nothing is auto-shut-down
     (the site stays reachable for guests).
   - **Manual kill switch** if a bill ever surprises you:
     `az containerapp ingress disable -g <rg> -n <app>` (parks the app at $0), or
     scale the whole thing down / delete the RG.

## Provision infrastructure

Either push an `infra/**` change to `master` (recommended — uses the pipeline),
or run locally per environment:

```bash
cd infra/terraform/environments/shared
terraform init -backend-config="storage_account_name=<TFSTATE_STORAGE_ACCOUNT>"
terraform apply -var 'acr_name=<ACR_NAME>' -var 'alert_emails=["you@example.com"]' \
                -var 'budget_start_date=2026-08-01T00:00:00Z'
```

Staging and production additionally need their own required vars:

```bash
cd infra/terraform/environments/staging   # then repeat for production
cp terraform.tfvars.example terraform.tfvars   # edit values
terraform init -backend-config="storage_account_name=<TFSTATE_STORAGE_ACCOUNT>"
terraform apply
```

Apply order is always **shared → staging → production** (staging/production read
shared's outputs). Locally, authenticate with `az login` and export
`ARM_SUBSCRIPTION_ID`; CI uses OIDC.

**After the first `shared` apply** (once the ACR exists), enable ARM-audience
tokens so Container Apps can pull images via managed identity:

```bash
az acr config authentication-as-arm update -n <ACR_NAME> --status enabled
```

The Container Apps come up on the public placeholder image until the first real
deploy replaces it.

## First deploy

Push any app change to `master`, or run **Actions → Deploy → Run workflow**. The
build job pushes `web:<sha>`, staging deploys automatically, then production
waits for your approval.

## Custom domains, TLS, and Cloudflare

Terraform manages all of it: Cloudflare DNS (proxied host records + `asuid.*`
verification TXTs), zone SSL mode **Full (strict)**, a 15-year **Cloudflare
Origin CA certificate** (issued in `shared`, uploaded and SNI-bound in each
environment), and the Container App hostname bindings. The committed hostname
sets live in each env root's `custom_domains` variable default.

One GitHub **secret** feeds the provider (also export it for local applies):

- `CLOUDFLARE_API_TOKEN` — a single zone-scoped token: **Zone:Read, DNS:Edit,
  Zone Settings:Edit, and SSL and Certificates:Edit** on the zone. The last
  permission covers Origin CA certificate issuance — do NOT also configure an
  Origin CA key: the provider forbids dual credentials, and Origin CA keys are
  deprecated (Cloudflare removes them 2026-09-30).

Notes:

- The ACA **free managed cert is deliberately not used** — it silently fails to
  renew behind the Cloudflare proxy. The Origin CA cert is trusted only by
  Cloudflare, which is exactly the trust path in use.
- The Origin CA **private key (and certificate) live in Terraform state**
  (AAD-locked storage account) — accepted trade-off, see
  `docs/superpowers/specs/2026-07-10-cloudflare-custom-domain-tls-design.md`.
  The provider credentials themselves are env-var-only and never persisted to
  state.
- Hostname ownership is validated via the `asuid.*` TXT records, so records can
  stay **proxied (orange) the whole time**.
- Cert rotation before 2041: taint `tls_private_key.origin` in `shared` and
  re-apply shared → staging → production. The env cert resource is
  create-before-destroy with a fingerprint-suffixed name, so the new cert
  exists before the old one is removed; the hostname bindings switch during
  each env apply (do it in a quiet moment — the binding switch may blip).

### Origin lock + smoke hosts (after DNS is live)

1. Set repo variables `STAGING_SMOKE_HOST=staging.czarnickwedding.com` and
   `PRODUCTION_SMOKE_HOST=czarnickwedding.com` so deploy smoke tests go through
   Cloudflare. Set them as soon as the public hostnames serve — mandatory
   before the origin lock, or the next deploy's smoke test hits the
   now-blocked default FQDNs and fails.

2. Set repo variable `ALLOWED_IP_RANGES_JSON` to the Cloudflare ranges (verify
   at https://www.cloudflare.com/ips/) and re-run Infra. Only Cloudflare can
   then reach the ACA default FQDNs. Don't use a local `terraform.tfvars` — the
   pipeline would revert it:

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

## Rollback

Single revision mode → roll back by redeploying a known-good image:
**Actions → Deploy → Run workflow**, set `image` to a previous ref, e.g.
`<acr>.azurecr.io/web@sha256:<digest>` or `<acr>.azurecr.io/web:<old-sha>`. It
skips the build and redeploys that exact image through staging → production.

## Keeping prod warm

Production's committed default is `min_replicas = 1` (~$3–14/mo) so guests
never hit a scale-from-zero cold start (~20–30 s). To go back to the cheapest
setup, change the committed default back to `0` in
`infra/terraform/environments/production/variables.tf` and let the Infra
pipeline apply it. Don't use a local `terraform.tfvars` — the pipeline only
passes the repo-variable-backed vars, so a tfvars override would be reverted on
the next apply.

## Teardown

Order matters (staging/production read shared's state; ACR must be empty):

```bash
# 1. destroy production, then staging
(cd infra/terraform/environments/production && terraform destroy)
(cd infra/terraform/environments/staging    && terraform destroy)
# 2. empty the ACR, then destroy shared
az acr repository delete -n <ACR_NAME> --repository web --yes
(cd infra/terraform/environments/shared      && terraform destroy)
# 3. remove bootstrap resources last (deletes remote state — export first if needed)
az group delete -n rg-czw-identity -y
az group delete -n rg-czw-tfstate  -y
```

## RSVP database (Azure SQL)

The RSVP feature uses an **Azure SQL logical server + one serverless database
(`rsvp`) per environment**, provisioned by the `sql-database` module inside
`env-stack`. No new compute: the existing Container App reaches it.

**Passwordless by design.** The server is **AAD-only**
(`azuread_authentication_only = true`) — no SQL login/password exists anywhere.
The app connects with its per-env user-assigned identity
(`id-czw-app-<env>`) via `authentication=ActiveDirectoryManagedIdentity`; there
is no secret in state or in Container App config. Because no password login
exists, the public endpoint is not anonymously usable — every connection needs a
valid Entra token from an authorised principal.

**Cost:** staging auto-pauses after 60 min idle (~$5/mo storage floor);
production runs warm (auto-pause disabled, min 0.5 vCore) to avoid a first-query
resume delay (~$15–30/mo). This is a deliberate trade against the "~$5/mo idle
floor" — consistent with production's warm `min_replicas = 1` policy.

### Prerequisites (set by `bootstrap-azure.sh`)

- Entra group **`czw-sql-admins`** is the server's AAD admin. It must contain the
  human admin(s) and the **deploy** identity (so CI migrations authenticate as
  admin via OIDC). Creating the group needs a directory role (e.g. Groups
  Administrator); if bootstrap can't create it, make it by hand.
- Repo variables **`SQL_AAD_ADMIN_GROUP_OBJECT_ID`** and
  **`SQL_AAD_ADMIN_GROUP_NAME`** (Terraform sets the AAD admin by object id, so
  the RG-Contributor infra identity needs no directory permission). These must
  exist **before** the first `infra` apply or the plan fails on an unset var.

### Auth.js secret plumbing (scaffolded here, filled by the auth issue)

Terraform generates `AUTH_SECRET` and wires the Container App env. The Google
OAuth secrets (`google-client-id` / `google-client-secret`) are defined but
**empty** — supplied later via the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
GitHub secrets once the OAuth app exists. The admin allowlist is a GitHub repo
variable **`ADMIN_EMAIL_ALLOWLIST`** (comma-separated emails), set by hand.

### Migrations

`deploy.yml` runs `prisma migrate deploy` against each env's DB before promoting
the image, so schema never lags the code. The full path is wired
(`scripts/ensure-db-user.mjs` grants the app identity least-privilege
read/write; `db:migrate:deploy` applies migrations), but it is **gated on the
`ENABLE_DB_MIGRATIONS` repo variable** and off by default — a deploy with it
unset is pure `az` CLI, exactly as before.

**Turning migrations on** (once, after the first `staging` apply creates the
server):

```bash
gh variable set ENABLE_DB_MIGRATIONS --body true
```

`bootstrap-azure.sh` has already granted the deploy identity `SQL Server
Contributor` on the app RGs (to open/close a transient firewall rule for the
runner IP — GitHub runners aren't "Azure services") and added it to
`czw-sql-admins` (to authenticate as the AAD admin). The migrate job authenticates
passwordlessly via the runner's `az login` session. Migrations run per env in the
promote order: staging → (approval) → production.
