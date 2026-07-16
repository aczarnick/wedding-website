# Cloudflare custom domains + TLS for Azure Container Apps (issue #23)

**Date:** 2026-07-10
**Issue:** https://github.com/aczarnick/wedding-website/issues/23
**Status:** Approved design, pending implementation

## Goal

Serve the site on `czarnickwedding.com` (apex), `www.czarnickwedding.com`, and
`staging.czarnickwedding.com` through the Cloudflare proxy (Full strict TLS),
backed by the Azure Container Apps deployments, with the ACA origins locked to
Cloudflare IPs and deploy smoke tests routed through the public hostnames.
Everything reproducible in Terraform.

## Current state (verified 2026-07-10)

- Apex `czarnickwedding.com` is **live for guests**, proxied through Cloudflare
  to a **home server via Cloudflare Tunnel** (serves a different build than ACA;
  `x-served-by: czarnickwedding.com` header). Zero-downtime cutover required.
- `www` and `staging` have **no DNS records** (dead).
- No custom domains bound on either Container App; no `asuid.*` TXT records; no
  certs uploaded.
- Repo variables `ALLOWED_IP_RANGES_JSON`, `STAGING_SMOKE_HOST`,
  `PRODUCTION_SMOKE_HOST` do not exist. The pipeline is already wired to consume
  all three.
- Both ACA apps healthy on default FQDNs (cold start ~20-30 s from zero).
  Environments: `cae-czw-staging` (static IP 52.154.166.48),
  `cae-czw-production` (static IP 172.169.206.47), both Central US.

## Decisions (from design discussion)

1. **Full Terraform automation** — Cloudflare DNS, Origin CA cert issuance, ACA
   cert upload + hostname binding all in Terraform (Cloudflare provider v5).
2. **`min_replicas = 1` for production** (committed default) — no guest-facing
   cold starts (~$3–14/mo).
3. **`www` is bound to the production app** (serves the site directly, no
   redirect rule). It doubles as the pre-cutover verification host.
4. **Layout: extend the existing roots** (`shared` → `staging` → `production`),
   no new root module. Cert material flows from `shared` to the env roots via
   the existing remote-state read.
5. **Execution:** this session applies everything locally from the worktree and
   drives the live cutover (user flips/authorizes the apex change). No commits
   or PRs by the agent.

## Architecture

### Providers

- All three roots gain `cloudflare = { source = "cloudflare/cloudflare",
  version = "~> 5" }`; `shared` also gains `tls` (`hashicorp/tls`, `~> 4`).
- `modules/env-stack` declares `cloudflare` in its own `required_providers`
  (required for non-hashicorp providers used inside a module).
- Provider auth is env-var driven, matching the existing azurerm pattern (no
  credentials in HCL):
  - `CLOUDFLARE_API_TOKEN` — a single zone-scoped token: Zone:Read, DNS:Edit,
    Zone Settings:Edit, SSL and Certificates:Edit for `czarnickwedding.com`.
    SSL and Certificates:Edit covers Origin CA issuance. No Origin CA key:
    the provider forbids dual credentials and Origin CA keys are deprecated
    (removed by Cloudflare 2026-09-30).

### `shared` root (new resources)

- `data "cloudflare_zone"` — filter by `var.cloudflare_zone_name`
  (default `"czarnickwedding.com"`, committed).
- `tls_private_key` (RSA 2048) → `tls_cert_request` (CN apex, SANs apex +
  `*.czarnickwedding.com`) → `cloudflare_origin_ca_certificate`
  (`request_type = "origin-rsa"`, `requested_validity = 5475` days / 15 years).
  One cert serves both environments.
- `cloudflare_zone_setting` `ssl = "strict"` (Full strict). Safe to apply before
  cutover: the tunnel-served site does not use the origin-cert path.
- New outputs consumed by env roots: `cloudflare_zone_id`,
  `origin_certificate_pem`, `origin_private_key_pem` (sensitive).

### `env-stack` module (new, optional inputs — off when unset)

Inputs: `cloudflare_zone_id`, `custom_domains` (list of hostnames),
`origin_certificate_pem`, `origin_private_key_pem` (sensitive), plus
`cloudflare_zone_name` to detect the apex.

Resources (per hostname unless noted):

- `cloudflare_dns_record` **verification TXT**: name `asuid.<host>`, content =
  the app's `custom_domain_verification_id`. TXT validation works with the
  proxy on — the orange cloud never needs to come off.
- `cloudflare_dns_record` **host record**, `proxied = true`, `ttl = 1` (auto):
  - apex → `A` to the environment static IP
  - others → `CNAME` to the app's default FQDN
- `azurerm_container_app_environment_certificate` (one per env): the Origin CA
  cert + key PEM concatenated, base64-encoded, empty password.
- `azurerm_container_app_custom_domain` per hostname, SNI-bound to that cert,
  `depends_on` the TXT records (ownership validation precedes binding).
