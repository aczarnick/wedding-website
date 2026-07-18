// Idempotently grant the app's managed identity access to the RSVP database.
//
// Azure SQL has no Terraform resource for a contained database user, so this runs
// once per deploy from CI (as the AAD admin) to ensure the app identity exists as
// a DB user with least-privilege data access. Migrations run separately as the
// admin, so the app identity never needs DDL rights.
//
// Auth is passwordless: `mssql`'s azure-active-directory-default mode resolves the
// runner's `az login` session (AzureCliCredential) to a database.windows.net token.
//
// Usage: node scripts/ensure-db-user.mjs <app-identity-name>
//   env: SQL_SERVER (FQDN), SQL_DATABASE

import sql from 'mssql';

const identityName = process.argv[2];
const server = process.env.SQL_SERVER;
const database = process.env.SQL_DATABASE;

if (!identityName || !server || !database) {
  console.error('Usage: node scripts/ensure-db-user.mjs <app-identity-name> (env: SQL_SERVER, SQL_DATABASE)');
  process.exit(1);
}

// The name is interpolated into DDL, so constrain it to the managed-identity
// naming charset before it ever reaches the server.
if (!/^[A-Za-z0-9-]+$/.test(identityName)) {
  console.error(`Refusing unsafe identity name: ${identityName}`);
  process.exit(1);
}

const grantSql = `
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${identityName}')
  CREATE USER [${identityName}] FROM EXTERNAL PROVIDER;

IF IS_ROLEMEMBER('db_datareader', '${identityName}') = 0
  ALTER ROLE db_datareader ADD MEMBER [${identityName}];

IF IS_ROLEMEMBER('db_datawriter', '${identityName}') = 0
  ALTER ROLE db_datawriter ADD MEMBER [${identityName}];
`;

let pool;
try {
  pool = await sql.connect({
    server,
    database,
    authentication: { type: 'azure-active-directory-default' },
    options: { encrypt: true },
  });
  await pool.request().batch(grantSql);
  console.log(`Ensured DB user [${identityName}] with db_datareader + db_datawriter on ${database}.`);
} catch (error) {
  console.error(`Failed to ensure DB user [${identityName}]: ${error.message}`);
  process.exit(1);
} finally {
  await pool?.close();
}
