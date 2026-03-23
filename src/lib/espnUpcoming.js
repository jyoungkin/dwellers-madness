/**
 * Fetches upcoming NCAA tournament games from ESPN and builds a map of team -> opponent.
 * Uses ESPN team IDs for reliable matching (same as fetch_players.py).
 */

const TOURNAMENT_DATES = [
  '20260317', '20260318', '20260319', '20260320', '20260321', '20260322',
  '20260326', '20260327', '20260328', '20260329', '20260404', '20260406',
]

// Our bracket team name -> ESPN team ID (must match fetch_players.py TEAM_TO_ESPN_ID)
const TEAM_TO_ESPN_ID = {
  "Duke": "150",
  "Connecticut": "41",
  "UConn": "41",
  "Michigan State": "127",
  "Michigan St": "127",
  "Kansas": "2305",
  "St. John's (NY)": "2599",
  "St John's": "2599",
  "St. John's": "2599",
  "Louisville": "97",
  "UCLA": "26",
  "Ohio State": "194",
  "Ohio St": "194",
  "TCU": "2628",
  "UCF": "2116",
  "South Florida": "58",
  "Northern Iowa": "2460",
  "California Baptist": "2856",
  "CA Baptist": "2856",
  "Cal Baptist": "2856",
  "North Dakota State": "2449",
  "N Dakota St": "2449",
  "Furman": "231",
  "Siena": "2561",
  "Florida": "57",
  "Houston": "248",
  "Illinois": "356",
  "Nebraska": "158",
  "Vanderbilt": "238",
  "North Carolina": "153",
  "Saint Mary's": "2608",
  "St. Mary's": "2608",
  "Clemson": "228",
  "Iowa": "2294",
  "Texas A&M": "245",
  "Virginia Commonwealth": "2670",
  "VCU": "2670",
  "McNeese State": "2377",
  "McNeese": "2377",
  "Troy": "2653",
  "Pennsylvania": "219",
  "Penn": "219",
  "Idaho": "70",
  "Lehigh": "2329",
  "Arizona": "12",
  "Purdue": "2509",
  "Gonzaga": "2250",
  "Arkansas": "8",
  "Wisconsin": "275",
  "Brigham Young": "252",
  "BYU": "252",
  "Miami (FL)": "2390",
  "Miami FL": "2390",
  "Miami OH": "2170",
  "Villanova": "222",
  "Utah State": "328",
  "Missouri": "142",
  "NC State": "152",
  "Texas": "251",
  "High Point": "2272",
  "Hawaii": "62",
  "Kennesaw State": "338",
  "Kennesaw St": "338",
  "Queens (NC)": "2511",
  "Queens": "2511",
  "Long Island University": "112358",
  "Long Island": "112358",
  "Michigan": "130",
  "Iowa State": "66",
  "Iowa St": "66",
  "Virginia": "258",
  "Alabama": "333",
  "Texas Tech": "2641",
  "Tennessee": "2633",
  "Kentucky": "96",
  "Georgia": "61",
  "Saint Louis": "139",
  "Santa Clara": "2541",
  "SMU": "2567",
  "Akron": "2006",
  "Hofstra": "2275",
  "Wright State": "2750",
  "Wright St": "2750",
  "Tennessee State": "2634",
  "Tennessee St": "2634",
  "Howard": "47",
  "UMBC": "113",
  "Prairie View": "2640",
  "Prairie View A&M": "2640",
}

export function getEspnId(ourTeam) {
  return TEAM_TO_ESPN_ID[ourTeam] || null
}

/** ESPN team ID -> our team name (for creating players from ESPN data) */
const ESPN_ID_TO_TEAM = {}
for (const [ourTeam, espnId] of Object.entries(TEAM_TO_ESPN_ID)) {
  if (!ESPN_ID_TO_TEAM[espnId]) ESPN_ID_TO_TEAM[espnId] = ourTeam
}
export function getTeamFromEspnId(espnId) {
  return ESPN_ID_TO_TEAM[espnId] || null
}

