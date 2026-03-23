import { supabase } from './supabase.js'
import { getEspnId, getTeamFromEspnId, getSeedForEspnTeamId } from './espnUpcoming.js'

// 2026 NCAA Tournament dates (First Four through Championship)
const TOURNAMENT_DATES = [
  '20260317', '20260318', // First Four / Play-In
  '20260319', '20260320', // Round of 64 (starts March 19)
  '20260321', '20260322', // Round of 32
  '20260326', '20260327', // Sweet Sixteen
  '20260328', '20260329', // Elite Eight
  '20260404',              // Final Four
  '20260406',              // Championship
]

const ESPN_ROUND_MAP = {
  'first four': 'Play-In',
  'first round': 'Round of 64',
  '1st round': 'Round of 64',
  'second round': 'Round of 32',
  '2nd round': 'Round of 32',
  'sweet sixteen': 'Sweet Sixteen',
  'sweet 16': 'Sweet Sixteen',
  'elite eight': 'Elite Eight',
  'elite 8': 'Elite Eight',
  'final four': 'Final Four',
  'national championship': 'Championship',
  'championship': 'Championship',
}

const DATE_TO_ROUND = {
  '20260317': 'Play-In',
  '20260318': 'Play-In',
  '20260319': 'Round of 64',
  '20260320': 'Round of 64',
  '20260321': 'Round of 32',
  '20260322': 'Round of 32',
  '20260326': 'Sweet Sixteen',
  '20260327': 'Sweet Sixteen',
  '20260328': 'Elite Eight',
  '20260329': 'Elite Eight',
  '20260404': 'Final Four',
  '20260406': 'Championship',
}

function normalizeRoundName(espnNote, dateStr) {
  if (espnNote) {
    const lower = espnNote.toLowerCase()
    for (const [key, val] of Object.entries(ESPN_ROUND_MAP)) {
      if (lower.includes(key)) return val
    }
  }
  return dateStr ? DATE_TO_ROUND[dateStr] ?? null : null
}

function normalizeName(name) {
  let s = name
    .toLowerCase()
    .trim()
    .replace(/\s*(jr\.?|sr\.?|iii|ii|iv)\s*$/i, '')
    .replace(/[^a-z\s,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(x => x.trim())
    s = first && last ? `${first} ${last}` : s.replace(/,/g, ' ')
  }
  return s.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Get today's date string YYYYMMDD in US Eastern (NCAA games use Eastern)
function todayStr() {
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

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball'

/** Bump when sync parsing/matching changes so completed games are re-fetched once. */
const ESPN_SYNC_PARSER_VERSION = 3

async function fetchFromEspn(path) {
  const url = `${ESPN_BASE}${path}`
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(`ESPN API ${res.status}: ${res.statusText}`)
    return res.json()
  } catch (err) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      const proxyRes = await fetch(proxyUrl)
      if (!proxyRes.ok) throw new Error(`Proxy failed: ${proxyRes.status}`)
      return proxyRes.json()
    } catch (proxyErr) {
      throw new Error(`ESPN fetch failed: ${err.message}. CORS proxy also failed.`)
    }
  }
}

async function fetchEventsForDate(dateStr) {
  const data = await fetchFromEspn(`/scoreboard?dates=${dateStr}&groups=100&limit=50`)
  return data.events || []
}

async function fetchGameSummary(eventId) {
  return await fetchFromEspn(`/summary?event=${eventId}`)
}

/** Column index for points in ESPN box stat rows (label varies by feed). */
function findPtsColumnIndex(names) {
  if (!names?.length) return -1
  const i = names.indexOf('PTS')
  if (i !== -1) return i
  return names.findIndex(n => {
    const u = String(n || '').toUpperCase().replace(/\s+/g, '')
    return u === 'PTS' || u === 'POINTS' || u === 'POINTS.'
  })
}

function asStatisticsArray(statistics) {
  if (statistics == null) return []
  return Array.isArray(statistics) ? statistics : [statistics]
}

/** Parse numeric points from leader displayValue ("24", "24 PTS", etc.) */
function parseLeaderDisplayPts(displayValue) {
  if (displayValue == null) return NaN
  if (typeof displayValue === 'number' && !Number.isNaN(displayValue)) return Math.floor(displayValue)
  const m = String(displayValue).match(/-?\d+/)
  return m ? parseInt(m[0], 10) : NaN
}

