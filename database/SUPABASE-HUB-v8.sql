-- TDB 8.0 Beta • executar UMA VEZ no SQL Editor do Supabase.
-- Migração aditiva: não apaga tabelas anteriores nem usuários.
-- IMPORTANTE: o service role key permanece SOMENTE nas variáveis do servidor Vercel.
create table if not exists public.tdb_hubs (
  code text primary key,
  owner_id text not null,
  name text not null,
  visibility text not null default 'public',
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tdb_hubs_visibility_check check (visibility in ('public','private'))
);
create index if not exists tdb_hubs_updated_idx on public.tdb_hubs(updated_at desc);
create table if not exists public.tdb_hub_messages (
  id bigint generated always as identity primary key,
  code text not null references public.tdb_hubs(code) on delete cascade,
  user_id text not null,
  username text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists tdb_hub_messages_room_idx on public.tdb_hub_messages(code,created_at desc);
create table if not exists public.tdb_hub_signals (
  id bigint generated always as identity primary key,
  code text not null references public.tdb_hubs(code) on delete cascade,
  sender text not null,
  receiver text not null,
  kind text not null,
  session_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tdb_hub_signals_receiver_idx on public.tdb_hub_signals(code,receiver,id);
-- Acesso às tabelas novas apenas pelo backend autenticado; sem SELECT público.
alter table public.tdb_hubs enable row level security;
alter table public.tdb_hub_messages enable row level security;
alter table public.tdb_hub_signals enable row level security;
-- Sem policies para anon/authenticated. Backend usa service_role e valida pertencimento.

revoke all on public.tdb_hubs,public.tdb_hub_messages,public.tdb_hub_signals from anon, authenticated;
grant all on public.tdb_hubs,public.tdb_hub_messages,public.tdb_hub_signals to service_role;
grant usage,select on all sequences in schema public to service_role;
