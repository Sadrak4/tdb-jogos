-- ============================================================
-- TDB JOGOS v5.0 - Supabase Schema
-- Execute este arquivo UMA VEZ no Supabase:
-- Dashboard > SQL Editor > New query > cole tudo > Run
-- ============================================================

begin;

create table if not exists public.tdb_users (
  id text primary key,
  username text not null,
  username_normalized text not null unique,
  avatar text,
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tdb_sessions (
  token text primary key,
  user_id text not null references public.tdb_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists tdb_sessions_user_idx on public.tdb_sessions(user_id);
create index if not exists tdb_sessions_expires_idx on public.tdb_sessions(expires_at);

create table if not exists public.tdb_friends (
  user_id text not null references public.tdb_users(id) on delete cascade,
  friend_id text not null references public.tdb_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint tdb_friends_not_self check (user_id <> friend_id)
);
create index if not exists tdb_friends_friend_idx on public.tdb_friends(friend_id);

create table if not exists public.tdb_rooms (
  code text primary key,
  game text,
  owner_id text,
  status text not null default 'open',
  privacy text not null default 'public',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists tdb_rooms_status_idx on public.tdb_rooms(status);
create index if not exists tdb_rooms_game_idx on public.tdb_rooms(game);
create index if not exists tdb_rooms_owner_idx on public.tdb_rooms(owner_id);

create table if not exists public.tdb_matches (
  match_id text primary key,
  room_code text,
  game text,
  status text not null default 'playing',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists tdb_matches_room_idx on public.tdb_matches(room_code);
create index if not exists tdb_matches_status_idx on public.tdb_matches(status);

create table if not exists public.tdb_presence (
  user_id text primary key,
  status text not null default 'online',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists tdb_presence_updated_idx on public.tdb_presence(updated_at);

create table if not exists public.tdb_shared (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists tdb_shared_updated_idx on public.tdb_shared(updated_at);

-- Esta tabela NÃO guarda cartas nem senhas. Ela serve somente para avisar
-- os navegadores de que algo mudou e eles devem buscar o estado pela API.
create table if not exists public.tdb_events (
  id bigint generated always as identity primary key,
  topic text not null,
  room_code text,
  kind text not null default 'update',
  created_at timestamptz not null default now()
);
create index if not exists tdb_events_created_idx on public.tdb_events(created_at);
create index if not exists tdb_events_room_idx on public.tdb_events(room_code);

-- Segurança:
-- todas as tabelas ficam com RLS ativo.
alter table public.tdb_users enable row level security;
alter table public.tdb_sessions enable row level security;
alter table public.tdb_friends enable row level security;
alter table public.tdb_rooms enable row level security;
alter table public.tdb_matches enable row level security;
alter table public.tdb_presence enable row level security;
alter table public.tdb_shared enable row level security;
alter table public.tdb_events enable row level security;

-- O navegador só precisa LER eventos de invalidação.
-- Todos os dados reais são lidos/escritos pela API da Vercel usando a secret key.
drop policy if exists "tdb_events_public_read" on public.tdb_events;
create policy "tdb_events_public_read"
on public.tdb_events
for select
to anon, authenticated
using (true);


-- Permissões explícitas.
-- A secret key da API usa service_role e precisa acesso total.
grant all on table
  public.tdb_users,
  public.tdb_sessions,
  public.tdb_friends,
  public.tdb_rooms,
  public.tdb_matches,
  public.tdb_presence,
  public.tdb_shared,
  public.tdb_events
to service_role;

grant usage, select on all sequences in schema public to service_role;

-- O browser só recebe SELECT da tabela segura de eventos.
revoke all on table
  public.tdb_users,
  public.tdb_sessions,
  public.tdb_friends,
  public.tdb_rooms,
  public.tdb_matches,
  public.tdb_presence,
  public.tdb_shared
from anon, authenticated;

grant select on public.tdb_events to anon, authenticated;

-- Habilita somente tdb_events no Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='tdb_events'
  ) then
    alter publication supabase_realtime add table public.tdb_events;
  end if;
end $$;

commit;

-- ============================================================
-- MIGRAÇÃO v5.2 — social, competitivo, segurança e observabilidade
-- Pode executar mesmo se o schema v5.0/v5.1 já existir.
-- ============================================================
begin;

create table if not exists public.tdb_friend_requests (
  sender_id text not null references public.tdb_users(id) on delete cascade,
  receiver_id text not null references public.tdb_users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (sender_id, receiver_id),
  constraint tdb_friend_request_not_self check (sender_id <> receiver_id)
);
create index if not exists tdb_friend_requests_receiver_idx on public.tdb_friend_requests(receiver_id,status);

create table if not exists public.tdb_room_invites (
  id bigint generated always as identity primary key,
  room_code text not null,
  sender_id text not null references public.tdb_users(id) on delete cascade,
  receiver_id text not null references public.tdb_users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index if not exists tdb_room_invites_receiver_idx on public.tdb_room_invites(receiver_id,status,expires_at);
create index if not exists tdb_room_invites_room_idx on public.tdb_room_invites(room_code);

create table if not exists public.tdb_game_results (
  match_id text primary key,
  room_code text,
  game text not null,
  mode text not null default 'default',
  result_type text not null,
  participant_ids text[] not null default '{}',
  winner_ids text[] not null default '{}',
  loser_ids text[] not null default '{}',
  participants jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  counted boolean not null default true,
  started_at timestamptz,
  finished_at timestamptz not null default now()
);
create index if not exists tdb_game_results_game_idx on public.tdb_game_results(game,mode,finished_at desc);
create index if not exists tdb_game_results_participants_idx on public.tdb_game_results using gin(participant_ids);
create index if not exists tdb_game_results_winners_idx on public.tdb_game_results using gin(winner_ids);

create table if not exists public.tdb_error_logs (
  id bigint generated always as identity primary key,
  level text not null default 'error',
  source text not null default 'server',
  route text,
  user_id text,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tdb_error_logs_created_idx on public.tdb_error_logs(created_at desc);

create table if not exists public.tdb_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  count integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists tdb_rate_limits_updated_idx on public.tdb_rate_limits(updated_at);

alter table public.tdb_friend_requests enable row level security;
alter table public.tdb_room_invites enable row level security;
alter table public.tdb_game_results enable row level security;
alter table public.tdb_error_logs enable row level security;
alter table public.tdb_rate_limits enable row level security;

grant all on table
  public.tdb_friend_requests,
  public.tdb_room_invites,
  public.tdb_game_results,
  public.tdb_error_logs,
  public.tdb_rate_limits
to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke all on table
  public.tdb_friend_requests,
  public.tdb_room_invites,
  public.tdb_game_results,
  public.tdb_error_logs,
  public.tdb_rate_limits
from anon, authenticated;

commit;
