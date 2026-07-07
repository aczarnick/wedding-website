terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

# Auth is driven by environment variables so the same config runs both locally
# (az CLI login) and in CI (OIDC: ARM_USE_OIDC / ARM_CLIENT_ID / ARM_TENANT_ID /
# ARM_SUBSCRIPTION_ID). Do not hardcode credentials or use_oidc here.
provider "azurerm" {
  features {}
  storage_use_azuread = true
}
