-- TDB v7.1.7 — foto de perfil
-- Execute uma vez no SQL Editor do Supabase do TDB.

alter table public.tdb_users
  add column if not exists avatar_image text;
