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
  cloudflare_zone_id         = data.terraform_remote_state.shared.outputs.cloudflare_zone_id
  cloudflare_zone_name       = data.terraform_remote_state.shared.outputs.cloudflare_zone_name
  custom_domains             = var.custom_domains
  origin_certificate_pem     = data.terraform_remote_state.shared.outputs.origin_certificate_pem
  origin_private_key_pem     = data.terraform_remote_state.shared.outputs.origin_private_key_pem
  alert_emails               = var.alert_emails
  monthly_budget_amount      = var.monthly_budget_amount
  budget_start_date          = var.budget_start_date
  tags                       = var.tags

  sql_admin_group_name      = var.sql_admin_group_name
  sql_admin_group_object_id = var.sql_admin_group_object_id
  sql_admin_login           = var.sql_admin_login
  sql_admin_password        = var.sql_admin_password
  tenant_id                 = var.tenant_id
  # Basic (5 DTU, 2 GB) is a flat ~$4.90/mo and never pauses, so guests never
  # eat a cold start. The previous serverless SKU with auto-pause disabled billed
  # ~0.68 vCore around the clock at $0.626/vCore-hour — ~$306/mo.
  db_sku_name = "Basic"
  # 7 is both the Azure default and the Basic-tier ceiling; pinning it puts the
  # value under Terraform so a portal edit is reverted. Free on DTU.
  db_pitr_retention_days = 7
  # A year of weekly full backups — the only layer that survives the server or
  # resource group being deleted. Covers well past the 2026-10-10 wedding, and
  # holds ~1.3 GB at a ~25 MB guest list. See docs/deployment/README.md.
  db_ltr_weekly_retention = "P52W"
  admin_email             = var.admin_email
  admin_password_hash     = var.admin_password_hash
}
