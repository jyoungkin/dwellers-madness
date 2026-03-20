import { supabase } from './supabase.js'
import { getEspnId, getTeamFromEspnId } from './espnUpcoming.js'

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

function parsePlayerPointsFromSummary(summary, roundName) {
  const results = {}

  // Structure 1: boxscore.players (legacy)
  const players = summary?.boxscore?.players
  if (players) {
    for (const teamData of players) {
      const team = getTeamFromEspnId(String(teamData.team?.id ?? '')) || teamData.team?.displayName || null
      for (const statGroup of teamData.statistics || []) {
        const names = statGroup.names || []
        const ptsIndex = names.indexOf('PTS')
        if (ptsIndex === -1) continue

        for (const athlete of statGroup.athletes || []) {
          const displayName = athlete.athlete?.displayName
          const ptsStr = athlete.stats?.[ptsIndex]
          const pts = parseInt(ptsStr, 10)
          const espnPlayerId = String(athlete.athlete?.id ?? athlete.id ?? '')
          const espnTeamId = String(teamData.team?.id ?? '')
          if (displayName && !isNaN(pts) && pts > 0) {
            results[displayName] = { points: pts, roundName, team, espnPlayerId, espnTeamId }
          }
        }
      }
    }
  }

  // Structure 2: boxscore.teams (current ESPN API) — merge if structure 1 was empty or partial
  const teams = summary?.boxscore?.teams
  if (teams) {
    for (const teamData of teams) {
      const team = getTeamFromEspnId(String(teamData.team?.id ?? '')) || teamData.team?.displayName || null
      for (const statGroup of teamData.statistics || []) {
        const names = statGroup.names || []
        const ptsIndex = names.indexOf('PTS')
        if (ptsIndex === -1) continue

        for (const athlete of statGroup.athletes || []) {
          const displayName = athlete.athlete?.displayName
          const ptsStr = athlete.stats?.[ptsIndex]
          const pts = parseInt(ptsStr, 10)
          const espnPlayerId = String(athlete.athlete?.id ?? athlete.id ?? '')
          const espnTeamId = String(teamData.team?.id ?? '')
          if (displayName && !isNaN(pts) && pts > 0) {
            results[displayName] = { points: pts, roundName, team, espnPlayerId, espnTeamId }
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
    const leaders = comp.leaders || []
    const ptsLeader = leaders.find(l => l.name === 'points')
    if (!ptsLeader?.leaders) continue

    const espnId = String(comp.team?.id ?? '')
    const team = getTeamFromEspnId(espnId) || comp.team?.displayName || comp.team?.shortDisplayName || null

    for (const l of ptsLeader.leaders) {
      const displayName = l.athlete?.displayName
      const pts = parseInt(l.displayValue, 10)
      if (displayName && !isNaN(pts) && pts > 0) {
        const athleteTeamId = String(l.athlete?.team?.id ?? '')
        const playerTeam = athleteTeamId ? (getTeamFromEspnId(athleteTeamId) || comp.team?.displayName) : team
        const espnPlayerId = String(l.athlete?.id ?? '')
        const espnTeamId = athleteTeamId || espnId
        results[displayName] = { points: pts, roundName, team: playerTeam || team, espnPlayerId, espnTeamId }
      }
    }
  }

  return results
}

function teamsMatch(ourTeam, statsTeam) {
  if (!ourTeam || !statsTeam) return false
  const ourLower = ourTeam.toLowerCase()
  const statsLower = statsTeam.toLowerCase()
  return statsLower === ourLower || statsLower.includes(ourLower) || ourLower.includes(statsLower)
}

function findBestNameMatch(ourName, espnNames, allStats, ourTeam) {
  if (!ourTeam) return null
  const normalized = normalizeName(ourName)

  // 1. Exact match (require team match)
  for (const en of espnNames) {
    if (normalizeName(en) === normalized && teamsMatch(ourTeam, allStats[en]?.find(s => s.team)?.team)) return en
  }

  // 2. One name contains the other (handles "Darius Acuff" vs "Darius Acuff Jr") — require team match
  for (const en of espnNames) {
    const n = normalizeName(en)
    if ((n === normalized || n.startsWith(normalized + ' ') || normalized.startsWith(n + ' ')) &&
        teamsMatch(ourTeam, allStats[en]?.find(s => s.team)?.team)) return en
  }

  const parts = normalized.split(' ').filter(Boolean)
  const lastName = parts[parts.length - 1]
  const firstInitial = parts[0]?.[0]

  // 3. First initial + last name (e.g. "D Acuff" matches "Darius Acuff") — require team match, never last-name-only
  const fiLastCandidates = espnNames.filter(en => {
    const n = normalizeName(en)
    const nameOk = n.includes(lastName) && (n.startsWith(firstInitial + ' ') || n.startsWith(firstInitial))
    return nameOk && teamsMatch(ourTeam, allStats[en]?.find(s => s.team)?.team)
  })
  if (fiLastCandidates.length === 1) return fiLastCandidates[0]

  return null
}

/** Check if game has started (in progress or completed) */
function gameHasStarted(event) {
  const status = event.status?.type
  if (!status) return false
  return status.state === 'in' || status.completed === true
}

/** Get loser ESPN team ID from completed game, or null */
function getLoserTeamId(event) {
  const comps = event.competitions?.[0]?.competitors || []
  const loser = comps.find(c => c.winner === false)
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

  // Collect all player stats (from completed AND in-progress games)
  // Map: espnPlayerName -> { roundName, points }[]
  const allStats = {}
  const loserTeamIds = new Set()
  let championshipCompleted = false
  let gamesStartedToday = false

  for (const dateStr of datesToFetch) {
    const events = await fetchEventsForDate(dateStr)
    const isToday = dateStr === today

    for (const event of events) {
      const hasStarted = gameHasStarted(event)
      if (isToday && hasStarted) gamesStartedToday = true

      if (!hasStarted) continue

      const noteHeadline = event.competitions?.[0]?.notes?.[0]?.headline || event.notes?.[0]?.headline
      const roundName = normalizeRoundName(noteHeadline, dateStr)
      if (!roundName) continue
      if (roundName === 'Play-In') continue

      const isCompleted = event.status?.type?.completed === true

      onProgress?.(`Fetching: ${event.shortName || event.id} (${roundName})${!isCompleted ? ' [live]' : ''}`)
      const summary = await fetchGameSummary(event.id)
      let gamePlayers = summary ? parsePlayerPointsFromSummary(summary, roundName) : {}
      if (Object.keys(gamePlayers).length === 0) {
        gamePlayers = parsePlayerPointsFromScoreboard(event, roundName)
      }

      for (const [name, stats] of Object.entries(gamePlayers)) {
        if (!allStats[name]) allStats[name] = []
        const exists = allStats[name].some(s => s.roundName === stats.roundName)
        if (!exists) allStats[name].push(stats)
      }

      if (isCompleted) {
        const loserId = getLoserTeamId(event)
        if (loserId) loserTeamIds.add(loserId)

        if (dateStr === '20260406' && roundName === 'Championship') {
          championshipCompleted = true
        }
      }
    }
  }

  const espnNames = Object.keys(allStats)
  onProgress?.(`Found stats for ${espnNames.length} players. Matching to all players...`)

  const byEspnPlayerId = {}
  for (const en of espnNames) {
    const id = allStats[en]?.find(s => s.espnPlayerId)?.espnPlayerId
    if (id) byEspnPlayerId[id] = en
  }

  const { data: allPlayers, error } = await supabase
    .from('players')
    .select('id, name, team, drafter_id, espn_player_id')

  if (error) throw new Error('Failed to fetch players from DB: ' + error.message)

  const matched = []
  const unmatched = []
  const matchedEspnNames = new Set()

  const sortedPlayers = [...(allPlayers || [])].sort((a, b) => (a.drafter_id ? 0 : 1) - (b.drafter_id ? 0 : 1))
  for (const player of sortedPlayers) {
    let espnName = null

    if (player.espn_player_id && byEspnPlayerId[player.espn_player_id]) {
      const candidate = byEspnPlayerId[player.espn_player_id]
      const stats = allStats[candidate]
      const statsTeam = stats?.find(s => s.team)?.team
      const statsTeamId = stats?.find(s => s.espnTeamId)?.espnTeamId
      const ourTeamId = getEspnId(player.team)
      if ((statsTeamId && ourTeamId && statsTeamId === ourTeamId) || teamsMatch(player.team, statsTeam)) {
        espnName = candidate
      }
    }

    if (!espnName) {
      espnName = findBestNameMatch(player.name, espnNames, allStats, player.team)
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
    if (espnPlayerId && !player.espn_player_id) {
      await supabase.from('players').update({ espn_player_id: espnPlayerId }).eq('id', player.id)
    }
    matched.push({ ourName: player.name, espnName })
  }

  // Auto-create players for Tournament Leaders: ESPN has stats for someone not in DB
  for (const espnName of espnNames) {
    if (matchedEspnNames.has(espnName)) continue

    const statsToWrite = allStats[espnName]
    const team = statsToWrite?.find(s => s.team)?.team
    if (!team) continue

    const { data: existingByName } = await supabase
      .from('players')
      .select('id, drafter_id, team')
      .eq('name', espnName)

    if (existingByName?.length >= 1) {
      const byTeam = existingByName.filter(p => teamsMatch(p.team, team))
      const preferred = (byTeam.length ? byTeam : existingByName).sort((a, b) => (b.drafter_id ? 1 : 0) - (a.drafter_id ? 1 : 0))[0]
      for (const { roundName, points } of statsToWrite) {
        if (roundName === 'Play-In') continue
        await supabase.from('player_scores').upsert(
          { player_id: preferred.id, round_name: roundName, points, updated_at: new Date().toISOString() },
          { onConflict: 'player_id,round_name' }
        )
      }
      matchedEspnNames.add(espnName)
      matched.push({ ourName: espnName, espnName })
      continue
    }

    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('name', espnName)
      .eq('team', team)
      .maybeSingle()

    let playerId
    if (existing) {
      playerId = existing.id
    } else {
      const espnPlayerId = statsToWrite?.find(s => s.espnPlayerId)?.espnPlayerId || null
      const { data: newPlayer, error: insertErr } = await supabase
        .from('players')
        .insert({ name: espnName, team, seed: null, drafter_id: null, espn_player_id: espnPlayerId })
        .select('id')
        .single()
      if (insertErr) continue
      playerId = newPlayer.id
    }

    for (const { roundName, points } of statsToWrite) {
      if (roundName === 'Play-In') continue
      await supabase.from('player_scores').upsert(
        { player_id: playerId, round_name: roundName, points, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,round_name' }
      )
    }
    matchedEspnNames.add(espnName)
    matched.push({ ourName: espnName, espnName, created: !existing })
  }

  // Remove duplicate players (same name+team): keep drafted, delete auto-created extras
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

  // Remove auto-created players with no/zero scores (wrong ESPN data, e.g. players who haven't played)
  const SCORING_ROUNDS = new Set(['Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship'])
  const { data: allScores } = await supabase.from('player_scores').select('player_id, points, round_name')
  const totalByPlayer = {}
  for (const r of allScores || []) {
    if (!SCORING_ROUNDS.has(r.round_name)) continue
    totalByPlayer[r.player_id] = (totalByPlayer[r.player_id] || 0) + (r.points || 0)
  }
  const { data: orphanPlayers } = await supabase.from('players').select('id').is('drafter_id', null)
  const toRemove = (orphanPlayers || []).filter(p => (totalByPlayer[p.id] || 0) === 0).map(p => p.id)
  if (toRemove.length) {
    await supabase.from('players').delete().in('id', toRemove)
  }

  // Mark eliminated: players whose team lost a game
  const playerIdsToEliminate = (allPlayers || [])
    .filter(p => p.team && loserTeamIds.has(getEspnId(p.team)))
    .map(p => p.id)
  if (playerIdsToEliminate.length) {
    await supabase.from('players').update({ is_eliminated: true }).in('id', playerIdsToEliminate)
  }

  if (championshipCompleted) {
    await supabase.from('settings').upsert({ key: 'tournament_over', value: 'true' })
  }

  await supabase.from('settings').upsert({ key: 'last_espn_sync', value: new Date().toISOString() })

  return { matched, unmatched, gamesStartedToday }
}
