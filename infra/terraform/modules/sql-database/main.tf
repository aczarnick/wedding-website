# AAD-only server: no SQL login/password exists, so a public endpoint is not
# anonymously usable — every connection needs a valid Entra token from an
# authorized principal.
resource "azurerm_mssql_server" "this" {
  name                          = "sql-czw-${var.environment}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = "12.0"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true

  azuread_administrator {
    login_username              = var.aad_admin_login
    object_id                   = var.aad_admin_object_id
    tenant_id                   = var.tenant_id
    azuread_authentication_only = true
  }

  # `CREATE USER [name] FROM EXTERNAL PROVIDER` makes the *server* call Microsoft
  # Graph to resolve the name to a principal. Without an identity to call Graph
  # with, that fails: "Principal could not be resolved ... Server identity is not
  # configured", which broke the CI migrate job's ensure-db-user step.
  #
  # The identity alone is not enough — it also needs the Directory Readers role
  # in Entra ID, a tenant-level grant requiring Global Administrator that the
  # deploy service principal cannot make. See docs/deployment/README.md.
  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# Serverless General Purpose. min_capacity 0.5 vCore floor; storage LRS (Local)
# since the guest list is re-seedable and does not need geo-redundant backups.
resource "azurerm_mssql_database" "rsvp" {
  name                        = "rsvp"
  server_id                   = azurerm_mssql_server.this.id
  sku_name                    = "GP_S_Gen5_1"
  min_capacity                = 0.5
  max_size_gb                 = 2
  auto_pause_delay_in_minutes = var.auto_pause_delay_in_minutes
  storage_account_type        = "Local"

  tags = var.tags
}

# Lets the Container App (Azure outbound) reach the server. The 0.0.0.0 rule is
# Azure's "Allow all Azure services" convention. Non-Azure clients (e.g. the CI
# runner) add their own IP transiently in the migrate job.
resource "azurerm_mssql_firewall_rule" "allow_azure_services" {
  name             = "AllowAllAzureServices"
  server_id        = azurerm_mssql_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
