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