function findPointsLeaderBlock(leaders) {
  if (!Array.isArray(leaders) || !leaders.length) return null
  const byName = leaders.find(l => (l.name || '').toLowerCase() === 'points' && l.leaders?.length)
  if (byName) return byName
  return leaders.find(l => {
    const n = (l.name || l.displayName || l.shortDisplayName || '').toLowerCase()
    return n.includes('point') && l.leaders?.length
  }) || null
}

/** Many NCAA summaries put per-game scoring under summary.leaders, not boxscore.teams */
function parsePlayerPointsFromSummaryLeaders(summary, roundName) {
  const results = {}
  const groups = summary?.leaders
  if (!Array.isArray(groups)) return results

  for (const g of groups) {
    const label = (g.name || g.displayName || '').toLowerCase()
    if (!label.includes('point')) continue
    for (const row of g.leaders || []) {
      const athlete = row.athlete || row
      const displayName = athlete?.displayName
      const pts = parseLeaderDisplayPts(row.displayValue)
      if (!displayName || Number.isNaN(pts) || pts < 0) continue
      const espnPlayerId = String(athlete?.id ?? '')
      const espnTeamId = String(athlete?.team?.id ?? row.team?.id ?? '')
      const team = espnTeamId ? (getTeamFromEspnId(espnTeamId) || row.team?.displayName || athlete?.team?.displayName) : null
      const rec = { points: pts, roundName, team, espnPlayerId, espnTeamId, displayName }
      const key = espnPlayerId ? espnPlayerId : `_n:${displayName}`
      results[key] = rec
    }
  }
  return results
}

function parsePlayerPointsFromSummary(summary, roundName) {
  const results = {}
  if (!summary) return results

  const box = summary.boxscore ?? summary.Boxscore
  if (!box) return results

  // Structure 1: boxscore.players (legacy)
  const players = box.players
  if (players) {
    for (const teamData of players) {
      const team = getTeamFromEspnId(String(teamData.team?.id ?? '')) || teamData.team?.displayName || null
      for (const statGroup of asStatisticsArray(teamData.statistics)) {
        const names = statGroup.names || []
        const ptsIndex = findPtsColumnIndex(names)
        if (ptsIndex === -1) continue

        for (const athlete of statGroup.athletes || []) {
          const displayName = athlete.athlete?.displayName
          const ptsStr = athlete.stats?.[ptsIndex]
          const pts = parseInt(ptsStr, 10)
          const espnPlayerId = String(athlete.athlete?.id ?? athlete.id ?? '')
          const espnTeamId = String(teamData.team?.id ?? '')
          if (displayName && !isNaN(pts) && pts >= 0) {
            const rec = { points: pts, roundName, team, espnPlayerId, espnTeamId, displayName }
            const key = espnPlayerId ? espnPlayerId : `_n:${displayName}`
            results[key] = rec
          }
        }
      }
    }
  }

  // Structure 2: boxscore.teams (current ESPN API) — merge if structure 1 was empty or partial
  const teams = box.teams
  if (teams) {
    for (const teamData of teams) {
      const team = getTeamFromEspnId(String(teamData.team?.id ?? '')) || teamData.team?.displayName || null
      for (const statGroup of asStatisticsArray(teamData.statistics)) {
        const names = statGroup.names || []
        const ptsIndex = findPtsColumnIndex(names)
        if (ptsIndex === -1) continue

        for (const athlete of statGroup.athletes || []) {
          const displayName = athlete.athlete?.displayName
          const ptsStr = athlete.stats?.[ptsIndex]
          const pts = parseInt(ptsStr, 10)
          const espnPlayerId = String(athlete.athlete?.id ?? athlete.id ?? '')
          const espnTeamId = String(teamData.team?.id ?? '')
          if (displayName && !isNaN(pts) && pts >= 0) {
            const rec = { points: pts, roundName, team, espnPlayerId, espnTeamId, displayName }
            const key = espnPlayerId ? espnPlayerId : `_n:${displayName}`
            results[key] = rec
          }
        }
      }
    }
  }

  return results
}

