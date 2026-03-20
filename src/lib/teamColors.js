/**
 * NCAA Tournament team primary + secondary colors — sourced from teamcolorcodes.com
 * Keys match the exact team names produced by fetch_real_bracket.py / fetch_players.py.
 * Secondary is used for player text color.
 *
 * Usage:
 *   import { getTeamStyle } from './teamColors.js'
 *   <div style={getTeamStyle(player.team)}>...</div>
 */

// { primary, secondary } — secondary used for text
export const TEAM_COLORS = {
  // ── East Region ────────────────────────────────────────────────────────────
  "Duke":                  { primary: "#003087", secondary: "#FFFFFF" },
  "Connecticut":           { primary: "#000E2F", secondary: "#FFFFFF" },
  "Michigan State":        { primary: "#18453B", secondary: "#FFFFFF" },
  "Michigan St":           { primary: "#18453B", secondary: "#FFFFFF" },
  "Kansas":                { primary: "#0051BA", secondary: "#E8000D" },
  "St. John's (NY)":       { primary: "#BA0C2F", secondary: "#FFFFFF" },
  "St John's":             { primary: "#BA0C2F", secondary: "#FFFFFF" },
  "St. John's":            { primary: "#BA0C2F", secondary: "#FFFFFF" },
  "Louisville":            { primary: "#AD0000", secondary: "#FFFFFF" },
  "UCLA":                  { primary: "#2D68C4", secondary: "#FFFFFF" },
  "Ohio State":            { primary: "#BB0000", secondary: "#666666" },
  "TCU":                   { primary: "#4D1979", secondary: "#FFFFFF" },
  "UCF":                   { primary: "#B59A0C", secondary: "#000000" },
  "South Florida":         { primary: "#006747", secondary: "#FFFFFF" },
  "Northern Iowa":         { primary: "#4B116F", secondary: "#FFFFFF" },
  "California Baptist":    { primary: "#002868", secondary: "#FFFFFF" },
  "CA Baptist":            { primary: "#002868", secondary: "#FFFFFF" },
  "North Dakota State":    { primary: "#0A5640", secondary: "#FFFFFF" },
  "N Dakota St":           { primary: "#0A5640", secondary: "#FFFFFF" },
  "Furman":                { primary: "#582C83", secondary: "#FFFFFF" },
  "Siena":                 { primary: "#006633", secondary: "#FFFFFF" },

  // ── South Region ───────────────────────────────────────────────────────────
  "Florida":               { primary: "#0021A5", secondary: "#FFFFFF" },
  "Houston":               { primary: "#C8102E", secondary: "#FFFFFF" },
  "Illinois":              { primary: "#E84A27", secondary: "#000000" },
  "Nebraska":              { primary: "#E41C38", secondary: "#FFFFFF" },
  "Vanderbilt":            { primary: "#866D4B", secondary: "#FFFFFF" },
  "North Carolina":        { primary: "#4B9CD3", secondary: "#FFFFFF" },
  "Saint Mary's":          { primary: "#013087", secondary: "#FFFFFF" },
  "Clemson":               { primary: "#F66733", secondary: "#522D80" },
  "Iowa":                  { primary: "#FFCD00", secondary: "#000000" },
  "Texas A&M":             { primary: "#500000", secondary: "#FFFFFF" },
  "Virginia Commonwealth": { primary: "#C5B358", secondary: "#000000" },
  "McNeese State":         { primary: "#003087", secondary: "#FFFFFF" },
  "Troy":                  { primary: "#8B2346", secondary: "#FFFFFF" },
  "Pennsylvania":          { primary: "#011F5B", secondary: "#FFFFFF" },
  "Penn":                  { primary: "#011F5B", secondary: "#FFFFFF" },
  "Idaho":                 { primary: "#D2001A", secondary: "#FFFFFF" },
  "Lehigh":                { primary: "#653018", secondary: "#FFFFFF" },

  // ── West Region ────────────────────────────────────────────────────────────
  "Arizona":               { primary: "#CC0033", secondary: "#FFFFFF" },
  "Purdue":                { primary: "#CFB991", secondary: "#000000" },
  "Gonzaga":               { primary: "#002469", secondary: "#FFFFFF" },
  "Arkansas":              { primary: "#9D2235", secondary: "#FFFFFF" },
  "Wisconsin":             { primary: "#C5050C", secondary: "#FFFFFF" },
  "Brigham Young":         { primary: "#002E5D", secondary: "#FFFFFF" },
  "Miami (FL)":            { primary: "#005030", secondary: "#FFFFFF" },
  "Villanova":             { primary: "#00205B", secondary: "#FFFFFF" },
  "Utah State":            { primary: "#0F2439", secondary: "#FFFFFF" },
  "Missouri":              { primary: "#F1B82D", secondary: "#000000" },
  "NC State":              { primary: "#CC0000", secondary: "#FFFFFF" },
  "Texas":                 { primary: "#BF5700", secondary: "#FFFFFF" },
  "High Point":            { primary: "#5C068C", secondary: "#FFFFFF" },
  "Hawaii":                { primary: "#024731", secondary: "#FFFFFF" },
  "Kennesaw State":        { primary: "#FDBB30", secondary: "#000000" },
  "Kennesaw St":           { primary: "#FDBB30", secondary: "#000000" },
  "Queens (NC)":           { primary: "#7B0015", secondary: "#FFFFFF" },
  "Queens":                { primary: "#7B0015", secondary: "#FFFFFF" },
  "Long Island University":{ primary: "#002868", secondary: "#FFFFFF" },
  "Long Island":           { primary: "#002868", secondary: "#FFFFFF" },
  "Miami OH":              { primary: "#B61E2E", secondary: "#FFFFFF" },

  // ── Midwest Region ─────────────────────────────────────────────────────────
  "Michigan":              { primary: "#00274C", secondary: "#FFCB05" },
  "Iowa State":            { primary: "#C8102E", secondary: "#F1B82D" },
  "Virginia":              { primary: "#232D4B", secondary: "#FFFFFF" },
  "Alabama":               { primary: "#9E1B32", secondary: "#FFFFFF" },
  "Texas Tech":            { primary: "#CC0000", secondary: "#000000" },
  "Tennessee":             { primary: "#FF8200", secondary: "#FFFFFF" },
  "Kentucky":              { primary: "#0033A0", secondary: "#FFFFFF" },
  "Georgia":               { primary: "#BA0C2F", secondary: "#000000" },
  "Saint Louis":           { primary: "#003DA5", secondary: "#FFFFFF" },
  "Santa Clara":           { primary: "#862633", secondary: "#FFFFFF" },
  "SMU":                   { primary: "#354CA1", secondary: "#FFFFFF" },
  "Akron":                 { primary: "#002147", secondary: "#FFFFFF" },
  "Hofstra":               { primary: "#003087", secondary: "#FFFFFF" },
  "Wright State":          { primary: "#00573F", secondary: "#FFFFFF" },
  "Wright St":             { primary: "#00573F", secondary: "#FFFFFF" },
  "Tennessee State":       { primary: "#4E2683", secondary: "#FFFFFF" },
  "Tennessee St":          { primary: "#4E2683", secondary: "#FFFFFF" },
  "Howard":                { primary: "#003A63", secondary: "#E51937" },
  "UMBC":                  { primary: "#FFC20E", secondary: "#000000" },
  "Prairie View":          { primary: "#582C83", secondary: "#EAAA00" },
  "Prairie View A&M":      { primary: "#582C83", secondary: "#EAAA00" },
}

