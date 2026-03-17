"""
seed_players.py
~~~~~~~~~~~~~~~
Reads the output of fetch_real_bracket.py and fetch_players.py and
seeds the Supabase `players` table for your draft.

Workflow:
  1. cd "C:\\Users\\JohnYoungkin\\Downloads\\NCAA tourney predictor"
  2. python fetch_real_bracket.py        # produces data/bracket_2026.json
  3. python fetch_players.py             # produces data/player_stats.csv
  4. cd back to the playerdraft folder
  5. pip install supabase python-dotenv pandas
  6. python scripts/seed_players.py

Prerequisites:
  - .env file in the playerdraft root containing:
      VITE_SUPABASE_URL=https://your-project.supabase.co
      VITE_SUPABASE_ANON_KEY=your-anon-key-here
"""

import json
import os
import sys
from pathlib import Path

# ── Windows SSL fix ────────────────────────────────────────────────────────────
# httpx (used by supabase-py) can't verify SSL on some Windows installs.
# Safe to bypass for a local seeding utility.
import httpx as _httpx
_real_init = _httpx.Client.__init__
def _no_verify(self, *args, **kwargs):
    kwargs['verify'] = False
    _real_init(self, *args, **kwargs)
_httpx.Client.__init__ = _no_verify
# ──────────────────────────────────────────────────────────────────────────────

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# ── Paths ──────────────────────────────────────────────────────────────────────
# Adjust these if your folder layout is different.
PREDICTOR_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent  # Downloads/
    / "NCAA tourney predictor"
)
BRACKET_FILE = PREDICTOR_DIR / "data" / "bracket_2026.json"
PLAYERS_FILE = PREDICTOR_DIR / "data" / "player_stats.csv"

# Min PPG — filters out bench players unlikely to contribute in the tournament.
# Lower this number if you want a deeper player pool.
MIN_PPG = 3.0

# ── Supabase credentials ───────────────────────────────────────────────────────
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")


def validate_env():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print(
            "ERROR: Missing Supabase credentials.\n"
            "  Create a .env file in the playerdraft root with:\n"
            "    VITE_SUPABASE_URL=https://your-project.supabase.co\n"
            "    VITE_SUPABASE_ANON_KEY=your-anon-key-here"
        )
        sys.exit(1)


def load_seed_map(bracket_path: Path) -> dict[str, int]:
    """Build {team_name: seed} from bracket_2026.json.

    Includes First Four play-in teams (from bracket['first_four']) so they
    appear in the player pool with their seed (16 or 11).
    """
    with open(bracket_path) as f:
        bracket = json.load(f)

    seed_map: dict[str, int] = {}
    for region_teams in bracket["regions"].values():
        for entry in region_teams:
            team = entry["team"]
            seed = entry["seed"]
            if not str(team).startswith("TBD"):
                seed_map[team] = int(seed)

    # Add First Four teams (all 8 play-in teams get their seed)
    for game in bracket.get("first_four", []):
        s = int(game.get("seed", 0))
        for t in game.get("teams", []):
            name = t.get("name", "")
            if name and s:
                seed_map[name] = s

    return seed_map


def load_players(players_path: Path, seed_map: dict[str, int]) -> list[dict]:
    """Load player_stats.csv, attach seeds, filter, and return upload-ready rows."""
    df = pd.read_csv(players_path)
    df.columns = [c.strip().lower() for c in df.columns]

    # Normalise column name variants from fetch_players.py
    renames = {
        "player": "name",
        "pts":    "ppg",
        "points": "ppg",
    }
    df = df.rename(columns={k: v for k, v in renames.items() if k in df.columns})

    required = {"name", "team", "ppg"}
    missing = required - set(df.columns)
    if missing:
        print(f"ERROR: player_stats.csv is missing columns: {missing}")
        sys.exit(1)

    # Join seed from bracket (drops any player whose team isn't in the main draw)
    df["seed"] = df["team"].map(seed_map)
    dropped = df[df["seed"].isna()]["team"].unique().tolist()
    if dropped:
        print(f"  Skipping teams not in main bracket (First Four / not found): {dropped}")
    df = df.dropna(subset=["seed"]).copy()
    df["seed"] = df["seed"].astype(int)

    # Filter out bench players
    df["ppg"] = pd.to_numeric(df["ppg"], errors="coerce").fillna(0.0)
    df = df[df["ppg"] >= MIN_PPG].copy()
    df["ppg"] = df["ppg"].round(1)

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "name":         str(row["name"]).strip(),
            "team":         str(row["team"]).strip(),
            "seed":         int(row["seed"]),
            "season_ppg":   float(row["ppg"]),
            "is_eliminated": False,
            "drafter_id":   None,
        })

    return rows


def main():
    print("=" * 60)
    print("  Seeding Supabase — Player Draft Pool")
    print("=" * 60)

    validate_env()

    for path, label in [(BRACKET_FILE, "Bracket"), (PLAYERS_FILE, "Player stats")]:
        if not path.exists():
            print(f"\nERROR: {label} file not found:\n  {path}")
            print("  Run fetch_real_bracket.py then fetch_players.py first.")
            sys.exit(1)

    seed_map = load_seed_map(BRACKET_FILE)
    print(f"\nBracket loaded: {len(seed_map)} teams")
    for seed in sorted(set(seed_map.values())):
        teams = [t for t, s in seed_map.items() if s == seed]
        print(f"  Seed {seed:2d}: {', '.join(teams)}")

    rows = load_players(PLAYERS_FILE, seed_map)
    print(f"\nPlayers to upload (PPG ≥ {MIN_PPG}): {len(rows)}")

    # Quick verification: teams in pool
    teams_in_pool = sorted(set(r["team"] for r in rows))
    print(f"Teams in pool: {len(teams_in_pool)}")
    st_johns = [r for r in rows if "st" in r["team"].lower() and "john" in r["team"].lower()]
    if st_johns:
        print(f"  ✓ St. John's: {len(st_johns)} players")
    else:
        print("  ⚠ St. John's: 0 players (check name mapping if expected)")

    if not rows:
        print("No players found. Lower MIN_PPG or check your CSV/bracket files.")
        sys.exit(1)

    # Preview top scorers
    top = sorted(rows, key=lambda r: r["season_ppg"], reverse=True)[:10]
    print("\nTop 10 scorers in pool:")
    for r in top:
        print(f"  {r['name']:<25} #{r['seed']:2d} {r['team']:<20} {r['season_ppg']} ppg")

    confirm = input("\nUpload to Supabase? This clears undrafted players first. [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        sys.exit(0)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Delete only undrafted players so drafted rosters are preserved
    print("\nClearing undrafted players...")
    sb.table("players").delete().is_("drafter_id", "null").execute()

    # Insert in batches of 100
    batch_size = 100
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        sb.table("players").insert(batch).execute()
        print(f"  Inserted {i + 1}–{min(i + batch_size, total)} / {total}")

    print(f"\nDone! {total} players are now in Supabase.")
    print("Open Admin → Players in your draft app to verify.")


if __name__ == "__main__":
    main()