/** Extract points leaders from scoreboard (works for live games; summary lacks full box in current ESPN API) */
function parsePlayerPointsFromScoreboard(event, roundName) {
  const results = {}
  const comps = event.competitions?.[0]?.competitors || []

  for (const comp of comps) {
    const ptsLeader = findPointsLeaderBlock(comp.leaders || [])
    if (!ptsLeader?.leaders) continue

    const espnId = String(comp.team?.id ?? '')
    const team = getTeamFromEspnId(espnId) || comp.team?.displayName || comp.team?.shortDisplayName || null

    for (const l of ptsLeader.leaders) {
      const displayName = l.athlete?.displayName
      const pts = parseLeaderDisplayPts(l.displayValue)
      if (displayName && !Number.isNaN(pts) && pts >= 0) {
        const athleteTeamId = String(l.athlete?.team?.id ?? '')
        const playerTeam = athleteTeamId ? (getTeamFromEspnId(athleteTeamId) || comp.team?.displayName) : team
        const espnPlayerId = String(l.athlete?.id ?? '')
        const espnTeamId = athleteTeamId || espnId
        const rec = { points: pts, roundName, team: playerTeam || team, espnPlayerId, espnTeamId, displayName }
        const key = espnPlayerId ? espnPlayerId : `_n:${displayName}`
        results[key] = rec
      }
    }
  }

  return results
}

/** Same-person check: rejects Cameron vs Cayden Boozer when espn_player_id is wrong */
function namesCompatible(ourName, espnName) {
  const ourNorm = normalizeName(ourName)
  const espnNorm = normalizeName(espnName)
  if (ourNorm === espnNorm) return true
  if (ourNorm.startsWith(espnNorm + ' ') || espnNorm.startsWith(ourNorm + ' ')) return true
  const ourParts = ourNorm.split(' ').filter(Boolean)
  const espnParts = espnNorm.split(' ').filter(Boolean)
  const ourLast = ourParts[ourParts.length - 1] || ''
  const espnLast = espnParts[espnParts.length - 1] || ''
  if (ourLast !== espnLast) return false
  const ourFirst = ourParts[0] || ''
  const espnFirst = espnParts[0] || ''
  return ourFirst === espnFirst || ourFirst.startsWith(espnFirst) || espnFirst.startsWith(ourFirst)
}

function teamsMatch(ourTeam, statsTeam) {
  if (!ourTeam || !statsTeam) return false
  const ourId = getEspnId(ourTeam)
  const statsId = getEspnId(statsTeam)
  if (ourId && statsId && ourId === statsId) return true
  const ourLower = ourTeam.toLowerCase()
  const statsLower = statsTeam.toLowerCase()
  if (statsLower === ourLower) return true
  // "Texas" must not match "North Texas", "Texas Southern", etc. via substring (word "Texas" appears in both)
  if (ourLower === 'texas') {
    const ambiguous = /^(north|texas\s+southern|texas\s+state|texas\s+a&m|texas\s+am|texas\s+tech)\b/i
    if (ambiguous.test(statsLower) || statsLower.includes('north texas') || statsLower.includes('texas southern')) return false
  }
  // Avoid Tennessee vs Tennessee State: reject when one is a prefix and the other continues with more text
  if (statsLower.startsWith(ourLower) && statsLower.length > ourLower.length && /[\s-]/.test(statsLower[ourLower.length])) return false
  if (ourLower.startsWith(statsLower) && ourLower.length > statsLower.length && /[\s-]/.test(ourLower[statsLower.length])) return false
  return statsLower.includes(ourLower) || ourLower.includes(statsLower)
}

/** Prefer ESPN team id on stat rows (team string may be null or an unmapped display name). */
function statRowsMatchOurTeam(ourTeam, statsRows) {
  if (!ourTeam || !statsRows?.length) return false
  const ourId = getEspnId(ourTeam)
  if (ourId) {
    for (const s of statsRows) {
      if (s.espnTeamId && String(s.espnTeamId) === ourId) return true
    }
  }
  const teamStr = statsRows.find(r => r.team)?.team
  return teamsMatch(ourTeam, teamStr)
}

/** True if team is in the set of losing ESPN team IDs (handles name variants) */
function isTeamEliminated(team, loserTeamIds) {
  if (!team || !loserTeamIds?.size) return false
  const ourId = getEspnId(team)
  if (ourId && loserTeamIds.has(ourId)) return true
  for (const lid of loserTeamIds) {
    const canonical = getTeamFromEspnId(lid)
    if (canonical && teamsMatch(team, canonical)) return true
  }
  return false
}

function getEspnDisplayName(key, allStats) {
  if (key.startsWith('_n:')) return key.slice(3)
  return allStats[key]?.[0]?.displayName || key
}

