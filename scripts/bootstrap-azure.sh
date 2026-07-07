#!/usr/bin/env bash
#
# One-time Azure + GitHub bootstrap for the czarnickwedding.com deployment.
#
# Run this ONCE, locally, signed in as an Owner of the subscription. It creates
# everything Terraform and the CI/CD pipelines depend on but cannot create
# themselves (state storage, CI identities, RBAC, GitHub config). Terraform then
# manages all the actual application infrastructure.
#
# Prerequisites:
#   - az CLI (az login) as subscription Owner
#   - gh CLI (gh auth login) with admin on the repo
#   - jq
#
# Idempotency: re-running is safe; existing resources are reused. Review the
# CONFIG block below before running.

set -euo pipefail

########## CONFIG — edit before first run ##########
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
LOCATION="${LOCATION:-centralus}"
GITHUB_REPO="${GITHUB_REPO:-aczarnick/wedding-website}"
ALERT_EMAIL="${ALERT_EMAIL:-you@example.com}"
# Budget start must be the first day of a month, RFC3339 UTC:
BUDGET_START_DATE="${BUDGET_START_DATE:-2026-08-01T00:00:00Z}"
# Names are reused across re-runs so the script is idempotent: an explicit env
# var wins, else the value already stored in the repo's GitHub variables, else a
# fresh random name. (Both must be globally unique — ACR: alphanumeric 5-50;
# storage: lowercase alphanumeric 3-24.)
EXISTING_ACR=$(gh variable get ACR_NAME -R "$GITHUB_REPO" 2>/dev/null || true)
EXISTING_SA=$(gh variable get TFSTATE_STORAGE_ACCOUNT -R "$GITHUB_REPO" 2>/dev/null || true)
ACR_NAME="${ACR_NAME:-${EXISTING_ACR:-czwacr$RANDOM}}"
TFSTATE_SA="${TFSTATE_SA:-${EXISTING_SA:-czwtfstate$RANDOM}}"
####################################################

ISSUER="https://token.actions.githubusercontent.com"
AUDIENCE="api://AzureADTokenExchange"

RG_TFSTATE="rg-czw-tfstate"
RG_IDENTITY="rg-czw-identity"
RG_SHARED="rg-czw-shared"
RG_STAGING="rg-czw-staging"
RG_PRODUCTION="rg-czw-production"

echo "Subscription : $SUBSCRIPTION_ID"
echo "Location     : $LOCATION"
echo "Repo         : $GITHUB_REPO"
echo "ACR name     : $ACR_NAME"
echo "State account: $TFSTATE_SA"
echo
read -r -p "Proceed? [y/N] " ok
[ "$ok" = "y" ] || { echo "Aborted."; exit 1; }

az account set --subscription "$SUBSCRIPTION_ID"
TENANT_ID=$(az account show --query tenantId -o tsv)
CURRENT_USER_OID=$(az ad signed-in-user show --query id -o tsv)

echo "==> Register resource providers (not auto-registered on fresh subscriptions)"
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry \
          Microsoft.Insights Microsoft.ManagedIdentity Microsoft.Storage; do
  az provider register --namespace "$ns" --wait --only-show-errors
done

echo "==> Resource groups"
for rg in "$RG_TFSTATE" "$RG_IDENTITY" "$RG_SHARED" "$RG_STAGING" "$RG_PRODUCTION"; do
  az group create -n "$rg" -l "$LOCATION" --only-show-errors -o none
done

echo "==> Terraform state storage"
if az storage account show -n "$TFSTATE_SA" -g "$RG_TFSTATE" -o none 2>/dev/null; then
  echo "   state account $TFSTATE_SA already exists — reusing (skipping create/lock)"
else
  az storage account create -n "$TFSTATE_SA" -g "$RG_TFSTATE" -l "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
    --allow-blob-public-access false --https-only true --only-show-errors -o none
  az storage account blob-service-properties update --account-name "$TFSTATE_SA" \
    --enable-versioning true \
    --enable-delete-retention true --delete-retention-days 7 \
    --enable-container-delete-retention true --container-delete-retention-days 7 \
    --only-show-errors -o none
  # Create the container using the account key (before we disable key access)...
  SA_KEY=$(az storage account keys list -n "$TFSTATE_SA" -g "$RG_TFSTATE" --query "[0].value" -o tsv)
  az storage container create -n tfstate --account-name "$TFSTATE_SA" \
    --account-key "$SA_KEY" --only-show-errors -o none
  # ...then lock the account to Entra (AAD) auth only. Terraform authenticates
  # with OIDC + the infra identity's data-plane role assignment below.
  az storage account update -n "$TFSTATE_SA" -g "$RG_TFSTATE" \
    --allow-shared-key-access false --only-show-errors -o none
