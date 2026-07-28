data "azurerm_resource_group" "env" {
  name = var.resource_group_name
}

# Workload-profiles (v2) environment: a Consumption profile still scales to zero
# at $0 idle, but keeps VNet / private-endpoint options open for the future RSVP
# database (a Consumption-only env cannot add those later).
resource "azurerm_container_app_environment" "this" {
  name                       = "cae-czw-${var.environment}"
  location                   = data.azurerm_resource_group.env.location
  resource_group_name        = data.azurerm_resource_group.env.name
  log_analytics_workspace_id = var.log_analytics_workspace_id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  tags = var.tags
}

module "app" {
  source = "../container-app"

  name                         = "ca-czw-${var.environment}"
  resource_group_name          = data.azurerm_resource_group.env.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  workload_profile_name        = "Consumption"
  acr_login_server             = var.acr_login_server
  acr_pull_identity_id         = var.acr_pull_identity_id
  min_replicas                 = var.min_replicas
  max_replicas                 = var.max_replicas
  allowed_ip_ranges            = var.allowed_ip_ranges
  additional_identity_ids      = [azurerm_user_assigned_identity.app.id]
  extra_env                    = local.app_env
  secrets                      = local.app_secrets
  secret_env                   = local.app_secret_env
  tags                         = var.tags
}

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

  # ACA rejects empty secret values, so the admin password hash appears only
  # once it is supplied. AUTH_SECRET is always present (generated).
  app_secrets = concat(
    [{ name = "auth-secret", value = random_id.auth_secret.b64_std }],
    var.admin_password_hash == "" ? [] : [{ name = "admin-password-hash", value = var.admin_password_hash }],
  )

  app_secret_env = concat(
    [{ name = "AUTH_SECRET", secret_name = "auth-secret" }],
    var.admin_password_hash == "" ? [] : [{ name = "ADMIN_PASSWORD_HASH", secret_name = "admin-password-hash" }],
  )

  # ADMIN_EMAIL is the allowlist, not a credential, so it stays a plain env var
  # — readable in the portal, where an ACA secret would only obscure the one
  # value an operator needs to confirm. It is still a sensitive TF variable so
  # GitHub masks it in pipeline logs, matching how alert_emails is handled.
  app_env = concat(
    [{ name = "DATABASE_URL", value = local.database_url }],
    var.admin_email == "" ? [] : [{ name = "ADMIN_EMAIL", value = var.admin_email }],
  )
}

resource "azurerm_consumption_budget_resource_group" "env" {
  name              = "budget-czw-${var.environment}"
  resource_group_id = data.azurerm_resource_group.env.id
  amount            = var.monthly_budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.alert_emails
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = var.alert_emails
  }
}
