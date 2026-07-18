variable "environment" {
  type        = string
  description = "Environment name (staging|production). Used in resource names."
}

variable "location" {
  type        = string
  description = "Azure region for the SQL server and database."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that hosts the SQL server."
}

variable "aad_admin_login" {
  type        = string
  description = "Display name of the Entra principal set as the server's AAD admin (e.g. the czw-sql-admins group)."
}

variable "aad_admin_object_id" {
  type        = string
  description = "Object ID of the Entra admin principal. Set by object ID so an RG-Contributor CI identity needs no Graph permission."
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant ID for the AAD administrator."
}

variable "auto_pause_delay_in_minutes" {
  type        = number
  description = "Serverless auto-pause idle delay. 60 = pause after 1h idle; -1 = never pause (warm)."
}

variable "tags" {
  type        = map(string)
  description = "Resource tags."
  default     = {}
}