fi

SA_ID=$(az storage account show -n "$TFSTATE_SA" -g "$RG_TFSTATE" --query id -o tsv)
# You (and later the infra identity) read/write state over AAD:
az role assignment create --assignee-object-id "$CURRENT_USER_OID" \
  --assignee-principal-type User \
  --role "Storage Blob Data Contributor" --scope "$SA_ID" --only-show-errors -o none || true

echo "==> CI managed identities"
az identity create -n id-czw-infra -g "$RG_IDENTITY" -l "$LOCATION" --only-show-errors -o none
az identity create -n id-czw-deploy -g "$RG_IDENTITY" -l "$LOCATION" --only-show-errors -o none

INFRA_CLIENT_ID=$(az identity show -n id-czw-infra -g "$RG_IDENTITY" --query clientId -o tsv)
INFRA_PRINCIPAL_ID=$(az identity show -n id-czw-infra -g "$RG_IDENTITY" --query principalId -o tsv)
DEPLOY_CLIENT_ID=$(az identity show -n id-czw-deploy -g "$RG_IDENTITY" --query clientId -o tsv)
DEPLOY_PRINCIPAL_ID=$(az identity show -n id-czw-deploy -g "$RG_IDENTITY" --query principalId -o tsv)

# Tolerate the idempotent "already exists" case; surface any other failure loudly
# (a silently-missing federated credential or role assignment only shows up later
# as an opaque OIDC/403 error at pipeline time).
fed_cred() { # identity-name  cred-name  subject
  local out
  if ! out=$(az identity federated-credential create \
    --name "$2" --identity-name "$1" -g "$RG_IDENTITY" \
    --issuer "$ISSUER" --subject "$3" --audiences "$AUDIENCE" \
    --only-show-errors -o none 2>&1); then
    echo "$out" | grep -qiE "already exists|exists" || echo "WARN: federated cred '$2' on '$1' failed: $out" >&2
  fi
}

# The OIDC token SUBJECT depends on the job's `environment:` — a gated job's
# subject is repo:...:environment:<name>, an ungated job's is the branch ref.
# Infra: shared apply -> environment:infra, staging apply -> master ref,
#        production apply -> environment:production. Purge (schedule) -> ref.
fed_cred id-czw-infra  master      "repo:${GITHUB_REPO}:ref:refs/heads/master"
fed_cred id-czw-infra  env-infra   "repo:${GITHUB_REPO}:environment:infra"
fed_cred id-czw-infra  env-prod    "repo:${GITHUB_REPO}:environment:production"
# Deploy: build + staging deploy -> master ref, production deploy -> environment:production.
fed_cred id-czw-deploy master      "repo:${GITHUB_REPO}:ref:refs/heads/master"
fed_cred id-czw-deploy env-prod    "repo:${GITHUB_REPO}:environment:production"

echo "==> RBAC"
SUB_SCOPE="/subscriptions/${SUBSCRIPTION_ID}"
assign() { # assignee-object-id  role  scope
  local out
  if ! out=$(az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
    --role "$2" --scope "$3" --only-show-errors -o none 2>&1); then
    echo "$out" | grep -qiE "already exists|RoleAssignmentExists" || echo "WARN: role '$2' at '$3' failed: $out" >&2
  fi
}

# Infra identity: manage resources + budgets in the three managed RGs, and
# read/write Terraform state over AAD.
for rg in "$RG_SHARED" "$RG_STAGING" "$RG_PRODUCTION"; do
  RG_ID=$(az group show -n "$rg" --query id -o tsv)
  assign "$INFRA_PRINCIPAL_ID" "Contributor" "$RG_ID"
  assign "$INFRA_PRINCIPAL_ID" "Cost Management Contributor" "$RG_ID"
done
assign "$INFRA_PRINCIPAL_ID" "Storage Blob Data Contributor" "$SA_ID"

