"""
fetch_players.py
~~~~~~~~~~~~~~~~
Fetches per-game player scoring stats for all teams in the 2026 bracket.

Strategy
--------
Primary: Scrape ESPN team stats pages (server-rendered HTML tables).
         URL: https://www.espn.com/mens-college-basketball/team/stats/_/id/{espn_id}

Fallback A: data/players_manual.csv  (manually downloaded/exported CSV)
Fallback B: data/players_paste.txt   (text pasted from ESPN stats table)

Output: data/player_stats.csv
  Columns: player, team, games, ppg, apg, rpg, espn_team_abbr
"""

import io
import json
import sys
import time
import urllib3
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

REQUEST_DELAY = 2.0

# ---------------------------------------------------------------------------
# Bracket team name -> ESPN team ID mapping
# ---------------------------------------------------------------------------
TEAM_TO_ESPN_ID: dict[str, str] = {
    # East Region
    "Duke":                  "150",
    "Connecticut":           "41",
    "Michigan State":        "127",
    "Michigan St":           "127",    # bracket variant
    "Kansas":                "2305",
    "St. John's (NY)":       "2599",
    "St John's":             "2599",   # bracket variant (no period)
    "St. John's":            "2599",
    "Louisville":            "97",
    "UCLA":                  "26",
    "Ohio State":            "194",
    "TCU":                   "2628",
    "UCF":                   "2116",
    "South Florida":         "58",
    "Northern Iowa":         "2460",
    "California Baptist":    "2856",
    "CA Baptist":            "2856",   # bracket variant
    "North Dakota State":    "2449",
    "N Dakota St":           "2449",   # bracket variant
    "Furman":                "231",
    "Siena":                 "2561",
    # South Region
    "Florida":               "57",
    "Houston":               "248",
    "Illinois":              "356",
    "Nebraska":              "158",
    "Vanderbilt":            "238",
    "North Carolina":        "153",
    "Saint Mary's":          "2608",
    "Clemson":               "228",
    "Iowa":                  "2294",
    "Texas A&M":             "245",
    "Texas":                 "251",   # West / First Four (was missing — no pool players)
    "Virginia Commonwealth": "2670",
    "VCU":                   "2670",
    "McNeese State":         "2377",
    "McNeese":               "2377",
    "Troy":                  "2653",
    "Pennsylvania":          "219",
    "Penn":                  "219",
    "Idaho":                 "70",
    "Lehigh":                "2329",
    "Prairie View":          "2640",
    "Prairie View A&M":      "2640",
    # West Region
    "Arizona":               "12",
    "Purdue":                "2509",
    "Gonzaga":               "2250",
    "Arkansas":              "8",
    "Wisconsin":             "275",
    "Brigham Young":         "252",
    "Miami (FL)":            "2390",
    "Miami":                 "2390",  # bracket label "Miami" (West)
    "Villanova":             "222",
    "Utah State":            "328",
    "Missouri":              "142",
    "NC State":              "152",
    "High Point":            "2272",
    "Hawaii":                "62",
    "Kennesaw State":        "338",
    "Kennesaw St":           "338",
    "Queens (NC)":           "2511",
    "Long Island University": "112358",
    # Midwest Region
    "Michigan":              "130",
    "Iowa State":            "66",
    "Virginia":              "258",
    "Alabama":               "333",
    "Texas Tech":            "2641",
    "Tennessee":             "2633",
    "Kentucky":              "96",
    "Georgia":               "61",
    "Saint Louis":           "139",
    "Santa Clara":           "2541",
    "SMU":                   "2567",
    "Akron":                 "2006",
    "Hofstra":               "2275",
    "Wright State":          "2750",
    "Wright St":             "2750",
    "Tennessee State":       "2634",
    "Tennessee St":          "2634",
    "Howard":                "47",
    "UMBC":                  "113",
    "Miami OH":              "2170",  # Midwest First Four / bracket "Miami OH"
    "Miami (Ohio)":          "2170",
}


# ---------------------------------------------------------------------------
# ESPN scraper
# ---------------------------------------------------------------------------

