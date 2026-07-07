resource "azurerm_container_app" "this" {
  name                         = var.name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = var.container_app_environment_id
  revision_mode                = "Single"
  workload_profile_name        = var.workload_profile_name

  identity {
    type         = "UserAssigned"
    identity_ids = [var.acr_pull_identity_id]
  }

  registry {
    server   = var.acr_login_server
    identity = var.acr_pull_identity_id
  }

  ingress {
    external_enabled = true
    target_port      = var.target_port
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }

    # Origin lock: when populated (Cloudflare published ranges), only those CIDRs
    # can reach the app; all other source IPs are denied. Empty = open (initial
    # DNS-only bring-up phase before the Cloudflare proxy is enabled).
    dynamic "ip_security_restriction" {
      for_each = var.allowed_ip_ranges
      content {
        name             = ip_security_restriction.value.name
        ip_address_range = ip_security_restriction.value.cidr
        action           = "Allow"
      }
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "web"
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      startup_probe {
        transport               = "HTTP"
        path                    = "/"
        port                    = var.target_port
        interval_seconds        = 5
        failure_count_threshold = 30
      }

      liveness_probe {
        transport               = "HTTP"
        path                    = "/"
        port                    = var.target_port
        initial_delay           = 10
        interval_seconds        = 30
        failure_count_threshold = 3
      }
    }
  }

  # The image is deployed out-of-band by the CD pipeline (`az containerapp
  # update`). Terraform owns everything except the running image tag, so it must
  # not fight the pipeline on every plan. The default image is a public
  # placeholder so the very first `apply` provisions a healthy revision before
  # any application image exists in the registry.
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = var.tags
}
