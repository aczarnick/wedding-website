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

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID."
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth client ID for Auth.js. Empty until issue #63."
  default     = ""
}

variable "google_client_secret" {
  type        = string
  description = "Google OAuth client secret for Auth.js. Empty until issue #63."
  default     = ""
  sensitive   = true
}
