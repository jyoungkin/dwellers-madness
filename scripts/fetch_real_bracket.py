"""
fetch_real_bracket.py
~~~~~~~~~~~~~~~~~~~~~
Fetches the real 2026 NCAA Tournament bracket from ESPN scoreboard API
and writes data/bracket_2026.json.

Run once after Selection Sunday:
  .venv\\Scripts\\python.exe fetch_real_bracket.py
"""

import json
import re
import sys
import urllib3
import requests
from pathlib import Path

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = Path("data")
BRACKET_FILE = DATA_DIR / "bracket_2026.json"

H = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, */*",
    "Referer": "https://www.espn.com/",
}

BRACKET_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]

ESPN_NAME_FIX = {
    "BYU":                  "Brigham Young",
    "VCU":                  "Virginia Commonwealth",
    "Saint Mary's (CA)":    "Saint Mary's",
    "Saint Mary's":         "Saint Mary's",
    "UNCW":                 "UNC Wilmington",
    "St. John's":           "St. John's (NY)",
    "Nebraska Omaha":       "Omaha",
    "SIUE":                 "SIU Edwardsville",
    "SIU Edwardsville":     "SIU Edwardsville",
    "McNeese":              "McNeese State",
    "Ole Miss":             "Mississippi",
    "UConn":                "Connecticut",
    "Mississippi":          "Mississippi",
    "LSU":                  "LSU",
    "TCU":                  "TCU",
    "Hawaii":               "Hawaii",
    "Hawai'i":              "Hawaii",
    "Cal Baptist":          "California Baptist",
    "LIU":                  "Long Island",
}

def fix_name(name):
    return ESPN_NAME_FIX.get(name, name)

def _finalize(regions, first_four=None):
    result = {}
    for region_name, seed_map in regions.items():
        ordered = []
        for s in BRACKET_ORDER:
            team = seed_map.get(s, f"TBD Seed {s}")
            ordered.append({"seed": s, "team": team})
        result[region_name] = ordered
    rlist = list(result.keys())
    return {
        "regions": result,
        "final_four_matchups": [[rlist[0], rlist[1]], [rlist[2], rlist[3]]],
        "first_four": first_four or [],
    }


def fetch_events_for_date(date_str):
    """Fetch ESPN tournament events for a given date (YYYYMMDD)."""
    url = (
        f"https://site.api.espn.com/apis/site/v2/sports/basketball/"
        f"mens-college-basketball/scoreboard?groups=100&seasontype=3&dates={date_str}&limit=32"
    )
    r = requests.get(url, headers=H, verify=False, timeout=20)
    if r.status_code != 200:
        return []
    return r.json().get("events", [])


def extract_bracket_from_events(events):
    """Extract seed->team mappings per region from ESPN event objects.
    
    Region name lives in:  competitions[0].notes[].headline
    e.g. "NCAA Men's Basketball Championship - East Region - 1st Round"
    
    First Four games (headline contains "First Four") are extracted separately:
    we collect all 8 play-in teams with their ESPN IDs for the player pool,
    but leave TBD in the main bracket (winner not yet determined).
    """
    region_seeds = {}
    first_four = []  # [{"seed": 16, "teams": [{"name": "...", "espn_id": "..."}, ...]}, ...]
    KNOWN_REGIONS = {"East", "West", "South", "Midwest"}

    for ev in events:
        competition = ev.get("competitions", [{}])[0] if ev.get("competitions") else {}

        # Parse region and First Four flag from notes headline
        region = ""
        is_first_four = False
        notes = competition.get("notes", [])
        for note in notes:
            headline = note.get("headline", "")
            if "first four" in headline.lower():
                is_first_four = True
            for rname in KNOWN_REGIONS:
                if rname.lower() in headline.lower():
                    region = rname
                    break
            if region:
                break

        if not region:
            continue  # skip events with no region label

        competitors = competition.get("competitors", [])
        if is_first_four:
            # First Four: collect BOTH teams with ESPN IDs; don't overwrite region_seeds
            teams_in_game = []
            for comp in competitors:
                seed = comp.get("curatedRank", {}).get("current") or comp.get("seed")
                team = comp.get("team", {})
                name = team.get("shortDisplayName") or team.get("displayName", "")
                espn_id = team.get("id", "")
                if seed and name and espn_id:
                    try:
                        s = int(seed)
                        if 1 <= s <= 16:
                            teams_in_game.append({"name": fix_name(name), "espn_id": str(espn_id)})
                    except (ValueError, TypeError):
                        pass
            if teams_in_game:
                s = int(competitors[0].get("curatedRank", {}).get("current") or competitors[0].get("seed") or 0)
                first_four.append({"seed": s, "teams": teams_in_game})
            continue

        # Regular region game
        for comp in competitors:
            seed = comp.get("curatedRank", {}).get("current") or comp.get("seed")
            team = comp.get("team", {})
            name = team.get("shortDisplayName") or team.get("displayName", "")

            if seed and name:
                if region not in region_seeds:
                    region_seeds[region] = {}
                try:
                    s = int(seed)
                    if 1 <= s <= 16:   # skip curatedRank=99 placeholders
                        region_seeds[region][s] = fix_name(name)
                except (ValueError, TypeError):
                    pass

    return region_seeds, first_four


def debug_one_event(events):
    """Print structure of first event for debugging."""
    if not events:
        return
    ev = events[0]
    comp = ev.get("competitions", [{}])[0] if ev.get("competitions") else {}
    print("\n  Sample event structure:")
    print(f"    name: {ev.get('name')}")
    print(f"    shortName: {ev.get('shortName')}")
    print(f"    groups: {ev.get('groups')}")
    print(f"    season: {ev.get('season')}")
    for i, c in enumerate(comp.get("competitors", [])[:2]):
        print(f"    competitor[{i}]:")
        print(f"      curatedRank: {c.get('curatedRank')}")
        print(f"      seed: {c.get('seed')}")
        print(f"      team.displayName: {c.get('team', {}).get('displayName')}")
    notes = comp.get("notes", [])
    if notes:
        print(f"    notes: {notes}")


def main():
    print("=" * 60)
    print("  Fetching real 2026 NCAA Tournament bracket")
    print("=" * 60)

    # Collect events across all first-round days
    # First Four: March 17-18 (Texas/NC State, Howard/UMBC on 17th), First Round: March 20-21
    all_events = []
    for date in ["20260317", "20260318", "20260319", "20260320", "20260321"]:
        evs = fetch_events_for_date(date)
        print(f"  {date}: {len(evs)} events")
        all_events.extend(evs)

    if not all_events:
        print("No events found.")
        sys.exit(1)

    debug_one_event(all_events)

    region_seeds, first_four = extract_bracket_from_events(all_events)
    print(f"\n  Regions extracted: {list(region_seeds.keys())}")
    for rn, sm in sorted(region_seeds.items()):
        seeds_found = sorted(sm.keys())
        print(f"    {rn}: seeds {seeds_found}")
        for seed, team in sorted(sm.items()):
            print(f"      ({seed:2d}) {team}")
    if first_four:
        print(f"\n  First Four: {len(first_four)} games")
        for game in first_four:
            names = [t["name"] for t in game["teams"]]
            print(f"    Seed {game['seed']}: {' vs '.join(names)}")

    if len(region_seeds) != 4:
        # Show raw data for debugging
        print(f"\n  Got {len(region_seeds)} regions (need 4). Raw region names: {list(region_seeds.keys())}")
        print("\n  Inspect full first event for correct region field:")
        if all_events:
            print(json.dumps(all_events[0], indent=2)[:2000])
        sys.exit(1)

    bracket = _finalize(region_seeds, first_four)
    with open(BRACKET_FILE, "w") as f:
        json.dump(bracket, f, indent=2)
    print(f"\nSaved real bracket -> {BRACKET_FILE}")
    print("Now run:  .venv\\Scripts\\python.exe run_all.py --fresh")


if __name__ == "__main__":
    main()
