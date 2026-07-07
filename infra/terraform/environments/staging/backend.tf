terraform {
  backend "azurerm" {
    resource_group_name = "rg-czw-tfstate"
    container_name      = "tfstate"
    key                 = "staging.tfstate"
    use_azuread_auth    = true
    # storage_account_name supplied at init:
    #   terraform init -backend-config="storage_account_name=<name>"
  }
}
