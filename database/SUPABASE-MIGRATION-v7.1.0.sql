-- TDB v7.1.0 - Perfil 2.0
-- Execute uma vez no Supabase SQL Editor antes/depois do deploy.
begin;
alter table public.tdb_users add column if not exists banner text;
commit;
