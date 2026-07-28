variable "tfstate_storage_account_name" {
  type        = string
  description = "State storage account name (to read the shared stack's remote state)."
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing (bootstrap-created) resource group for production."
  default     = "rg-czw-production"
}

variable "min_replicas" {
  type        = number
  description = "Minimum replicas. 1 keeps prod warm so guests never hit a cold start (~$3-14/mo); 0 = cheapest."
  default     = 1
}

variable "max_replicas" {
  type        = number
  description = "Maximum replicas (caps autoscale spend)."
  default     = 2
}

variable "allowed_ip_ranges" {
  type = list(object({
    name = string
    cidr = string
  }))
  description = "Ingress allow-list (Cloudflare ranges once proxied). Empty = open."
  default     = []
}

variable "alert_emails" {
  type        = list(string)
  description = "Budget alert recipients."
  sensitive   = true
}

variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget (USD) for production. Alert-only."
  default     = 10
}

variable "budget_start_date" {
  type        = string
  description = "Budget start, first day of a month in RFC3339 UTC."
}

variable "tags" {
  type        = map(string)
  description = "Resource tags."
  default = {
    project     = "czarnickwedding"
    environment = "production"
    managed     = "terraform"
  }
}

variable "custom_domains" {
  type        = list(string)
  description = "Public hostnames bound to the production app (behind the Cloudflare proxy)."
  default     = ["czarnickwedding.com", "www.czarnickwedding.com"]
}

variable "sql_admin_group_name" {
  type        = string
  description = "Display name of the Entra group set as the SQL server AAD admin."
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

variable "admin_email" {
  type        = string
  description = "Admin address for the console; doubles as the authorization allowlist."
  default     = ""
  sensitive   = true
}

variable "admin_password_hash" {
  type        = string
  description = "scrypt hash of the admin password, from `npm run auth:hash`."
  default     = ""
  sensitive   = true
}
