output "acr_login_server" {
  value       = azurerm_container_registry.shared.login_server
  description = "ACR login server (e.g. czwacr.azurecr.io)."
}

output "acr_name" {
  value       = azurerm_container_registry.shared.name
  description = "ACR name (used by CD `az acr` commands and the purge workflow)."
}

output "acr_id" {
  value       = azurerm_container_registry.shared.id
  description = "ACR resource ID."
}

output "acr_pull_identity_id" {
  value       = azurerm_user_assigned_identity.acr_pull.id
  description = "Resource ID of the runtime AcrPull identity, consumed by the env stacks."
}

output "log_analytics_workspace_id" {
  value       = azurerm_log_analytics_workspace.shared.id
  description = "Shared Log Analytics workspace ID, consumed by the env stacks."
}

output "cloudflare_zone_id" {
  value       = data.cloudflare_zone.site.id
  description = "Cloudflare zone ID, consumed by the env stacks for DNS records."
}

output "cloudflare_zone_name" {
  value       = var.cloudflare_zone_name
  description = "Zone apex name — env stacks use it to pick A vs CNAME per hostname."
}

output "origin_certificate_pem" {
  value       = cloudflare_origin_ca_certificate.origin.certificate
  description = "Origin CA certificate (PEM), uploaded to each Container App Environment."
}

output "origin_private_key_pem" {
  value       = tls_private_key.origin.private_key_pem
  description = "Origin CA private key (PEM). Sensitive — lives only in state."
  sensitive   = true
}
