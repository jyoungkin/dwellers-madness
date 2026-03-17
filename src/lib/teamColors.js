/**
 * NCAA Tournament team primary colors — sourced from teamcolorcodes.com
 * Keys match the exact team names produced by fetch_real_bracket.py / fetch_players.py.
 *
 * Usage:
 *   import { getTeamStyle } from './teamColors.js'
 *   <div style={getTeamStyle(player.team)}>...</div>
 */

export const TEAM_COLORS = {
  // ── East Region ────────────────────────────────────────────────────────────
  "Duke":                  "#003087", // Duke Blue        (teamcolorcodes.com)
  "Connecticut":           "#000E2F", // UConn Navy
  "Michigan State":        "#18453B", // Spartan Green
  "Kansas":                "#0051BA", // KU Blue          (teamcolorcodes.com)
  "St. John's (NY)":       "#BA0C2F", // Red Storm Red    (teamcolorcodes.com)
  "Louisville":            "#AD0000", // Cardinal Red     (teamcolorcodes.com)
  "UCLA":                  "#2D68C4", // Bruin Blue       (teamcolorcodes.com)
  "Ohio State":            "#BB0000", // Scarlet          (teamcolorcodes.com)
  "TCU":                   "#4D1979", // Horned Frog Purple
  "UCF":                   "#B59A0C", // UCF Gold
  "South Florida":         "#006747", // USF Green
  "Northern Iowa":         "#4B116F", // UNI Purple
  "California Baptist":    "#002868", // CBU Royal Blue
  "North Dakota State":    "#0A5640", // NDSU Green
  "Furman":                "#582C83", // Furman Purple
  "Siena":                 "#006633", // Siena Green

  // ── South Region ───────────────────────────────────────────────────────────
  "Florida":               "#0021A5", // Florida Blue     (teamcolorcodes.com)
  "Houston":               "#C8102E", // Cougar Red       (teamcolorcodes.com)
  "Illinois":              "#E84A27", // Chief Orange
  "Nebraska":              "#E41C38", // Husker Scarlet
  "Vanderbilt":            "#866D4B", // Commodore Gold
  "North Carolina":        "#4B9CD3", // Carolina Blue
  "Saint Mary's":          "#013087", // Gaels Blue
  "Clemson":               "#F66733", // Tiger Orange
  "Iowa":                  "#FFCD00", // Hawkeye Gold
  "Texas A&M":             "#500000", // Aggie Maroon
  "Virginia Commonwealth": "#C5B358", // VCU Gold
  "McNeese State":         "#003087", // Cowboys Blue
  "Troy":                  "#8B2346", // Troy Maroon
  "Pennsylvania":          "#011F5B", // Penn Blue
  "Idaho":                 "#D2001A", // Vandal Cardinal
  "Lehigh":                "#653018", // Mountain Hawk Brown

  // ── West Region ────────────────────────────────────────────────────────────
  "Arizona":               "#CC0033", // Wildcat Cardinal (teamcolorcodes.com)
  "Purdue":                "#CFB991", // Boilermaker Gold
  "Gonzaga":               "#002469", // Bulldog Blue
  "Arkansas":              "#9D2235", // Razorback Red
  "Wisconsin":             "#C5050C", // Badger Red
  "Brigham Young":         "#002E5D", // BYU Navy
  "Miami (FL)":            "#005030", // Hurricane Green
  "Villanova":             "#00205B", // Wildcat Navy
  "Utah State":            "#0F2439", // Aggie Navy
  "Missouri":              "#F1B82D", // Mizzou Gold
  "NC State":              "#CC0000", // Wolfpack Red
  "High Point":            "#5C068C", // Panther Purple
  "Hawaii":                "#024731", // Rainbow Warrior Green
  "Kennesaw State":        "#FDBB30", // Owl Gold
  "Queens (NC)":           "#7B0015", // Royals Maroon
  "Long Island University":"#002868", // Sharks Blue

  // ── Midwest Region ─────────────────────────────────────────────────────────
  "Michigan":              "#00274C", // Wolverine Blue   (teamcolorcodes.com)
  "Iowa State":            "#C8102E", // Cyclone Cardinal
  "Virginia":              "#232D4B", // Cavalier Navy
  "Alabama":               "#9E1B32", // Crimson Tide
  "Texas Tech":            "#CC0000", // Red Raider Scarlet
  "Tennessee":             "#FF8200", // Vol Orange       (teamcolorcodes.com)
  "Kentucky":              "#0033A0", // Wildcat Blue     (teamcolorcodes.com)
  "Georgia":               "#BA0C2F", // Bulldog Red
  "Saint Louis":           "#003DA5", // Billikens Blue
  "Santa Clara":           "#862633", // Bronco Maroon
  "SMU":                   "#354CA1", // Mustang Blue
  "Akron":                 "#002147", // Zip Navy
  "Hofstra":               "#003087", // Pride Blue
  "Wright State":          "#00573F", // Raiders Green
  "Tennessee State":       "#4E2683", // Tiger Purple
  "Howard":                "#003A63", // Bison Blue
}

/**
 * Returns an inline style object applying the team's primary color as:
 *   - a subtle tinted background (~8% opacity)
 *   - a solid 3px left-border accent
 *   - muted borders on the other three sides
 *
 * Falls back to undefined (no inline style) if the team has no entry.
 */
export function getTeamStyle(team) {
  const color = TEAM_COLORS[team]
  if (!color) return undefined
  return {
    backgroundColor: color + "14", // 8% opacity fill
    borderLeft:      `3px solid ${color}`,
    borderTop:       `1px solid ${color}40`,
    borderRight:     `1px solid ${color}40`,
    borderBottom:    `1px solid ${color}40`,
  }
}

/**
 * Returns a lighter hover-state variant of the team style (for interactive elements).
 */
export function getTeamHoverStyle(team) {
  const color = TEAM_COLORS[team]
  if (!color) return undefined
  return {
    backgroundColor: color + "25", // ~15% opacity on hover
  }
}
