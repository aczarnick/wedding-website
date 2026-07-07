variable "tfstate_storage_account_name" {
  type        = string
  description = "State storage account name (to read the shared stack's remote state)."
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing (bootstrap-created) resource group for production."
  default     = "rg-czw-production"
}

variable "location" {
  type        = string
  description = "Region for the production Container App Environment. Differs from staging (Central US) because free-trial subscriptions allow only 1 environment per region."
  default     = "eastus"
}

variable "min_replicas" {
  type        = number
  description = "Minimum replicas. 0 = cheapest (guests may hit a cold start); set default to 1 here to keep prod warm (~$3-14/mo)."
  default     = 0
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
