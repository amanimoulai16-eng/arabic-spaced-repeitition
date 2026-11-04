/*
# Enable pg_cron and pg_net

1. Changes
- Enables the `pg_net` extension (outbound HTTP calls from SQL), installed in the `extensions` schema.
- Enables the `pg_cron` extension (scheduled jobs), installed in the `pg_catalog` schema as Supabase requires.

2. Security
- No tables, policies, or secrets are created or changed by this migration.

3. Notes
- Scheduling the daily reminder job happens separately and reads its secret from Vault at run time.
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