def _fetch_team_players_espn(espn_id: str, team_name: str) -> list[dict]:
    """Scrape the ESPN team stats page for per-game player stats."""
    url = f"https://www.espn.com/mens-college-basketball/team/stats/_/id/{espn_id}"
    try:
        resp = requests.get(url, headers=HEADERS, verify=False, timeout=25)
        if resp.status_code != 200:
            return []

        soup = BeautifulSoup(resp.text, "lxml")
        tables = soup.find_all("table")
        if len(tables) < 2:
            return []

        # Table 0 (or 2) has player names; Table 1 has per-game stats
        name_df  = pd.read_html(io.StringIO(str(tables[0])))[0]
        stats_df = pd.read_html(io.StringIO(str(tables[1])))[0]

        if name_df.shape[0] != stats_df.shape[0]:
            return []

        # Expected stats columns: GP MIN PTS REB AST ...
        stats_df.columns = [str(c).strip().upper() for c in stats_df.columns]
        players = []
        for i in range(len(name_df)):
            raw_name = str(name_df.iloc[i, 0]).strip()
            if not raw_name or raw_name in ("nan", "Total"):
                continue
            # Strip trailing position letter (e.g., "Graham Ike F" -> "Graham Ike")
            parts = raw_name.rsplit(" ", 1)
            if len(parts) == 2 and parts[1] in ("F", "G", "C", "SF", "PF", "SG", "PG"):
                name = parts[0]
            else:
                name = raw_name

            row = stats_df.iloc[i]
            games = _to_float(row.get("GP", 0))
            ppg   = _to_float(row.get("PTS", 0))
            rpg   = _to_float(row.get("REB", 0))
            apg   = _to_float(row.get("AST", 0))

            players.append({
                "player":         name,
                "team":           team_name,
                "espn_team_abbr": "",
                "games":          games,
                "ppg":            ppg,
                "apg":            apg,
                "rpg":            rpg,
            })
        return players

    except Exception:
        return []


def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# Main fetch function
# ---------------------------------------------------------------------------

def fetch_players(bracket_path: Path, year: int = 2026,
                  use_cache: bool = True) -> pd.DataFrame:
    cache = DATA_DIR / "player_stats.csv"

    if use_cache and cache.exists():
        df = pd.read_csv(cache)
        print(f"[players] Loaded {len(df)} players from cache ({cache})")
        return df

    if not bracket_path.exists():
        print(f"[players] ERROR: {bracket_path} not found.")
        sys.exit(1)

    with open(bracket_path) as f:
        bracket = json.load(f)

    # Region teams (exclude TBD placeholders)
    tournament_teams: list[str] = []
    for region_teams in bracket["regions"].values():
        for t in region_teams:
            team_name = t["team"]
            if not str(team_name).startswith("TBD"):
                tournament_teams.append(team_name)

    # First Four play-in teams (with ESPN IDs from API)
    first_four_teams: list[tuple[str, str]] = []  # (team_name, espn_id)
    for game in bracket.get("first_four", []):
        for t in game.get("teams", []):
            name = t.get("name", "")
            espn_id = t.get("espn_id", "")
            if name and espn_id:
                first_four_teams.append((name, espn_id))

    # ---- Resumable partial cache -----------------------------------------
    partial_cache = DATA_DIR / "player_stats_partial.csv"
    if partial_cache.exists():
        existing = pd.read_csv(partial_cache)
        already_done = set(existing["team"].unique())
        all_players = existing.to_dict("records")
        print(f"[players] Resuming: {len(already_done)} teams already cached.")
    else:
        already_done = set()
        all_players = []

    # Build fetch list: (team_name, espn_id) for each team to fetch
    to_fetch: list[tuple[str, str]] = []
    failed: list[str] = []
    for team in tournament_teams:
        if team not in already_done:
            espn_id = TEAM_TO_ESPN_ID.get(team)
            if espn_id:
                to_fetch.append((team, espn_id))
            else:
                failed.append(team)
    for team_name, espn_id in first_four_teams:
        if team_name not in already_done:
            to_fetch.append((team_name, espn_id))

    print(f"[players] Fetching ESPN stats for {len(to_fetch)} remaining teams ...")
    if first_four_teams:
        print(f"[players] Including {len(first_four_teams)} First Four teams")

    for i, (team, espn_id) in enumerate(to_fetch):
        players = _fetch_team_players_espn(espn_id, team)
        if players:
            all_players.extend(players)
            print(f"  [{i+1:2d}/{len(to_fetch)}] {team} (ESPN {espn_id}): {len(players)} players")
            pd.DataFrame(all_players).to_csv(partial_cache, index=False)
        else:
            failed.append(team)
            print(f"  [{i+1:2d}/{len(to_fetch)}] {team} (ESPN {espn_id}): NOT FOUND")

        time.sleep(REQUEST_DELAY)

    if failed:
        print(f"\n[players] Could not fetch: {failed[:10]}")

    if all_players:
        df = pd.DataFrame(all_players)
        df.to_csv(cache, index=False)
        if partial_cache.exists() and not failed:
            partial_cache.unlink()
        print(f"[players] Saved {len(df)} players -> {cache}")
        return df

    return _try_manual_fallback(cache)


