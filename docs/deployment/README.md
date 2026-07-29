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

The RSVP feature uses an **Azure SQL logical server + one `rsvp` database per
environment**, provisioned by the `sql-database` module inside `env-stack`. No
new compute: the existing Container App reaches it.

**Passwordless for the app.** It connects with its per-env user-assigned
identity (`id-czw-app-<env>`) via `authentication=DefaultAzureCredential`, with
`AZURE_CLIENT_ID` naming which identity to present. No database secret exists in
Terraform state or in Container App config.

The server itself is **not** AAD-only. SQL authentication stays enabled for a
single consumer — the CI migrate job, whose engine cannot present an Entra token
(see [Why migrations use a password](#why-migrations-use-a-password-when-nothing-else-does)).
That means the public endpoint *is* reachable by password, so the firewall
matters: it allows Azure services plus a runner IP opened transiently per
migrate job, and the credential lives only in the `SQL_ADMIN_PASSWORD` GitHub
secret.

**Cost:** production is Basic (5 DTU, 2 GB) at a flat ~$4.90/mo — it never
pauses, so guests never eat a cold start (#104). Staging is serverless
(`GP_S_Gen5_1`) and auto-pauses after 60 min idle, since it idles enough for that
to pay off. Backup costs are covered under
[Backups and restore](#backups-and-restore).

### Prerequisites (set by `bootstrap-azure.sh`)

- Entra group **`czw-sql-admins`** is the server's AAD admin. It must contain the
  human admin(s) and the **deploy** identity (so CI migrations authenticate as
  admin via OIDC). Creating the group needs a directory role (e.g. Groups
  Administrator); if bootstrap can't create it, make it by hand.
- Repo variables **`SQL_AAD_ADMIN_GROUP_OBJECT_ID`** and
  **`SQL_AAD_ADMIN_GROUP_NAME`** (Terraform sets the AAD admin by object id, so
  the RG-Contributor infra identity needs no directory permission). These must
  exist **before** the first `infra` apply or the plan fails on an unset var.

### Directory Readers for the SQL server identity (manual, once per env)

The migrate job runs `CREATE USER [id-czw-app-<env>] FROM EXTERNAL PROVIDER`,
which makes the **server** call Microsoft Graph to resolve that name. Terraform
gives the server a system-assigned identity for the call, but the identity also
needs the **Directory Readers** role — a tenant-level grant that requires Global
Administrator, so the deploy service principal cannot make it and Terraform does
not own it. Without it the migrate job fails with:

```
Principal 'id-czw-app-staging' could not be resolved.
Server identity is not configured.
```

Run once per environment, **after** the `infra` apply that creates the server:

```bash
PRINCIPAL_ID=$(az sql server show -g rg-czw-staging -n sql-czw-staging \
  --query identity.principalId -o tsv)

az rest --method POST \
  --url https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments \
  --body "{\"principalId\":\"$PRINCIPAL_ID\",
           \"roleDefinitionId\":\"88d8e3e3-8f55-4a1e-953a-9b9898b8876b\",
           \"directoryScopeId\":\"/\"}"
```

`88d8e3e3-…` is the fixed template id of Directory Readers. Repeat with
`rg-czw-production` / `sql-czw-production`. Re-running returns a conflict, which
is harmless.

### Admin console sign-in

Terraform generates `AUTH_SECRET` (never hand-managed) and wires two more values
into the Container App. Both come from **GitHub secrets**, so they are masked in
pipeline logs:

| GitHub secret | Becomes | Shape |
| --- | --- | --- |
| `ADMIN_EMAIL` | `ADMIN_EMAIL` env var | Comma-separated addresses; doubles as the authorization allowlist |
| `ADMIN_PASSWORD_HASH` | `ADMIN_PASSWORD_HASH`, via the ACA secret `admin-password-hash` | scrypt hash from `npm run auth:hash` |

Generate the hash locally and paste the **hash**, never the password:

```bash
npm run auth:hash   # prompts for the password, prints scrypt:16384:8:1:<salt>:<key>
```

Until both secrets are set, the console denies every sign-in — `ADMIN_EMAIL`
unset is an empty allowlist, and the hash comparison fails against an empty
string. The app still boots normally: both are read inside functions, so
`next build` and `docker build` need no secrets. Because ACA rejects an empty
secret value, the `admin-password-hash` secret is created only once a non-empty
hash is supplied.

There is no OAuth provider. `src/auth.ts` uses a single Credentials provider
against this one local account.

Note the app's env and secrets are Terraform-managed: `ignore_changes` on the
Container App covers only the image, so any value set by hand in the portal is
reverted on the next `infra` apply. Set them as GitHub secrets, not in the
portal.

### Migrations

`deploy.yml` runs `prisma migrate deploy` against each env's DB before promoting
the image, so schema never lags the code. The full path is wired
(`scripts/ensure-db-user.mjs` grants the app identity least-privilege
read/write; `db:migrate:deploy` applies migrations), but it is **gated on the
`ENABLE_DB_MIGRATIONS` repo variable** and off by default — a deploy with it
unset is pure `az` CLI, exactly as before.

#### Why migrations use a password when nothing else does

`prisma migrate deploy` runs the **Rust** schema engine, not the JS driver
adapter the app uses. That engine's SQL Server connection string accepts only
`uid` / `user id` / `pwd` / `integratedsecurity` — there is no `authentication`
or `accesstoken` parameter, and `prisma.config.ts` has no `adapter` option on
Prisma 7. A managed-identity URL is therefore parsed with an empty user and
fails with:

```
P1000: Authentication failed against database server,
the provided database credentials for `` are not valid.
```

So the server keeps SQL authentication enabled alongside Entra. Azure's AAD-only
switch disables SQL auth for *every* principal including contained users, so
there is no way to scope this to a migrations-only login — the server admin
credential is the whole cost. The **app** is unaffected: it still connects
passwordlessly as `id-czw-app-<env>` through the driver adapter, and never sees
this password.

The login name is whatever Azure generated when the server was created AAD-only
(`CloudSA…`, different per environment). It is **not** renamed to something
tidier: `administrator_login` is ForceNew, so changing it plans as
`forces replacement` and would destroy the server and its database. Terraform
leaves it null and the migrate job reads it with `az sql server show`.

**Enabling it takes two applies.** The provider rejects a password while prior
state still says `azuread_authentication_only = true`, so the flip has to land
first:

1. Merge — `infra` applies the flip. `SQL_ADMIN_PASSWORD` is still unset, so
   Terraform leaves the password unmanaged. The plan is an in-place update.
2. Set the secret, then re-run the `infra` workflow manually:

   ```bash
   gh secret set SQL_ADMIN_PASSWORD --body "$(openssl rand -base64 32 | tr -d '=')"
   gh workflow run infra.yml
   ```

Stripping `=` keeps the value safe to interpolate into a `;`-delimited
connection string while still meeting Azure's complexity rules. Rotating it later
is a `gh secret set` plus one `infra` apply — the two-step dance is only needed
for the initial flip.

**Turning migrations on** (once, after the first `staging` apply creates the
server, and after the Directory Readers grant above — without it the job fails
before any migration runs):

```bash
gh variable set ENABLE_DB_MIGRATIONS --body true
```

`bootstrap-azure.sh` has already granted the deploy identity `SQL Server
Contributor` on the app RGs (to open/close a transient firewall rule for the
runner IP — GitHub runners aren't "Azure services") and added it to
`czw-sql-admins` (to authenticate as the AAD admin). The migrate job authenticates
passwordlessly via the runner's `az login` session. Migrations run per env in the
promote order: staging → (approval) → production.

### Backups and restore

Two layers, both configured in the `sql-database` module. Neither needs a
workflow, a credential, or a storage account.

| Layer | Window | Granularity | Survives server deletion? |
| --- | --- | --- | --- |
| Point-in-time restore (PITR) | 7 days | Any second | **No** |
| Long-term retention (LTR) | 52 weeks | Weekly | **Yes** |

**PITR** is Azure's automatic full/differential/log backup chain. It restores
production to any second in the last week, which is the layer for "a bad import
or bulk edit corrupted the guest list". `db_pitr_retention_days = 7` is both the
Azure default and the ceiling: retention is configurable 1–35 days on most
tiers, **but only 1–7 on Basic**, which production runs. It is pinned in
Terraform anyway so a portal edit gets reverted on the next apply. A plan-time
precondition rejects a value above the cap, so raising it later fails the plan
rather than the apply.

**LTR** copies a full backup to separate blob storage weekly and keeps it a year
(`db_ltr_weekly_retention = "P52W"`). These copies outlive the database, the
logical server, *and* the resource group, and restore to any server in the same
subscription — the only layer that survives a deletion. Two limits are inherent:
weekly is the finest granularity Azure offers (Microsoft controls the timing),
and the first copy can take up to **7 days** to appear after the policy is first
applied.

Staging overrides neither value: its PITR is pinned at the same default 7 days,
and with `db_ltr_weekly_retention` empty it gets no LTR policy at all. Note that
emptying that variable on an environment where LTR has *already* applied does not
clear the policy — Terraform simply stops managing it. Removing it for real is
`az sql db ltr-policy set --weekly-retention PT0S`.

**Cost:** PITR is **free** on DTU SKUs — its storage is bundled into the database
price, at any retention. LTR is the only billed layer, charged on actual
consumption with no free allowance (the vCore model's "free backup storage equal
to max data size" does not apply to DTU). The footprint is
`retained weekly copies × compressed database size`, so **~1.3 GB** at a ~25 MB
guest list, against a 2 GB database ceiling that caps the worst case at ~104 GB.
Multiply by the LRS backup-storage rate for the region on the
[pricing calculator](https://azure.microsoft.com/pricing/calculator/) for the
current figure — at these volumes it is a rounding error next to the ~$4.90/mo
database.

Backups inherit `storage_account_type = "Local"`, so they are LRS. Geo-restore
into another region is therefore **not** possible; that was a deliberate trade.

#### Restoring

A restore never overwrites the live database — Azure always creates a new one.
Recover into a scratch name, verify it, then swap.

```bash
RG=rg-czw-production
SERVER=sql-czw-production

# --- Point-in-time (within the last 7 days) ---
az sql db restore \
  --resource-group "$RG" --server "$SERVER" --name rsvp \
  --dest-name rsvp-restored \
  --time "2026-07-29T14:30:00Z"      # UTC, must be inside the retention window

# --- Long-term (weekly copies, up to a year back) ---
az sql db ltr-backup list \
  --location centralus --server "$SERVER" --database rsvp -o table

BACKUP_ID=$(az sql db ltr-backup show \
  --location centralus --server "$SERVER" --database rsvp \
  --name "<name-from-the-list>" --query id -o tsv)

az sql db ltr-backup restore \
  --dest-database rsvp-restored --dest-server "$SERVER" \
  --dest-resource-group "$RG" --backup-id "$BACKUP_ID"
```

Then verify the recovered copy and swap it in. Renaming is T-SQL, not `az`:

```sql
ALTER DATABASE [rsvp]          MODIFY NAME = [rsvp-old];
ALTER DATABASE [rsvp-restored] MODIFY NAME = [rsvp];
```

The app picks the new database up on its next connection — `DATABASE_URL` names
the database `rsvp`, so nothing needs redeploying. Drop `rsvp-old` once you are
satisfied; a Basic database is ~$4.90/mo for as long as you keep it around.

**If the whole server or resource group is gone**, only the LTR path works, and
it changes shape: run `az sql db ltr-backup list` with `--location` but no
`--resource-group`, restore into a *new* server, and note that you need
permissions scoped to the subscription rather than the resource group. Recreate
the server with `terraform apply` first so the restore has a target.

**Teardown leaves backups behind.** `terraform destroy` deletes the database but
**not** its LTR backups — that is precisely what makes them survive a deletion.
They keep billing until they expire, up to 52 weeks. To stop that, delete them
explicitly with `az sql db ltr-backup delete` after destroying the environment.
