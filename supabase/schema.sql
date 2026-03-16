-- ============================================================
-- HFF March Madness Draft — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Drafters (the 8 league members)
create table if not exists drafters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  draft_position integer unique not null,
  created_at timestamptz default now()
);

-- Player pool (any NCAA tournament player)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text not null,
  seed integer,
  season_ppg numeric(4,1),
  is_eliminated boolean not null default false,
  drafter_id uuid references drafters(id) on delete set null,
  created_at timestamptz default now()
);

-- Points per player per tournament round
create table if not exists player_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  round_name text not null,  -- 'Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship'
  points integer not null default 0,
  updated_at timestamptz default now(),
  unique(player_id, round_name)
);

-- Draft picks log
create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  pick_number integer unique not null,
  drafter_id uuid not null references drafters(id),
  player_id uuid not null references players(id),
  created_at timestamptz default now()
);

-- Key-value app settings
create table if not exists settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

insert into settings (key, value) values
  ('draft_current_pick', '1'),
  ('draft_status', 'not_started'),
  ('last_espn_sync', null)
on conflict (key) do nothing;

-- Disable RLS for all tables (this is a private friends app)
alter table drafters disable row level security;
alter table players disable row level security;
alter table player_scores disable row level security;
alter table draft_picks disable row level security;
alter table settings disable row level security;
