output "app_name" {
  value       = module.app.name
  description = "Container App name for `az containerapp update`."
}

output "default_fqdn" {
  value       = module.app.default_fqdn
  description = "Default ingress FQDN (used for smoke tests, bypassing Cloudflare)."
}

output "sql_server_fqdn" {
  value       = module.database.server_fqdn
  description = "SQL server FQDN for the environment."
}
