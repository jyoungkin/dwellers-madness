-- ============================================================
-- Player Draft League — Supabase Schema
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New Query)
-- ============================================================
--
-- League settings:
--   • 3 drafters, 8 players each = 24 total picks (snake draft)
--   • Draft rules enforced in the UI:
--       - Max 3 players from any single team
--       - At least 4 players seeded 5 or higher
--       - At least 2 of those must be underdogs (seed 9+)
-- ============================================================

-- Drafters (the 3 league members)
create table if not exists drafters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  draft_position integer unique not null check (draft_position between 1 and 3),
  created_at timestamptz default now()
);

-- Player pool (all draftable players, loaded from CSV / Python script)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text not null,
  seed integer check (seed between 1 and 16),
  season_ppg numeric(4,1),
  is_eliminated boolean not null default false,
  drafter_id uuid references drafters(id) on delete set null,
  espn_player_id text,
  created_at timestamptz default now()
);

-- Points per player per tournament round
create table if not exists player_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  round_name text not null,  -- 'Play-In', 'Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship'
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
  ('last_espn_sync', null),
  ('tournament_over', 'false')
on conflict (key) do nothing;

-- Disable RLS (private friends app — security by secret slug)
alter table drafters disable row level security;
alter table players disable row level security;
alter table player_scores disable row level security;
alter table draft_picks disable row level security;
alter table settings disable row level security;