/** Bracket team name -> seed (2026, matches fetch_players region order). Every team has a seed. */
const TEAM_TO_SEED = {
  Duke: 1, Connecticut: 2, "Michigan State": 3, Kansas: 4, "St. John's (NY)": 5, Louisville: 6, UCLA: 7, "Ohio State": 8, TCU: 9, UCF: 10, "South Florida": 11, "Northern Iowa": 12, "California Baptist": 13, "North Dakota State": 14, Furman: 15, Siena: 16,
  Florida: 1, Houston: 2, Illinois: 3, Nebraska: 4, Vanderbilt: 5, "North Carolina": 6, "Saint Mary's": 7, Clemson: 8, Iowa: 9, "Texas A&M": 10, "Virginia Commonwealth": 11, "McNeese State": 12, Troy: 13, Pennsylvania: 14, Idaho: 15, Lehigh: 16,
  Arizona: 1, Purdue: 2, Gonzaga: 3, Arkansas: 4, Wisconsin: 5, "Brigham Young": 6, "Miami (FL)": 7, Villanova: 8, "Utah State": 9, Missouri: 10, "NC State": 11, Texas: 11, "High Point": 12, Hawaii: 13, "Kennesaw State": 14, "Queens (NC)": 15, "Long Island University": 16,
  Michigan: 1, "Iowa State": 2, Virginia: 3, Alabama: 4, "Texas Tech": 5, Tennessee: 6, Kentucky: 7, Georgia: 8, "Saint Louis": 9, "Santa Clara": 10, SMU: 11, Akron: 12, Hofstra: 13, "Wright State": 14, "Tennessee State": 15, Howard: 16,
  "Michigan St": 3, "St John's": 5, "St. John's": 5, "CA Baptist": 13, "Cal Baptist": 13, "N Dakota St": 14, McNeese: 12, Penn: 14, BYU: 6, "Miami FL": 7, "Miami OH": 16, VCU: 11, "Iowa St": 2, "Ohio St": 8, "Wright St": 14, "Tennessee St": 15, Queens: 15, "Long Island": 16, "Prairie View A&M": 16, "Prairie View": 16, UMBC: 16,
}
const ESPN_ID_TO_SEED = {}
for (const [team, espnId] of Object.entries(TEAM_TO_ESPN_ID)) {
  const seed = TEAM_TO_SEED[team]
  if (seed != null && ESPN_ID_TO_SEED[espnId] == null) {
    ESPN_ID_TO_SEED[espnId] = typeof seed === 'number' ? seed : parseInt(String(seed), 10)
  }
}
// Ensure every team ID has a seed — fail fast if any are missing
const uniqueEspnIds = [...new Set(Object.values(TEAM_TO_ESPN_ID))]
for (const id of uniqueEspnIds) {
  if (ESPN_ID_TO_SEED[id] == null) {
    const teams = Object.entries(TEAM_TO_ESPN_ID).filter(([, v]) => v === id).map(([k]) => k)
    throw new Error(`ESPN team ID ${id} (${teams.join(', ')}) has no seed in TEAM_TO_SEED`)
  }
}
export function getSeedForEspnTeamId(espnTeamId) {
  return ESPN_ID_TO_SEED[espnTeamId] ?? null
}

/**
 * Fetches upcoming (not yet completed) tournament games and returns
 * Map<espnTeamId, { opponent, opponentSeed }>. Uses ESPN team IDs for matching.
 */
function todayStrEastern() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const d = parts.find(p => p.type === 'day').value
  return `${y}${m}${d}`
}

function prevDay(yyyymmdd) {
  const y = parseInt(yyyymmdd.slice(0, 4), 10)
  const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1
  const d = parseInt(yyyymmdd.slice(6, 8), 10)
  const date = new Date(y, m, d)
  date.setDate(date.getDate() - 1)
  return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0')
}

export async function fetchUpcomingOpponents() {
  const today = todayStrEastern()
  const yesterday = prevDay(today)
  const minDate = yesterday < today ? yesterday : today
  const datesToFetch = TOURNAMENT_DATES.filter(d => d >= minDate).slice(0, 5)

  // Map by ESPN team ID for reliable matching
  const byEspnId = {}

  async function fetchScoreboard(url) {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json()
    } catch {
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        const proxyRes = await fetch(proxyUrl)
        if (!proxyRes.ok) return { events: [] }
        return proxyRes.json()
      } catch {
        return { events: [] }
      }
    }
  }

  for (const dateStr of datesToFetch) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&groups=100&seasontype=3&limit=50`
    try {
      const data = await fetchScoreboard(url)
      const events = data.events || []

      for (const ev of events) {
        const status = ev.status?.type
        if (status?.completed || status?.state === 'post') continue

        const comps = ev.competitions?.[0]?.competitors || []
        if (comps.length < 2) continue

        const isLive = status?.state === 'in'
        const c0 = comps[0]
        const c1 = comps[1]
        const idA = String(c0.team?.id ?? '')
        const idB = String(c1.team?.id ?? '')
        const nameA = c0.team?.displayName || c0.team?.shortDisplayName || ''
        const nameB = c1.team?.displayName || c1.team?.shortDisplayName || ''
        const seedA = c0.curatedRank?.current ?? c0.seed ?? null
        const seedB = c1.curatedRank?.current ?? c1.seed ?? null

        if (idA && idB) {
          byEspnId[idA] = { opponent: nameB, opponentSeed: seedB, isLive }
          byEspnId[idB] = { opponent: nameA, opponentSeed: seedA, isLive }
        }
      }
    } catch {
      // ignore fetch errors
    }
  }

  return byEspnId
}

/**
 * Given our team name and the map from fetchUpcomingOpponents (keyed by ESPN ID),
 * returns { opponent, opponentSeed } or null.
 */
export function getOpponentForTeam(ourTeam, byEspnId) {
  if (!ourTeam || !byEspnId) return null
  const espnId = getEspnId(ourTeam)
  if (!espnId) return null
  return byEspnId[espnId] || null
}

/** Format opponent for display: "(3) Houston" or "Houston" or "Houston • Live" */
export function formatOpponentDisplay(entry) {
  if (!entry || !entry.opponent) return null
  const { opponent, opponentSeed, isLive } = entry
  const base = opponentSeed != null ? `(${opponentSeed}) ${opponent}` : opponent
  return isLive ? `${base} • Live` : base
}
