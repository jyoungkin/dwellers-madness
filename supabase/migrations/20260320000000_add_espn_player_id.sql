-- Add ESPN player ID for reliable matching (avoids Christian Anderson -> Terry Anderson type errors)
alter table players add column if not exists espn_player_id text;
