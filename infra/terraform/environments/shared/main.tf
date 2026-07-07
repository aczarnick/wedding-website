# The resource group is created by bootstrap (so RBAC role assignments can be
# scoped to it before Terraform runs). Terraform manages only what lives inside.
data "azurerm_resource_group" "shared" {
  name = var.resource_group_name
}

resource "azurerm_log_analytics_workspace" "shared" {
  name                = "log-czw-shared"
  location            = data.azurerm_resource_group.shared.location
  resource_group_name = data.azurerm_resource_group.shared.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = var.log_analytics_daily_quota_gb
  tags                = var.tags
}

resource "azurerm_container_registry" "shared" {
  name                = var.acr_name
  location            = data.azurerm_resource_group.shared.location
  resource_group_name = data.azurerm_resource_group.shared.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# Runtime identity: Container Apps use this (AcrPull only) to pull images.
# Deliberately separate from the CI deploy identity (AcrPush).
resource "azurerm_user_assigned_identity" "acr_pull" {
  name                = "id-czw-acrpull"
  location            = data.azurerm_resource_group.shared.location
  resource_group_name = data.azurerm_resource_group.shared.name
  tags                = var.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.shared.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
  # Avoid a first-apply race where the identity's service principal is not yet
  # visible to AAD when the assignment is created.
  skip_service_principal_aad_check = true
}

data "azurerm_subscription" "current" {}

# Subscription-wide alert safety net. On pay-as-you-go there is no spending-limit
# hard cap, so these escalating email alerts (plus the structural caps:
# scale-to-zero, capped max_replicas, Basic SKUs, LA daily quota) are the spend
# guard. Alert-only by design — the site is never auto-taken-down.
resource "azurerm_consumption_budget_subscription" "safety_net" {
  name            = "budget-czw-subscription"
  subscription_id = data.azurerm_subscription.current.id
  amount          = var.subscription_budget_amount
  time_grain      = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 50
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.alert_emails
  }

  notification {
    enabled        = true
    threshold      = 75
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.alert_emails
  }

  notification {
    enabled        = true
    threshold      = 90
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.alert_emails
  }

  notification {
    enabled        = true
    threshold      = 100
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

# Alert-only, per-resource-group. Complements the subscription budget above.
resource "azurerm_consumption_budget_resource_group" "shared" {
  name              = "budget-czw-shared"
  resource_group_id = data.azurerm_resource_group.shared.id
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