function findBestNameMatch(ourName, allStatsKeys, allStats, ourTeam) {
  if (!ourTeam) return null
  const normalized = normalizeName(ourName)

  // 1. Exact match (require team match)
  for (const key of allStatsKeys) {
    const espnName = getEspnDisplayName(key, allStats)
    if (normalizeName(espnName) === normalized && statRowsMatchOurTeam(ourTeam, allStats[key])) return key
  }

  // 2. One name contains the other (handles "Darius Acuff" vs "Darius Acuff Jr") — require team match
  for (const key of allStatsKeys) {
    const espnName = getEspnDisplayName(key, allStats)
    const n = normalizeName(espnName)
    if ((n === normalized || n.startsWith(normalized + ' ') || normalized.startsWith(n + ' ')) &&
        statRowsMatchOurTeam(ourTeam, allStats[key])) return key
  }

  const parts = normalized.split(' ').filter(Boolean)
  const lastName = parts[parts.length - 1]
  const firstName = parts[0] || ''
  const firstInitial = firstName[0]

  // 3. First initial + last name — require team match. When multiple (e.g. Cameron/Cayden Boozer), require full first name.
  const fiLastCandidates = allStatsKeys.filter(key => {
    const espnName = getEspnDisplayName(key, allStats)
    const n = normalizeName(espnName)
    const nameOk = n.includes(lastName) && (n.startsWith(firstInitial + ' ') || n.startsWith(firstInitial))
    return nameOk && statRowsMatchOurTeam(ourTeam, allStats[key])
  })
  if (fiLastCandidates.length === 1) return fiLastCandidates[0]
  if (fiLastCandidates.length > 1 && firstName.length >= 2) {
    const byFirstName = fiLastCandidates.filter(key => {
      const espnName = getEspnDisplayName(key, allStats)
      const espnFirst = normalizeName(espnName).split(' ')[0] || ''
      return espnFirst === firstName || espnFirst.startsWith(firstName) || firstName.startsWith(espnFirst)
    })
    if (byFirstName.length === 1) return byFirstName[0]
  }

  return null
}

/** Check if game has started (in progress or completed) */
function gameHasStarted(event) {
  const status = event.status?.type
  if (!status) return false
  return status.state === 'in' || status.completed === true || status.completed === 'true'
}

/** Get loser ESPN team ID from completed game, or null */
function getLoserTeamId(event) {
  const comps = event.competitions?.[0]?.competitors || []
  // ESPN returns winner as string "true"/"false", not boolean
  let loser = comps.find(c => c.winner === false || c.winner === 'false')
  if (!loser && comps.length === 2) {
    const scoreA = parseInt(comps[0]?.score, 10) || 0
    const scoreB = parseInt(comps[1]?.score, 10) || 0
    loser = scoreA < scoreB ? comps[0] : comps[1]
  }
  return loser ? String(loser.team?.id ?? '') : null
}