def _try_manual_fallback(cache: Path) -> pd.DataFrame:
    manual_csv = DATA_DIR / "players_manual.csv"
    paste_file = DATA_DIR / "players_paste.txt"

    if manual_csv.exists():
        print(f"[players] Using manual CSV: {manual_csv}")
        df = pd.read_csv(manual_csv)
        df = _normalize_manual(df)
        df.to_csv(cache, index=False)
        return df

    if paste_file.exists():
        print(f"[players] Parsing pasted table: {paste_file}")
        df = _parse_paste(paste_file.read_text(encoding="utf-8"))
        if df is not None:
            df.to_csv(cache, index=False)
            return df

    print(
        "\n[players] Could not fetch player stats.\n"
        "  Options:\n"
        "    A) Re-run the script (ESPN may have been temporarily unavailable).\n"
        "    B) Export player stats as data/players_manual.csv:\n"
        "       columns: player, team, games, ppg\n"
        "    C) Copy ESPN table text into data/players_paste.txt"
    )
    sys.exit(1)


def _normalize_manual(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip().lower() for c in df.columns]
    renames = {"name": "player", "athlete": "player",
               "pts": "ppg", "points": "ppg", "gp": "games", "g": "games"}
    df = df.rename(columns={k: v for k, v in renames.items() if k in df.columns})
    for col in ("ppg", "games", "apg", "rpg"):
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    if "player" not in df.columns:
        raise ValueError("Manual CSV must have a 'player' column")
    if "team" not in df.columns:
        df["team"] = ""
    if "espn_team_abbr" not in df.columns:
        df["espn_team_abbr"] = ""
    return df[["player", "team", "espn_team_abbr", "games", "ppg", "apg", "rpg"]]


def _parse_paste(text: str) -> pd.DataFrame | None:
    import re
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    rows = []
    for line in lines:
        parts = re.split(r"\t|  +", line)
        parts = [p.strip() for p in parts if p.strip()]
        if not parts or parts[0].upper() in ("RK", "NAME"):
            continue
        if parts[0].isdigit():
            parts = parts[1:]
        if len(parts) < 3:
            continue
        name  = parts[0]
        team  = parts[1] if len(parts) > 1 else ""
        games = _to_float(parts[2]) if len(parts) > 2 else 0.0
        ppg   = _to_float(parts[4]) if len(parts) > 4 else _to_float(parts[3])
        rows.append({"player": name, "team": team, "espn_team_abbr": "",
                     "games": games, "ppg": ppg, "apg": 0.0, "rpg": 0.0})
    return pd.DataFrame(rows) if rows else None


if __name__ == "__main__":
    # Delete partial cache from old sports-reference attempt
    old_partial = DATA_DIR / "player_stats_partial.csv"
    if old_partial.exists():
        old_partial.unlink()
        print("[players] Cleared old partial cache.")

    bracket_file = DATA_DIR / "bracket_2026.json"
    df = fetch_players(bracket_file, use_cache=False)
    print("\nTop 30 scorers on tournament teams:")
    print(
        df[["player", "team", "games", "ppg"]]
        .sort_values("ppg", ascending=False)
        .head(30)
        .to_string(index=False)
    )
