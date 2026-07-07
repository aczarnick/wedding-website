variable "location" {
  type        = string
  description = "Azure region for shared resources."
  default     = "centralus"
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing (bootstrap-created) resource group for shared resources."
  default     = "rg-czw-shared"
}

variable "acr_name" {
  type        = string
  description = "Globally-unique ACR name (alphanumeric, 5-50 chars), e.g. czwacr1234."
}

variable "log_analytics_daily_quota_gb" {
  type        = number
  description = "Hard daily ingestion cap on the shared workspace (the only uncapped $/GB meter in this stack)."
  default     = 1
}

variable "alert_emails" {
  type        = list(string)
  description = "Emails that receive budget alerts."
  sensitive   = true # keep PII out of public terraform plan/apply logs
}

variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget (USD) for the shared resource group. Alert-only."
  default     = 15
}

variable "subscription_budget_amount" {
  type        = number
  description = "Subscription-wide monthly budget (USD). Alert-only safety net (aggressive thresholds)."
  default     = 50
}

variable "budget_start_date" {
  type        = string
  description = "Budget start, first day of a month in RFC3339 UTC, e.g. 2026-08-01T00:00:00Z."
}

variable "tags" {
  type        = map(string)
  description = "Common tags."
  default = {
    project = "czarnickwedding"
    managed = "terraform"
  }
}
