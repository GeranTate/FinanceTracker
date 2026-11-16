-- Read-only inspection of the deployed access model.
select tablename as table_name, rowsecurity as rls_enabled,
  has_table_privilege('anon','public.' || tablename,'SELECT') as public_read,
  has_table_privilege('authenticated','public.' || tablename,'SELECT') as signed_in_read,
  has_table_privilege('authenticated','public.' || tablename,'INSERT') as direct_writes
from pg_tables where schemaname = 'public' order by tablename;

select schemaname,tablename,policyname,roles,qual
from pg_policies where schemaname = 'public' order by tablename;

select n.nspname as schema_name,p.proname as function_name,p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as public_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('finance_command','finance_snapshot'))
   or (n.nspname = 'finance_private' and p.proname = 'command');