export async function syncTournamentScores(onProgress) {
  const today = todayStr()
  const datesToFetch = TOURNAMENT_DATES.filter(d => d <= today)

  if (datesToFetch.length === 0) {
    return { matched: [], unmatched: [], gamesStartedToday: false }
  }

  onProgress?.(`Fetching games for ${datesToFetch.length} date(s) through ${today} (Eastern)...`)

  await supabase.from('player_scores').delete().eq('round_name', 'Play-In')

  // Load completed events we've already synced — only fetch live + new completed for stats
  const { data: syncedData } = await supabase.from('settings').select('value').eq('key', 'synced_completed_events').maybeSingle()
  let syncedCompletedEvents = new Set(JSON.parse(syncedData?.value || '[]'))

  const { data: parserVerRow } = await supabase.from('settings').select('value').eq('key', 'espn_sync_parser_version').maybeSingle()
  const storedParserVer = parseInt(parserVerRow?.value || '0', 10)
  if (storedParserVer < ESPN_SYNC_PARSER_VERSION) {
    syncedCompletedEvents = new Set()
    await supabase.from('settings').delete().eq('key', 'synced_completed_events')
    await supabase.from('settings').upsert({
      key: 'espn_sync_parser_version',
      value: String(ESPN_SYNC_PARSER_VERSION),
      updated_at: new Date().toISOString(),
    })
    onProgress?.('Sync parser updated — re-fetching all completed games for stats (one-time).')
  }

  // Pass 1: Build loserTeamIds from ALL completed games (scoreboard has winner/loser, no fetch needed)
  const loserTeamIds = new Set()
  let championshipCompleted = false
  let gamesStartedToday = false
  const allEventsByDate = []
  for (const dateStr of datesToFetch) {
    const events = await fetchEventsForDate(dateStr)
    allEventsByDate.push({ dateStr, events, isToday: dateStr === today })
  }
  for (const { dateStr, events, isToday } of allEventsByDate) {
    for (const event of events) {
      const hasStarted = gameHasStarted(event)
      if (isToday && hasStarted) gamesStartedToday = true
      const isCompleted = event.status?.type?.completed === true || event.status?.type?.completed === 'true'
      if (!isCompleted) continue
      const noteHeadline = event.competitions?.[0]?.notes?.[0]?.headline || event.notes?.[0]?.headline
      const roundName = normalizeRoundName(noteHeadline, dateStr)
      if (!roundName || roundName === 'Play-In') continue
      const loserId = getLoserTeamId(event)
      if (loserId) loserTeamIds.add(loserId)
      if (dateStr === '20260406' && roundName === 'Championship') championshipCompleted = true
    }
  }

  // Pass 2: Fetch stats only for live games + completed games not yet synced
  const allStats = {}
  const newlyCompletedEvents = []
  for (const { dateStr, events, isToday } of allEventsByDate) {
    for (const event of events) {
      const hasStarted = gameHasStarted(event)
      if (!hasStarted) continue
      const noteHeadline = event.competitions?.[0]?.notes?.[0]?.headline || event.notes?.[0]?.headline
      const roundName = normalizeRoundName(noteHeadline, dateStr)
      if (!roundName || roundName === 'Play-In') continue
      const isCompleted = event.status?.type?.completed === true || event.status?.type?.completed === 'true'
      if (isCompleted && syncedCompletedEvents.has(String(event.id))) continue

      onProgress?.(`Fetching: ${event.shortName || event.id} (${roundName})${!isCompleted ? ' [live]' : ''}`)
      const summary = await fetchGameSummary(event.id)
      const fromBoard = parsePlayerPointsFromScoreboard(event, roundName)
      const fromSummaryLeaders = parsePlayerPointsFromSummaryLeaders(summary, roundName)
      const fromSummaryBox = parsePlayerPointsFromSummary(summary, roundName)
      // Union: board + summary.leaders + boxscore; later sources overwrite same espn id (prefer fuller box rows)
      const gamePlayers = { ...fromBoard, ...fromSummaryLeaders, ...fromSummaryBox }
      for (const [key, stats] of Object.entries(gamePlayers)) {
        if (!allStats[key]) allStats[key] = []
        const exists = allStats[key].some(s => s.roundName === stats.roundName)
        if (!exists) allStats[key].push(stats)
      }
      if (isCompleted) newlyCompletedEvents.push(String(event.id))
    }
  }
  if (newlyCompletedEvents.length) {
    const merged = new Set([...syncedCompletedEvents, ...newlyCompletedEvents])
    await supabase.from('settings').upsert({ key: 'synced_completed_events', value: JSON.stringify([...merged]), updated_at: new Date().toISOString() })
  }

  const allStatsKeys = Object.keys(allStats)
  onProgress?.(`Found stats for ${allStatsKeys.length} players. Matching to all players...`)

  const byEspnPlayerId = {}
  for (const key of allStatsKeys) {
    const id = allStats[key]?.find(s => s.espnPlayerId)?.espnPlayerId
    if (id) byEspnPlayerId[id] = key
  }

  const { data: allPlayers, error } = await supabase
    .from('players')
    .select('id, name, team, drafter_id, espn_player_id, espn_team_id')

  if (error) throw new Error('Failed to fetch players from DB: ' + error.message)

  const matched = []
  const unmatched = []
  const matchedEspnNames = new Set()

  const sortedPlayers = [...(allPlayers || [])].sort((a, b) => (a.drafter_id ? 0 : 1) - (b.drafter_id ? 0 : 1))
  for (const player of sortedPlayers) {
    let espnName = null

    if (player.espn_player_id && byEspnPlayerId[player.espn_player_id]) {
      const candidate = byEspnPlayerId[player.espn_player_id]
      if (!namesCompatible(player.name, getEspnDisplayName(candidate, allStats))) {
        // espn_player_id points to wrong person (e.g. Cameron vs Cayden Boozer) — fall back to name match
      } else {
        const stats = allStats[candidate]
        const statsTeam = stats?.find(s => s.team)?.team
        const statsTeamId = stats?.find(s => s.espnTeamId)?.espnTeamId
        const ourTeamId = getEspnId(player.team)
        if ((statsTeamId && ourTeamId && statsTeamId === ourTeamId) || teamsMatch(player.team, statsTeam)) {
          espnName = candidate
        }
      }
    }

    if (!espnName) {
      espnName = findBestNameMatch(player.name, allStatsKeys, allStats, player.team)
    }

    if (!espnName || matchedEspnNames.has(espnName)) {
      if (!espnName && player.drafter_id) unmatched.push(player.name)
      continue
    }
    matchedEspnNames.add(espnName)
    const statsToWrite = allStats[espnName]
    const espnPlayerId = statsToWrite?.find(s => s.espnPlayerId)?.espnPlayerId

    for (const { roundName, points } of statsToWrite) {
      if (roundName === 'Play-In') continue
      await supabase.from('player_scores').upsert(
        { player_id: player.id, round_name: roundName, points, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,round_name' }
      )
    }
    const updates = {}
    if (espnPlayerId && espnPlayerId !== player.espn_player_id) updates.espn_player_id = espnPlayerId
    const espnTeamId = statsToWrite?.find(s => s.espnTeamId)?.espnTeamId
    if (espnTeamId && espnTeamId !== player.espn_team_id) updates.espn_team_id = espnTeamId
    const seedFromTeam = espnTeamId ? getSeedForEspnTeamId(espnTeamId) : null
    if (seedFromTeam != null && seedFromTeam !== player.seed) updates.seed = seedFromTeam
    const canonicalTeam = espnTeamId ? getTeamFromEspnId(espnTeamId) : null
    if (canonicalTeam && canonicalTeam !== player.team) updates.team = canonicalTeam
    if (Object.keys(updates).length) {
      await supabase.from('players').update(updates).eq('id', player.id)
    }
    matched.push({ ourName: player.name, espnName: getEspnDisplayName(espnName, allStats) })
  }

  // No auto-created players — all players come from the seeded pool (CSV/bracket/API). Unmatched stats are skipped.

  // Remove duplicate players (same name+team): keep drafted
  const byKey = {}
  for (const p of allPlayers || []) {
    const key = `${p.name}|${p.team || ''}`
    if (!byKey[key]) byKey[key] = []
    byKey[key].push(p)
  }
  for (const group of Object.values(byKey)) {
    if (group.length <= 1) continue
    const keep = group.sort((a, b) => (b.drafter_id ? 1 : 0) - (a.drafter_id ? 1 : 0))[0]
    const toDelete = group.filter(p => p.id !== keep.id && !p.drafter_id).map(p => p.id)
    if (toDelete.length) {
      await supabase.from('players').delete().in('id', toDelete)
    }
  }

  // Elimination: player_id → espn_team_id → in loserTeamIds?
  const { data: playersForElimination } = await supabase
    .from('players')
    .select('id, espn_team_id, team')
  const playerIdsToEliminate = (playersForElimination || [])
    .filter(p => {
      const teamId = p.espn_team_id || getEspnId(p.team)
      return teamId && loserTeamIds.has(teamId)
    })
    .map(p => p.id)
  const eliminateSet = new Set(playerIdsToEliminate)
  const playerIdsToClear = (playersForElimination || []).filter(p => !eliminateSet.has(p.id)).map(p => p.id)
  // Batch updates to avoid URI length limits with large .in() arrays
  const BATCH = 50
  for (let i = 0; i < playerIdsToEliminate.length; i += BATCH) {
    const batch = playerIdsToEliminate.slice(i, i + BATCH)
    if (batch.length) await supabase.from('players').update({ is_eliminated: true }).in('id', batch)
  }
  for (let i = 0; i < playerIdsToClear.length; i += BATCH) {
    const batch = playerIdsToClear.slice(i, i + BATCH)
    if (batch.length) await supabase.from('players').update({ is_eliminated: false }).in('id', batch)
  }

  if (championshipCompleted) {
    await supabase.from('settings').upsert({ key: 'tournament_over', value: 'true' })
  }

  await supabase.from('settings').upsert({ key: 'last_espn_sync', value: new Date().toISOString() })

  return { matched, unmatched, gamesStartedToday }
}
