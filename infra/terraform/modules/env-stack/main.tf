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
  tags                         = var.tags
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