/**
 * Returns an inline style object applying the team's primary color as background/border.
 * Text color is always dark slate for readability (many teams use white as secondary).
 *
 * Falls back to undefined (no inline style) if the team has no entry.
 */
export function getTeamStyle(team) {
  const colors = TEAM_COLORS[team]
  if (!colors) return undefined
  const primary = typeof colors === 'string' ? colors : colors.primary
  return {
    backgroundColor: primary + "14",
    borderLeft:      `3px solid ${primary}`,
    borderTop:       `1px solid ${primary}40`,
    borderRight:    `1px solid ${primary}40`,
    borderBottom:   `1px solid ${primary}40`,
    color:          '#1e293b',
  }
}

/**
 * Returns row style for Player Scores table.
 * - Lineup + team alive: solid team color
 * - Lineup + team eliminated: semi-opaque primary (same as eliminated pill in Standings)
 * - Bench: grayed out
 */
export function getTeamRowStyle(team, { isBench = false, isEliminated = false, rowIndex = 0 } = {}) {
  const colors = TEAM_COLORS[team]
  if (isBench) {
    const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f1f5f9'
    return { backgroundColor: bg, color: '#94a3b8', opacity: 0.6 }
  }
  if (!colors) {
    const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f1f5f9'
    return { backgroundColor: bg, color: '#1e293b' }
  }
  const primary = typeof colors === 'string' ? colors : colors.primary
  const secondary = typeof colors === 'string' ? '#1e293b' : (colors.secondary || '#FFFFFF')
  if (isEliminated) {
    return {
      backgroundColor: primary + '50',
      color: '#1e293b',
      borderLeft: `4px solid ${primary}`,
    }
  }
  return { backgroundColor: primary, color: secondary, borderLeft: `4px solid ${primary}` }
}

/**
 * Returns pill/badge style for Standings player tags.
 * - Alive (lineup): solid team color
 * - Eliminated (lineup): semi-opaque primary
 * - Bench: grayed out
 */
export function getTeamPillStyle(team, { isEliminated = false, isBench = false } = {}) {
  const colors = TEAM_COLORS[team]
  if (isBench) {
    return { backgroundColor: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
  }
  if (!colors) {
    return isEliminated
      ? { backgroundColor: '#fecaca80', color: '#1e293b', border: '1px solid #fecaca' }
      : { backgroundColor: '#1e40af', color: '#fff', border: '1px solid #1e40af' }
  }
  const primary = typeof colors === 'string' ? colors : colors.primary
  const secondary = typeof colors === 'string' ? '#1e293b' : (colors.secondary || '#FFFFFF')
  if (isEliminated) {
    return {
      backgroundColor: primary + '50',
      color: '#1e293b',
      border: `1px solid ${primary}`,
    }
  }
  return {
    backgroundColor: primary,
    color: secondary,
    border: `1px solid ${secondary}`,
  }
}

/**
 * Returns a lighter hover-state variant of the team style (for interactive elements).
 */
export function getTeamHoverStyle(team) {
  const colors = TEAM_COLORS[team]
  if (!colors) return undefined
  const primary = typeof colors === 'string' ? colors : colors.primary
  return {
    backgroundColor: primary + "25",
  }
}
