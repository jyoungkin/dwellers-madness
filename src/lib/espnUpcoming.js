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
  "Michigan State": "127",
  "Michigan St": "127",
  "Kansas": "2305",
  "St. John's (NY)": "2599",
  "St John's": "2599",
  "St. John's": "2599",
  "Louisville": "97",
  "UCLA": "26",
  "Ohio State": "194",
  "TCU": "2628",
  "UCF": "2116",
  "South Florida": "58",
  "Northern Iowa": "2460",
  "California Baptist": "2856",
  "CA Baptist": "2856",
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
  "Clemson": "228",
  "Iowa": "2294",
  "Texas A&M": "245",
  "Virginia Commonwealth": "2670",
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

function getEspnId(ourTeam) {
  return TEAM_TO_ESPN_ID[ourTeam] || null
}

/**
 * Fetches upcoming (not yet completed) tournament games and returns
 * Map<espnTeamId, { opponent, opponentSeed }>. Uses ESPN team IDs for matching.
 */
export async function fetchUpcomingOpponents() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const datesToFetch = TOURNAMENT_DATES.filter(d => d >= today).slice(0, 4)

  // Map by ESPN team ID for reliable matching
  const byEspnId = {}

  for (const dateStr of datesToFetch) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&groups=100&seasontype=3&limit=50`
    try {
      const res = await fetch(url)
      const data = await res.json()
      const events = data.events || []

      for (const ev of events) {
        const status = ev.status?.type
        if (status?.completed || status?.state === 'post') continue

        const comps = ev.competitions?.[0]?.competitors || []
        if (comps.length < 2) continue

        const c0 = comps[0]
        const c1 = comps[1]
        const idA = String(c0.team?.id ?? '')
        const idB = String(c1.team?.id ?? '')
        const nameA = c0.team?.displayName || c0.team?.shortDisplayName || ''
        const nameB = c1.team?.displayName || c1.team?.shortDisplayName || ''
        const seedA = c0.curatedRank?.current ?? c0.seed ?? null
        const seedB = c1.curatedRank?.current ?? c1.seed ?? null

        if (idA && idB) {
          byEspnId[idA] = { opponent: nameB, opponentSeed: seedB }
          byEspnId[idB] = { opponent: nameA, opponentSeed: seedA }
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

/** Format opponent for display: "(3) Houston" or "Houston" */
export function formatOpponentDisplay(entry) {
  if (!entry || !entry.opponent) return null
  const { opponent, opponentSeed } = entry
  return opponentSeed != null ? `(${opponentSeed}) ${opponent}` : opponent
}
