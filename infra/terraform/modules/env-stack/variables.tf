variable "environment" {
  type        = string
  description = "Environment name (staging|production). Used in resource names."
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing (bootstrap-created) resource group for this environment."
}

variable "log_analytics_workspace_id" {
  type        = string
  description = "Shared Log Analytics workspace ID (from the shared stack)."
}

variable "acr_login_server" {
  type        = string
  description = "ACR login server (from the shared stack)."
}

variable "acr_pull_identity_id" {
  type        = string
  description = "Runtime AcrPull identity ID (from the shared stack)."
}

variable "min_replicas" {
  type        = number
  description = "Minimum replicas (0 = scale to zero)."
}

variable "max_replicas" {
  type        = number
  description = "Maximum replicas (caps autoscale spend)."
}

variable "allowed_ip_ranges" {
  type = list(object({
    name = string
    cidr = string
  }))
  description = "Ingress source allow-list (Cloudflare ranges once proxied). Empty = open."
  default     = []
}

variable "alert_emails" {
  type        = list(string)
  description = "Budget alert recipients."
  sensitive   = true
}

variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget (USD) for this environment's resource group. Alert-only."
}

variable "budget_start_date" {
  type        = string
  description = "Budget start, first day of a month in RFC3339 UTC."
}

variable "tags" {
  type        = map(string)
  description = "Resource tags."
  default     = {}
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the DNS records."
}

variable "cloudflare_zone_name" {
  type        = string
  description = "Zone apex name. Hostnames equal to it get an A record to the environment static IP; others get a CNAME to the app FQDN."
}

variable "custom_domains" {
  type        = set(string)
  description = "Public hostnames to bind to the app (behind the Cloudflare proxy). Empty disables all custom-domain management."
  default     = []
}

variable "origin_certificate_pem" {
  type        = string
  description = "Cloudflare Origin CA certificate (PEM), from the shared stack."
}

variable "origin_private_key_pem" {
  type        = string
  description = "Origin CA private key (PEM), from the shared stack."
  sensitive   = true
}

variable "sql_admin_group_name" {
  type        = string
  description = "Display name of the Entra group set as the SQL server AAD admin (contains human admins + the CI deploy SP)."
}

variable "sql_admin_group_object_id" {
  type        = string
  description = "Object ID of the SQL admin Entra group."
}

variable "sql_admin_login" {
  type        = string
  description = "SQL server admin login. ForceNew — null preserves the Azure-generated login on existing servers; set only for a new environment."
  default     = null
}

variable "sql_admin_password" {
  type        = string
  sensitive   = true
  description = "Password for the SQL admin login, from the SQL_ADMIN_PASSWORD GitHub secret. Empty leaves it unmanaged."
  default     = ""
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID."
}

variable "db_sku_name" {
  type        = string
  description = "Database SKU. 'Basic' for production (flat cost, no cold start); 'GP_S_Gen5_1' for staging, which idles enough that auto-pause is cheaper."
}

variable "db_auto_pause_delay_in_minutes" {
  type        = number
  description = "Serverless auto-pause delay, e.g. 60 for staging. Null for DTU SKUs such as Basic."
  default     = null
}

variable "admin_email" {
  type        = string
  description = "Admin address for the console. Doubles as the authorization allowlist (comma-separated). Empty denies everyone."
  default     = ""
  sensitive   = true
}

variable "admin_password_hash" {
  type        = string
  description = "scrypt hash of the admin password, from `npm run auth:hash`. Never the password itself."
  default     = ""
  sensitive   = true
}
