variable "tfstate_storage_account_name" {
  type        = string
  description = "State storage account name (to read the shared stack's remote state)."
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing (bootstrap-created) resource group for staging."
  default     = "rg-czw-staging"
}

variable "min_replicas" {
  type        = number
  description = "Minimum replicas. Staging scales to zero."
  default     = 0
}

variable "max_replicas" {
  type        = number
  description = "Maximum replicas."
  default     = 1
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
  description = "Monthly budget (USD) for staging. Alert-only."
  default     = 5
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
    environment = "staging"
    managed     = "terraform"
  }
}

variable "custom_domains" {
  type        = list(string)
  description = "Public hostnames bound to the staging app (behind the Cloudflare proxy)."
  default     = ["staging.czarnickwedding.com"]
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
