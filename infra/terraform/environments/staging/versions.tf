terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "azurerm" {
  features {}
  storage_use_azuread = true
  # Providers are registered out-of-band by bootstrap. The CI identity is only
  # RG-scoped Contributor and cannot register providers at subscription scope, so
  # stop azurerm v4 from auto-registering all of them (which 403s and fails plan).
  resource_provider_registrations = "none"
}
