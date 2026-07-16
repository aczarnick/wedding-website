# Hostname-ownership TXT records. ACA validates via asuid.<host>, which keeps
# working while the host record stays proxied (orange cloud) — that is what
# makes a zero-downtime cutover possible.
resource "cloudflare_dns_record" "verification" {
  for_each = var.custom_domains

  zone_id = var.cloudflare_zone_id
  name    = "asuid.${each.value}"
  type    = "TXT"
  # Quoted: the Cloudflare API canonicalizes TXT content to its quoted form;
  # sending it unquoted risks a perpetual plan diff on some v5 releases.
  content = "\"${module.app.custom_domain_verification_id}\""
  ttl     = 1
}

# Cloudflare Origin CA cert for the environment — deliberately not the ACA
# managed cert (see docs/deployment/README.md). trimspace + explicit newlines:
# a missing newline between the two PEM blocks would produce an unparseable
# bundle.
resource "azurerm_container_app_environment_certificate" "origin" {
  count = length(var.custom_domains) > 0 ? 1 : 0

  # The cert blob is ForceNew and stays referenced by live hostname bindings:
  # rotation must create the replacement first (hence the fingerprint-suffixed
  # name — two certs coexist briefly) or Azure rejects deleting an in-use cert.
  name                         = "cf-origin-${var.environment}-${substr(sha256(var.origin_certificate_pem), 0, 8)}"
  container_app_environment_id = azurerm_container_app_environment.this.id
  certificate_blob_base64      = base64encode("${trimspace(var.origin_certificate_pem)}\n${trimspace(var.origin_private_key_pem)}\n")
  certificate_password         = ""

  lifecycle {
    create_before_destroy = true
  }
}

resource "azurerm_container_app_custom_domain" "this" {
  for_each = var.custom_domains

  name                                     = each.value
  container_app_id                         = module.app.id
  container_app_environment_certificate_id = azurerm_container_app_environment_certificate.origin[0].id
  certificate_binding_type                 = "SniEnabled"

  # Ownership validation reads the asuid TXT record.
  depends_on = [cloudflare_dns_record.verification]
}

# Created only after the hostname is bound so guests are never routed to an
# unbound host (ACA would 404).
resource "cloudflare_dns_record" "host" {
  for_each = var.custom_domains

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = each.value == var.cloudflare_zone_name ? "A" : "CNAME"
  # sensitive(): the record targets are the Cloudflare-hidden origin (static IP
  # / default FQDN) — keep them out of public plan logs, matching the env
  # roots' sensitive outputs.
  content = sensitive(each.value == var.cloudflare_zone_name ? azurerm_container_app_environment.this.static_ip_address : module.app.default_fqdn)
  proxied = true
  ttl     = 1

  depends_on = [azurerm_container_app_custom_domain.this]
}
