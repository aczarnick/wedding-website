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
    tls = {
      source  = "hashicorp/tls"
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
  # Providers are registered out-of-band by bootstrap. The CI identity is only
  # RG-scoped Contributor and cannot register providers at subscription scope, so
  # stop azurerm v4 from auto-registering all of them (which 403s and fails plan).
  resource_provider_registrations = "none"
}

# Auth via the CLOUDFLARE_API_TOKEN env var — a GitHub secret in CI, exported
# locally; required scopes in docs/deployment/README.md. Never hardcode
# credentials here.
provider "cloudflare" {}
