output "app_name" {
  value       = module.app.name
  description = "Container App name for `az containerapp update`."
}

output "default_fqdn" {
  value       = module.app.default_fqdn
  description = "Default ingress FQDN (used for smoke tests, bypassing Cloudflare)."
}

output "custom_domain_verification_id" {
  value       = module.app.custom_domain_verification_id
  description = "Value for the `asuid.<host>` TXT record."
}

output "environment_static_ip" {
  value       = azurerm_container_app_environment.this.static_ip_address
  description = "Environment static IP — the target for the apex A record in Cloudflare."
}
