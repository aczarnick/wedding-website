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
