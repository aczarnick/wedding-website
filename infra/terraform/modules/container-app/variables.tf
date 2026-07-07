variable "name" {
  type        = string
  description = "Name of the Container App."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that hosts the Container App."
}

variable "container_app_environment_id" {
  type        = string
  description = "Resource ID of the Container App Environment."
}

variable "workload_profile_name" {
  type        = string
  description = "Workload profile to run on. 'Consumption' for scale-to-zero."
  default     = "Consumption"
}

variable "acr_login_server" {
  type        = string
  description = "ACR login server (e.g. czwacr.azurecr.io) images are pulled from."
}

variable "acr_pull_identity_id" {
  type        = string
  description = "Resource ID of the user-assigned identity holding AcrPull."
}

variable "image" {
  type        = string
  description = "Container image. Defaults to a public placeholder; the real image is set by the CD pipeline and ignored by Terraform thereafter."
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "target_port" {
  type        = number
  description = "Container port the app listens on."
  default     = 3000
}

variable "cpu" {
  type        = number
  description = "vCPU per replica."
  default     = 0.25
}

variable "memory" {
  type        = string
  description = "Memory per replica (must pair with cpu per ACA allowed combos)."
  default     = "0.5Gi"
}

variable "min_replicas" {
  type        = number
  description = "Minimum replicas. 0 = scale to zero (cheapest, cold starts)."
  default     = 0
}

variable "max_replicas" {
  type        = number
  description = "Maximum replicas. Caps autoscale spend."
  default     = 1
}

variable "allowed_ip_ranges" {
  type = list(object({
    name = string
    cidr = string
  }))
  description = "Source CIDRs allowed to reach ingress (Cloudflare ranges once the proxy is enabled). Empty = open."
  default     = []
}

variable "tags" {
  type        = map(string)
  description = "Resource tags."
  default     = {}
}
