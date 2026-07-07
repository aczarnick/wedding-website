terraform {
  backend "azurerm" {
    resource_group_name = "rg-czw-tfstate"
    container_name      = "tfstate"
    key                 = "shared.tfstate"
    use_azuread_auth    = true
    # storage_account_name is globally unique (created by bootstrap) and is
    # supplied at init time:
    #   terraform init -backend-config="storage_account_name=<name>"
  }
}
