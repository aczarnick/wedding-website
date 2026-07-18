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

  environment                = "staging"
  resource_group_name        = var.resource_group_name
  log_analytics_workspace_id = data.terraform_remote_state.shared.outputs.log_analytics_workspace_id
  acr_login_server           = data.terraform_remote_state.shared.outputs.acr_login_server
  acr_pull_identity_id       = data.terraform_remote_state.shared.outputs.acr_pull_identity_id
  min_replicas               = var.min_replicas
  max_replicas               = var.max_replicas
  allowed_ip_ranges          = var.allowed_ip_ranges
  cloudflare_zone_id         = data.terraform_remote_state.shared.outputs.cloudflare_zone_id
  cloudflare_zone_name       = data.terraform_remote_state.shared.outputs.cloudflare_zone_name
  custom_domains             = var.custom_domains
  origin_certificate_pem     = data.terraform_remote_state.shared.outputs.origin_certificate_pem
  origin_private_key_pem     = data.terraform_remote_state.shared.outputs.origin_private_key_pem
  alert_emails               = var.alert_emails
  monthly_budget_amount      = var.monthly_budget_amount
  budget_start_date          = var.budget_start_date
  tags                       = var.tags

  sql_admin_group_name           = var.sql_admin_group_name
  sql_admin_group_object_id      = var.sql_admin_group_object_id
  tenant_id                      = var.tenant_id
  db_auto_pause_delay_in_minutes = 60
  google_client_id               = var.google_client_id
  google_client_secret           = var.google_client_secret
}
