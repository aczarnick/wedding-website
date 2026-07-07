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
