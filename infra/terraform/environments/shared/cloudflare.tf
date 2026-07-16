data "cloudflare_zone" "site" {
  filter = {
    name = var.cloudflare_zone_name
  }
}

# Cloudflare-to-origin TLS mode. "strict" requires the origin to present a
# cert Cloudflare trusts — the Origin CA certificate below. Zone-wide setting:
# tunnel-backed records bypass this path, but any other proxied record must
# serve valid TLS.
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = data.cloudflare_zone.site.id
  setting_id = "ssl"
  value      = "strict"
}

# One Origin CA certificate (apex + wildcard) shared by both environments.
# Trusted only by the Cloudflare edge, never by browsers — deliberately not
# the ACA managed cert (see docs/deployment/README.md). The private key lives
# in Terraform state; the state account is AAD-locked.
resource "tls_private_key" "origin" {
  algorithm = "RSA"
  rsa_bits  = 2048

  lifecycle {
    create_before_destroy = true
  }
}

resource "tls_cert_request" "origin" {
  private_key_pem = tls_private_key.origin.private_key_pem
  dns_names       = [var.cloudflare_zone_name, "*.${var.cloudflare_zone_name}"]

  subject {
    common_name = var.cloudflare_zone_name
  }

  lifecycle {
    create_before_destroy = true
  }
}

# create_before_destroy across the chain: the provider's delete REVOKES the
# certificate, and the environments keep serving their uploaded copies until
# their own (approval-gated) applies run — issue the replacement first.
resource "cloudflare_origin_ca_certificate" "origin" {
  csr = tls_cert_request.origin.cert_request_pem
  # Wildcard first: the API returns hostnames sorted, and a mismatch on this
  # ForceNew list would replace (revoke!) the cert on every apply.
  hostnames          = ["*.${var.cloudflare_zone_name}", var.cloudflare_zone_name]
  request_type       = "origin-rsa"
  requested_validity = 5475 # 15 years — rotation is a manual re-apply, documented in the runbook

  lifecycle {
    create_before_destroy = true
  }
}