- `modules/container-app` gains an `id` output (needed by the binding resource).

### Env roots

- `staging`: `custom_domains = ["staging.czarnickwedding.com"]`.
- `production`: `custom_domains = ["czarnickwedding.com",
  "www.czarnickwedding.com"]`; `min_replicas` default `0` → `1`.

### Workflow changes

- `_terraform-env.yml`: pass the GitHub secret `CLOUDFLARE_API_TOKEN` as a job
  env var (the provider reads it natively). No workflow logic changes.

### Docs

- Rewrite the runbook section "Custom domains, TLS, and Cloudflare" in
  `docs/deployment/README.md`: credentials to mint, what Terraform now owns,
  the cutover checklist, and the origin-lock / smoke-host repo variables.
- `AGENTS.md` cost guardrails: production is now `min_replicas=1` (~$3–14/mo,
  deliberate; staging stays scale-to-zero).

## The apex cutover (zero downtime)

The apex record currently carries live guest traffic to the tunnel. Two
hazards: (a) Terraform cannot *create* the apex record while the tunnel record
exists (name conflict), and (b) a CNAME→A type change may plan as
delete-and-recreate (brief DNS gap). Sequencing:

1. **Targeted first apply** (documented one-time exception to "no `-target`"):
   apply production *excluding the apex host DNS record* — TXTs, cert, bindings
   (apex + www validate via TXT while apex still points at the tunnel), www
   host record.
2. **Verify www end-to-end**: `https://www.czarnickwedding.com` through the
   Cloudflare proxy serves the ACA build (asset-fingerprint check), valid cert.
3. **Import the existing apex record** into state, then `terraform plan`:
   - plan shows **update in-place** → apply (atomic API PATCH; Terraform flips
     the record).
   - plan shows **replacement** → do NOT apply; flip the record manually in the
     Cloudflare dashboard (single atomic edit → `A 172.169.206.47`, proxied),
     then `terraform plan` again → no-op.
4. **Verify apex** serves the ACA build. Old tunnel origin is now dark (user
   decommissions the tunnel at leisure — out of scope).

If the apex *binding* (step 1) is rejected by ARM despite the TXT record, stop
— the live site is unaffected — and reassess (fallback: bind apex immediately
after the DNS flip, accepting seconds of 404).

## Execution order (whole session)

1. User mints the Cloudflare API token; store as a GitHub secret
   (`gh secret set`), export locally for applies.
2. Apply `shared` (cert issued, SSL strict) — no traffic impact. Local applies
   pass exactly the pipeline's variables (`TF_VAR_alert_emails`,
   `TF_VAR_budget_start_date`, etc.) to avoid state churn.
3. Apply `staging`; verify `https://staging.czarnickwedding.com` (200 + smoke
   string, ACA build).
4. Production cutover per section above.
5. Set repo vars `STAGING_SMOKE_HOST=staging.czarnickwedding.com`,
   `PRODUCTION_SMOKE_HOST=czarnickwedding.com` **before** the origin lock (no
   window where a deploy smoke-tests the soon-to-be-blocked default FQDNs).
   Then **origin lock**: set repo var `ALLOWED_IP_RANGES_JSON` (Cloudflare
   IPv4 ranges, verified against https://www.cloudflare.com/ips/), re-apply
   staging + production with the same value locally. Verify: default FQDNs now
   refused, public hostnames still 200.
6. Dispatch the Deploy workflow to prove the smoke path through Cloudflare
   end-to-end. A change freeze holds from the first apply until the PR merges
   (Infra workflow disabled during execution, re-enabled at the end).
7. User reviews the worktree diff (code-reviewed) and PRs it. Until merge, live
   infra intentionally runs ahead of `master`; merging reconciles (the infra
   pipeline apply should then be a no-op).

## Security & trade-offs (accepted)

- The cert **private key lives in Terraform state** (AAD-locked storage
  account — same posture as existing alert-email handling). The provider
  credentials (the API token) are env-vars only and are never
  persisted to state. The 15-year Origin CA cert is trusted only by
  Cloudflare, limiting blast radius.
- ACA free managed certs deliberately avoided (silent renewal failure behind
  the proxy — see runbook).
- `-target` used exactly once, for the cutover, documented in the runbook.
- Authenticated Origin Pull (mTLS) remains optional future hardening — out of
  scope.

## Verification / done criteria

- `terraform fmt -check -recursive`, per-env `terraform validate`, and
  `actionlint` pass (CI gate).
- All three hostnames serve the ACA build through the Cloudflare proxy with
  valid TLS (Full strict).
- Direct requests to both default ACA FQDNs are blocked (origin locked).
- A Deploy workflow run passes both smoke tests via the public hostnames.
- `terraform plan` in all three env dirs is a no-op afterwards.
- Issue #23's checklist fully satisfied; `min_replicas=1` live in production.
