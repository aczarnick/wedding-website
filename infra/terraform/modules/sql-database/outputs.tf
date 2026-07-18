output "server_fqdn" {
  value       = azurerm_mssql_server.this.fully_qualified_domain_name
  description = "SQL server FQDN, used to build the app connection string."
}

output "database_name" {
  value       = azurerm_mssql_database.rsvp.name
  description = "Database name (rsvp)."
}
