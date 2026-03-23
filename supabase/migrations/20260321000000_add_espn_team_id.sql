-- Add ESPN team ID: player_id -> espn_team_id -> loserTeamIds for elimination (no name lookup)
alter table players add column if not exists espn_team_id text;
