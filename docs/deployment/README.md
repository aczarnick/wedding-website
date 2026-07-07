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
context), least-privilege RBAC, the subscription budget, and all GitHub repo
variables + environments.

Then, by hand:

1. **GitHub → Settings → Environments**: add yourself as a **required reviewer**
   on `infra` and `production`. Confirm `production` is limited to the `master`
   branch.
2. **Keep the Free Trial spending limit ON.** Do **not** "upgrade to
   pay-as-you-go" until you have to. While it is on, Azure de-allocates services
   when the $200 credit is exhausted and **cannot bill you beyond it** — this,
   not the budgets, is your hard cap. (Budgets only email alerts. After the
   credit/30-day window the subscription pauses until you upgrade; once upgraded,
   only the alerts remain.)

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

Do this once per host (`czarnickwedding.com`, `www`, `staging`). Get each app's
values from Terraform outputs:

```bash
cd infra/terraform/environments/production   # or staging
terraform output      # default_fqdn, custom_domain_verification_id, environment_static_ip
```

1. **Cloudflare DNS — start DNS-only (grey cloud)** so ACA can validate cleanly:
   - `www` / `staging`: **CNAME** → the app's `default_fqdn`.
   - apex `czarnickwedding.com`: **A** → the app's `environment_static_ip`.
   - For each host add **TXT** `asuid.<host>` = the app's
     `custom_domain_verification_id`.
2. **Bind the domain** to the app (portal → Container App → Custom domains, or
   `az containerapp hostname add`).
3. **Certificate — use a Cloudflare Origin CA certificate** (do NOT use the ACA
   free managed cert: it silently fails to renew behind the Cloudflare proxy).
   Create an Origin cert in Cloudflare (covers `czarnickwedding.com` +
   `*.czarnickwedding.com`), then upload and bind it in **each** environment
   separately — `cae-czw-staging` and `cae-czw-production` are distinct ACA
   environments (`az containerapp hostname bind` / portal).
4. **Turn the Cloudflare proxy ON (orange cloud)** and set SSL/TLS mode to
   **Full (strict)**. This gives caching/WAF/DDoS protection and absorbs traffic
   spikes — a cost control, not just security.
5. **Lock the origin.** Set the Cloudflare IP ranges as a **GitHub repo
   variable** `ALLOWED_IP_RANGES_JSON` (NOT a local `terraform.tfvars` — the
   pipeline would revert that), then re-run the Infra workflow. Only Cloudflare
   can then reach ACA. Value (verify current list at https://www.cloudflare.com/ips/):

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

6. **Point smoke tests through Cloudflare.** Once the origin is IP-locked, GitHub
   runners can no longer reach the default ACA FQDN. Set repo variables
   `STAGING_SMOKE_HOST=staging.czarnickwedding.com` and
   `PRODUCTION_SMOKE_HOST=czarnickwedding.com` so deploys smoke-test through the
   public hostnames. (Leave them unset until the origin lock is in place.)

   Optional hardening: enable Cloudflare **Authenticated Origin Pull** (mTLS) for
   a stronger origin lock than IP allow-listing alone.

## Rollback

Single revision mode → roll back by redeploying a known-good image:
**Actions → Deploy → Run workflow**, set `image` to a previous ref, e.g.
`<acr>.azurecr.io/web@sha256:<digest>` or `<acr>.azurecr.io/web:<old-sha>`. It
skips the build and redeploys that exact image through staging → production.

## Keeping prod warm (optional)

Guests hitting a scaled-to-zero app pay a one-time cold start (~seconds). To
avoid it, change the **committed** default `min_replicas = 1` in
`infra/terraform/environments/production/variables.tf` and let the Infra
pipeline apply it (~$3–14/mo). Don't use a local `terraform.tfvars` — the
pipeline only passes the repo-variable-backed vars, so a tfvars override would be
reverted on the next apply.

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

## Future: RSVP API + database

The environments are Workload-Profiles (v2), so you can add a second Container
App (the API) into the same environment and attach an Azure Database for
PostgreSQL (Flexible Server, burstable B1ms is the cheap tier) with private
networking. Add its Terraform to the `env-stack` module and wire connection
settings through Container App secrets — do **not** put secrets in `.tfvars`
(state holds them in cleartext; the state account is AAD-locked but treat it
accordingly).
