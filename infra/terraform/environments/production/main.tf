data "terraform_remote_state" "shared" {
  backend = "azurerm"
  config = {
    resource_group_name  = "rg-czw-tfstate"
    storage_account_name = var.tfstate_storage_account_name
    container_name       = "tfstate"
    key                  = "shared.tfstate"
    use_azuread_auth     = true
  }
}

module "stack" {
  source = "../../modules/env-stack"

  environment                = "production"
  resource_group_name        = var.resource_group_name
  log_analytics_workspace_id = data.terraform_remote_state.shared.outputs.log_analytics_workspace_id
  acr_login_server           = data.terraform_remote_state.shared.outputs.acr_login_server
  acr_pull_identity_id       = data.terraform_remote_state.shared.outputs.acr_pull_identity_id
  min_replicas               = var.min_replicas
  max_replicas               = var.max_replicas
  allowed_ip_ranges          = var.allowed_ip_ranges
  alert_emails               = var.alert_emails
  monthly_budget_amount      = var.monthly_budget_amount
  budget_start_date          = var.budget_start_date
  tags                       = var.tags
}
