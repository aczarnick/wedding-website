output "app_name" {
  value       = module.stack.app_name
  description = "Container App name for `az containerapp update`."
}

output "default_fqdn" {
  value       = module.stack.default_fqdn
  description = "Default ingress FQDN (smoke-test target). Retrieve with: terraform output -raw default_fqdn"
  sensitive   = true # the Cloudflare-hidden origin — keep out of public apply logs
}

output "custom_domain_verification_id" {
  value       = module.stack.custom_domain_verification_id
  description = "Value for the asuid.<host> TXT record."
}

output "environment_static_ip" {
  value       = module.stack.environment_static_ip
  description = "Environment static IP (apex A-record target). Retrieve with: terraform output -raw environment_static_ip"
  sensitive   = true # origin IP — keep out of public apply logs
}