# Deploy identity: least-privilege custom role for `az containerapp update` +
# AcrPush on the registry. (Falls back automatically to no-op if role exists.)
ROLE_NAME="Container Apps Deployer (czw)"
if ! az role definition list --name "$ROLE_NAME" --query "[0].roleName" -o tsv | grep -q .; then
  az role definition create --role-definition "{
    \"Name\": \"${ROLE_NAME}\",
    \"Description\": \"Update Container Apps images and read revisions.\",
    \"AssignableScopes\": [\"${SUB_SCOPE}\"],
    \"Actions\": [
      \"Microsoft.App/containerApps/read\",
      \"Microsoft.App/containerApps/write\",
      \"Microsoft.App/containerApps/listSecrets/action\",
      \"Microsoft.App/containerApps/revisions/read\",
      \"Microsoft.App/managedEnvironments/read\",
      \"Microsoft.Resources/subscriptions/resourceGroups/read\"
    ]
  }" --only-show-errors -o none
  echo "   waiting for the custom role to become assignable..."
  for _ in $(seq 1 20); do
    az role definition list --name "$ROLE_NAME" --query "[0].id" -o tsv 2>/dev/null | grep -q . && break
    sleep 10
  done
fi
for rg in "$RG_STAGING" "$RG_PRODUCTION"; do
  RG_ID=$(az group show -n "$rg" --query id -o tsv)
  assign "$DEPLOY_PRINCIPAL_ID" "$ROLE_NAME" "$RG_ID"
done
# AcrPush scoped to the shared RG (covers the ACR once Terraform creates it):
RG_SHARED_ID=$(az group show -n "$RG_SHARED" --query id -o tsv)
assign "$DEPLOY_PRINCIPAL_ID" "AcrPush" "$RG_SHARED_ID"

# Note: per-resource-group budgets (with email alerts) are created by Terraform.
# A subscription-level budget can be added in the portal if desired, but the
# Free Trial spending limit — not budgets — is the real hard cap on spend.

echo "==> GitHub repository variables"
gh_var() { gh variable set "$1" -R "$GITHUB_REPO" -b "$2"; }
gh_var AZURE_TENANT_ID       "$TENANT_ID"
gh_var AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
gh_var AZURE_INFRA_CLIENT_ID "$INFRA_CLIENT_ID"
gh_var AZURE_DEPLOY_CLIENT_ID "$DEPLOY_CLIENT_ID"
gh_var TFSTATE_STORAGE_ACCOUNT "$TFSTATE_SA"
gh_var ACR_NAME              "$ACR_NAME"
gh_var ALERT_EMAILS_JSON     "[\"${ALERT_EMAIL}\"]"
gh_var BUDGET_START_DATE     "$BUDGET_START_DATE"

echo "==> GitHub Environments"
# Create the environments; production is locked to the master branch. Required
# reviewers must be added by hand (manual step 1 below) — the API needs your
# numeric GitHub user id and a human decision about who approves.
gh api --method PUT "repos/${GITHUB_REPO}/environments/infra" >/dev/null
# -F sends typed booleans; -f would send the string "true" and the API rejects it (422).
gh api --method PUT "repos/${GITHUB_REPO}/environments/production" \
  -F "deployment_branch_policy[protected_branches]=true" \
  -F "deployment_branch_policy[custom_branch_policies]=false" >/dev/null

cat <<EOF

=================================================================
Bootstrap complete. Recorded to GitHub repo variables:
  AZURE_TENANT_ID / AZURE_SUBSCRIPTION_ID
  AZURE_INFRA_CLIENT_ID  = $INFRA_CLIENT_ID
  AZURE_DEPLOY_CLIENT_ID = $DEPLOY_CLIENT_ID
  TFSTATE_STORAGE_ACCOUNT= $TFSTATE_SA
  ACR_NAME               = $ACR_NAME

MANUAL steps still required (see docs/deployment/README.md):
  1. In GitHub: add yourself as a required reviewer on the 'infra' and
     'production' environments (Settings > Environments). Confirm 'production'
     is limited to the 'master' branch.
  2. Keep the Free Trial spending limit ON (do NOT "upgrade to pay-as-you-go")
     until you must — it is the true hard cap on spend.
  3. After the first 'shared' Terraform apply creates the ACR, enable ARM-audience
     tokens so Container Apps can pull via managed identity:
       az acr config authentication-as-arm update -n $ACR_NAME --status enabled
  4. Set 'acr_name' in infra/terraform/environments/shared to: $ACR_NAME
     (or rely on the TF_VAR_acr_name repo variable — already set).
=================================================================
EOF
