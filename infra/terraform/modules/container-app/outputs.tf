output "name" {
  value       = azurerm_container_app.this.name
  description = "Container App name (used by the CD pipeline for `az containerapp update`)."
}

output "default_fqdn" {
  value       = azurerm_container_app.this.ingress[0].fqdn
  description = "Default ingress FQDN. Smoke tests hit this directly to bypass Cloudflare caching."
}

output "custom_domain_verification_id" {
  value       = azurerm_container_app.this.custom_domain_verification_id
  description = "Value for the `asuid.<host>` TXT record when binding a custom domain."
}

output "latest_revision_name" {
  value       = azurerm_container_app.this.latest_revision_name
  description = "Latest revision name."
}
