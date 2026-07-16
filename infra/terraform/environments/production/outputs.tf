output "app_name" {
  value       = module.stack.app_name
  description = "Container App name for `az containerapp update`."
}

output "default_fqdn" {
  value       = module.stack.default_fqdn
  description = "Default ingress FQDN (smoke-test target). Retrieve with: terraform output -raw default_fqdn"
  sensitive   = true # the Cloudflare-hidden origin — keep out of public apply logs
}
