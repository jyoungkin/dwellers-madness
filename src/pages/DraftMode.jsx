import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { getTeamStyle } from '../lib/teamColors.js'

const NUM_DRAFTERS = 3
const PLAYERS_PER_TEAM = 8
const TOTAL_PICKS = NUM_DRAFTERS * PLAYERS_PER_TEAM

// Draft rules
const MAX_FROM_SAME_TEAM = 3    // no more than 3 players from the same team
const MIN_HIGHER_SEEDS = 4      // must draft at least 4 players seeded 5 or higher
const MIN_UNDERDOGS = 2         // at least 2 of those must be underdogs (seed 9+)
const HIGHER_SEED_THRESHOLD = 5 // "seed 5 or above"
const UNDERDOG_THRESHOLD = 9    // "underdog" = seed 9 or higher

// Snake draft: returns which draft_position is on the clock for a given pick number (1-indexed)
function getDraftPosition(pickNumber) {
  const idx = pickNumber - 1
  const round = Math.floor(idx / NUM_DRAFTERS)
  const posInRound = idx % NUM_DRAFTERS
  return round % 2 === 0 ? posInRound + 1 : NUM_DRAFTERS - posInRound
}

function getTeamCounts(picks, playerById) {
  const counts = {}
  for (const pick of picks) {
    const p = playerById[pick.player_id]
    if (p) counts[p.team] = (counts[p.team] || 0) + 1
  }
  return counts
}

function countHigherSeeds(picks, playerById) {
  return picks.filter(pick => {
    const p = playerById[pick.player_id]
    return p && p.seed >= HIGHER_SEED_THRESHOLD
  }).length
}

function countUnderdogs(picks, playerById) {
  return picks.filter(pick => {
    const p = playerById[pick.player_id]
    return p && p.seed >= UNDERDOG_THRESHOLD
  }).length
}

// Compute all rule constraints for a given drafter given their current picks
function getDraftConstraints(drafter, picksById, playerById) {
  const dPicks = picksById[drafter.id] || []
  const picksRemaining = PLAYERS_PER_TEAM - dPicks.length // includes the current pick
  const teamCounts = getTeamCounts(dPicks, playerById)
  const higherSeedCount = countHigherSeeds(dPicks, playerById)
  const underdogCount = countUnderdogs(dPicks, playerById)
  const higherSeedsNeeded = Math.max(0, MIN_HIGHER_SEEDS - higherSeedCount)
  const underdogsNeeded = Math.max(0, MIN_UNDERDOGS - underdogCount)

  // "must pick X now" = the remaining picks (including this one) can no longer satisfy the rule
  // unless every remaining pick fulfills it
  const mustPickUnderdog = picksRemaining > 0 && underdogsNeeded >= picksRemaining
  const mustPickHigherSeed = picksRemaining > 0 && higherSeedsNeeded >= picksRemaining

  return {
    teamCounts,
    higherSeedCount,
    underdogCount,
    higherSeedsNeeded,
    underdogsNeeded,
    mustPickHigherSeed,
    mustPickUnderdog,
    picksRemaining,
  }
}

export default function DraftMode() {
  const [drafters, setDrafters] = useState([])
  const [allPlayers, setAllPlayers] = useState([])
  const [picks, setPicks] = useState([])
  const [currentPick, setCurrentPick] = useState(1)
  const [draftStatus, setDraftStatus] = useState('not_started')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const searchRef = useRef(null)

  async function reload() {
    setLoading(true)
    const [
      { data: draftersData },
      { data: playersData },
      { data: picksData },
      { data: settingsData },
    ] = await Promise.all([
      supabase.from('drafters').select('*').order('draft_position'),
      supabase.from('players').select('*').order('name'),
      supabase.from('draft_picks').select('*').order('pick_number'),
      supabase.from('settings').select('*'),
    ])

    setDrafters(draftersData || [])
    setAllPlayers(playersData || [])
    setPicks(picksData || [])

    const s = Object.fromEntries((settingsData || []).map(r => [r.key, r.value]))
    setCurrentPick(parseInt(s.draft_current_pick || '1'))
    setDraftStatus(s.draft_status || 'not_started')
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const draftedPlayerIds = new Set(picks.map(p => p.player_id))
  const undraftedPlayers = allPlayers.filter(p => !draftedPlayerIds.has(p.id))
  const playerById = Object.fromEntries(allPlayers.map(p => [p.id, p]))

  const onClockDrafter = drafters.find(d => d.draft_position === getDraftPosition(currentPick))

  // Build per-drafter pick map
  const picksById = {}
  for (const pick of picks) {
    if (!picksById[pick.drafter_id]) picksById[pick.drafter_id] = []
    picksById[pick.drafter_id].push(pick)
  }

  const onClockConstraints = (onClockDrafter && draftStatus === 'in_progress')
    ? getDraftConstraints(onClockDrafter, picksById, playerById)
    : null

  // Filter available players: hide teams at cap and enforce must-pick rules
  const filteredPlayers = undraftedPlayers.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
    if (!matchesSearch) return false
    if (!onClockConstraints) return true

    const teamCount = onClockConstraints.teamCounts[p.team] || 0
    if (teamCount >= MAX_FROM_SAME_TEAM) return false
    if (onClockConstraints.mustPickUnderdog && p.seed < UNDERDOG_THRESHOLD) return false
    if (onClockConstraints.mustPickHigherSeed && p.seed < HIGHER_SEED_THRESHOLD) return false

    return true
  })

  async function startDraft() {
    if (drafters.length < NUM_DRAFTERS) {
      setError(`Need ${NUM_DRAFTERS} drafters set up in Admin first.`)
      return
    }
    await supabase.from('settings').upsert({ key: 'draft_status', value: 'in_progress' })
    setDraftStatus('in_progress')
  }

  async function makePick(player) {
    if (!onClockDrafter || saving) return
    setSaving(true)
    setError(null)

    const constraints = getDraftConstraints(onClockDrafter, picksById, playerById)

    // Enforce team cap
    const teamCount = constraints.teamCounts[player.team] || 0
    if (teamCount >= MAX_FROM_SAME_TEAM) {
      setError(`${onClockDrafter.name} already has ${MAX_FROM_SAME_TEAM} players from ${player.team}. Max is ${MAX_FROM_SAME_TEAM} per team.`)
      setSaving(false)
      return
    }

    // Enforce underdog rule (most restrictive — seed 9+)
    if (constraints.mustPickUnderdog && player.seed < UNDERDOG_THRESHOLD) {
      setError(
        `${onClockDrafter.name} must pick an underdog (seed ${UNDERDOG_THRESHOLD}+) — ` +
        `needs ${constraints.underdogsNeeded} more underdog(s) with only ${constraints.picksRemaining} pick(s) left.`
      )
      setSaving(false)
      return
    }

    // Enforce higher-seed rule (seed 5+)
    if (constraints.mustPickHigherSeed && player.seed < HIGHER_SEED_THRESHOLD) {
      setError(
        `${onClockDrafter.name} must pick a player seeded ${HIGHER_SEED_THRESHOLD} or higher — ` +
        `needs ${constraints.higherSeedsNeeded} more seed ${HIGHER_SEED_THRESHOLD}+ player(s) with only ${constraints.picksRemaining} pick(s) left.`
      )
      setSaving(false)
      return
    }

    const { error: pickErr } = await supabase.from('draft_picks').insert({
      pick_number: currentPick,
      drafter_id: onClockDrafter.id,
      player_id: player.id,
    })
    if (pickErr) { setError(pickErr.message); setSaving(false); return }

    await supabase.from('players').update({ drafter_id: onClockDrafter.id }).eq('id', player.id)

    const nextPick = currentPick + 1
    const newStatus = nextPick > TOTAL_PICKS ? 'completed' : 'in_progress'
    await supabase.from('settings').upsert([
      { key: 'draft_current_pick', value: String(nextPick) },
      { key: 'draft_status', value: newStatus },
    ])

    setSearch('')
    setSaving(false)
    await reload()
    searchRef.current?.focus()
  }

  async function undoLastPick() {
    if (picks.length === 0 || saving) return
    setSaving(true)
    const last = picks[picks.length - 1]

    await supabase.from('draft_picks').delete().eq('pick_number', last.pick_number)
    await supabase.from('players').update({ drafter_id: null }).eq('id', last.player_id)
    await supabase.from('settings').upsert([
      { key: 'draft_current_pick', value: String(last.pick_number) },
      { key: 'draft_status', value: 'in_progress' },
    ])

    setSaving(false)
    await reload()
  }

  // Determine the active constraint label for the search box
  const searchPlaceholder = onClockConstraints?.mustPickUnderdog
    ? `Only underdogs (seed ${UNDERDOG_THRESHOLD}+) shown...`
    : onClockConstraints?.mustPickHigherSeed
      ? `Only seed ${HIGHER_SEED_THRESHOLD}+ shown...`
      : 'Search player name or team...'

  const bannerIsRed = onClockConstraints?.mustPickUnderdog
  const bannerIsOrange = !bannerIsRed && onClockConstraints?.mustPickHigherSeed

  if (loading) return <div className="text-center py-16 text-slate-500">Loading draft...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a5f]">Draft Mode</h2>
          <p className="text-sm text-slate-500">
            Snake draft — {NUM_DRAFTERS} teams × {PLAYERS_PER_TEAM} picks = {TOTAL_PICKS} total picks
          </p>
          <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-slate-500">
            <span>📋 Max {MAX_FROM_SAME_TEAM} from any one team</span>
            <span>🔶 At least {MIN_HIGHER_SEEDS} players seeded {HIGHER_SEED_THRESHOLD}+</span>
            <span>🟣 At least {MIN_UNDERDOGS} underdogs (seed {UNDERDOG_THRESHOLD}+)</span>
          </div>
        </div>
        <div className="flex gap-2">
          {picks.length > 0 && (
            <button
              onClick={undoLastPick}
              disabled={saving}
              className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              ↩ Undo Last Pick
            </button>
          )}
          {draftStatus === 'not_started' && (
            <button
              onClick={startDraft}
              className="px-4 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
            >
              Start Draft
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {draftStatus === 'not_started' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <p className="font-semibold">Draft hasn't started yet.</p>
          <p className="text-sm mt-1">
            Make sure all {NUM_DRAFTERS} drafters are set up in the Admin panel, then click Start Draft.
          </p>
        </div>
      )}

      {draftStatus === 'completed' && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-6 text-center mb-6">
          <div className="text-4xl mb-2">🎉</div>
          <p className="font-bold text-lg">Draft Complete!</p>
          <p className="text-sm mt-1">All {TOTAL_PICKS} picks have been made. Good luck everyone!</p>
        </div>
      )}

      {/* On-clock banner */}
      {draftStatus === 'in_progress' && onClockDrafter && onClockConstraints && (
        <div className={`border-2 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-start gap-4 ${
          bannerIsRed ? 'bg-red-50 border-red-400' :
          bannerIsOrange ? 'bg-amber-50 border-amber-400' :
          'bg-orange-50 border-orange-400'
        }`}>
          <div className="flex-1">
            <div className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${
              bannerIsRed ? 'text-red-600' : bannerIsOrange ? 'text-amber-700' : 'text-orange-600'
            }`}>
              Pick {currentPick} of {TOTAL_PICKS} — Round {Math.ceil(currentPick / NUM_DRAFTERS)}
            </div>
            <div className="text-2xl font-bold text-slate-800">🏀 {onClockDrafter.name} is on the clock</div>

            {/* Rule status */}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className={`font-medium ${onClockConstraints.higherSeedCount >= MIN_HIGHER_SEEDS ? 'text-green-600' : 'text-slate-500'}`}>
                {onClockConstraints.higherSeedCount >= MIN_HIGHER_SEEDS ? '✓' : `${onClockConstraints.higherSeedCount}/${MIN_HIGHER_SEEDS}`} seed {HIGHER_SEED_THRESHOLD}+
              </span>
              <span className={`font-medium ${onClockConstraints.underdogCount >= MIN_UNDERDOGS ? 'text-green-600' : 'text-slate-500'}`}>
                {onClockConstraints.underdogCount >= MIN_UNDERDOGS ? '✓' : `${onClockConstraints.underdogCount}/${MIN_UNDERDOGS}`} underdogs
              </span>
              <span className="text-slate-400">{onClockConstraints.picksRemaining} pick(s) left</span>
            </div>

            {/* Hard constraint warnings */}
            {onClockConstraints.mustPickUnderdog && (
              <div className="mt-2 text-sm font-semibold text-red-600">
                🚨 Must pick an underdog (seed {UNDERDOG_THRESHOLD}+) — {onClockConstraints.underdogsNeeded} needed, {onClockConstraints.picksRemaining} pick(s) left
              </div>
            )}
            {!onClockConstraints.mustPickUnderdog && onClockConstraints.mustPickHigherSeed && (
              <div className="mt-2 text-sm font-semibold text-amber-700">
                ⚠️ Must pick seed {HIGHER_SEED_THRESHOLD}+ — {onClockConstraints.higherSeedsNeeded} needed, {onClockConstraints.picksRemaining} pick(s) left
              </div>
            )}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                bannerIsRed ? 'border-red-300 focus:ring-red-400' :
                bannerIsOrange ? 'border-amber-300 focus:ring-amber-400' :
                'border-slate-300 focus:ring-orange-400'
              }`}
              autoFocus
            />
            {(search || onClockConstraints.mustPickUnderdog || onClockConstraints.mustPickHigherSeed) && (
              <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-lg max-h-64 overflow-y-auto">
                {filteredPlayers.length === 0 ? (
                  <div className="px-3 py-2 text-slate-400 text-sm">No matches</div>
                ) : (
                  filteredPlayers.slice(0, 20).map(p => {
                    const isUnderdog = p.seed >= UNDERDOG_THRESHOLD
                    const isHigherSeed = !isUnderdog && p.seed >= HIGHER_SEED_THRESHOLD
                    const teamCount = onClockConstraints.teamCounts[p.team] || 0
                    const teamStyle = getTeamStyle(p.team)
                    return (
                      <button
                        key={p.id}
                        onClick={() => makePick(p)}
                        disabled={saving}
                        className="w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 flex justify-between items-center transition-opacity hover:opacity-80"
                        style={teamStyle}
                      >
                        <div>
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="text-xs text-slate-500 ml-2">
                            {p.seed ? `#${p.seed} ` : ''}{p.team}
                          </span>
                          {isUnderdog && (
                            <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 rounded font-semibold">
                              Underdog
                            </span>
                          )}
                          {isHigherSeed && (
                            <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1 rounded font-semibold">
                              Seed {p.seed}
                            </span>
                          )}
                          {teamCount === MAX_FROM_SAME_TEAM - 1 && (
                            <span className="ml-1 text-xs bg-red-50 text-red-500 px-1 rounded">
                              {teamCount}/{MAX_FROM_SAME_TEAM} from {p.team}
                            </span>
                          )}
                        </div>
                        {p.season_ppg && (
                          <span className="text-xs font-bold shrink-0 ml-2 text-slate-600">{p.season_ppg} ppg</span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draft board — 3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {drafters.map(drafter => {
          const dPicks = picksById[drafter.id] || []
          const isOnClock = draftStatus === 'in_progress' && onClockDrafter?.id === drafter.id
          const cardConstraints = getDraftConstraints(drafter, picksById, playerById)
          const rulesComplete = dPicks.length === PLAYERS_PER_TEAM
          const higherSeedOk = cardConstraints.higherSeedCount >= MIN_HIGHER_SEEDS
          const underdogOk = cardConstraints.underdogCount >= MIN_UNDERDOGS

          return (
            <div
              key={drafter.id}
              className={`rounded-xl border p-3 ${
                isOnClock
                  ? 'border-orange-400 ring-2 ring-orange-200 bg-orange-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {/* Card header */}
              <div className={`text-sm font-bold uppercase tracking-wide mb-2 truncate ${
                isOnClock ? 'text-orange-600' : 'text-slate-600'
              }`}>
                {isOnClock && '🏀 '}{drafter.name}
              </div>

              {/* Rule badges */}
              <div className="flex flex-wrap gap-1 mb-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  higherSeedOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {cardConstraints.higherSeedCount}/{MIN_HIGHER_SEEDS} seed {HIGHER_SEED_THRESHOLD}+
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  underdogOk ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {cardConstraints.underdogCount}/{MIN_UNDERDOGS} underdogs
                </span>
              </div>

              {/* Team cap warnings */}
              {Object.entries(cardConstraints.teamCounts)
                .filter(([, count]) => count >= MAX_FROM_SAME_TEAM)
                .map(([team]) => (
                  <div key={team} className="text-xs text-red-500 mb-1">⛔ {team} at cap ({MAX_FROM_SAME_TEAM})</div>
                ))}

              {/* Pick slots */}
              {Array.from({ length: PLAYERS_PER_TEAM }).map((_, slotIdx) => {
                const pick = dPicks[slotIdx]
                const player = pick ? playerById[pick.player_id] : null
                const isUnderdog = player && player.seed >= UNDERDOG_THRESHOLD
                const isHigherSeed = player && !isUnderdog && player.seed >= HIGHER_SEED_THRESHOLD
                const teamStyle = player ? getTeamStyle(player.team) : undefined
                return (
                  <div
                    key={slotIdx}
                    className={`text-xs rounded px-2 py-1 mb-1 ${player ? 'font-medium text-slate-800' : 'border border-slate-200 bg-slate-50 text-slate-300 italic'}`}
                    style={teamStyle}
                  >
                    {player ? (
                      <span className="flex justify-between items-center gap-1">
                        <span className="truncate">{player.name.split(',')[0]}</span>
                        <span className="shrink-0 flex items-center gap-1">
                          {isUnderdog && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded font-semibold">UD</span>
                          )}
                          {isHigherSeed && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded font-semibold">S{player.seed}</span>
                          )}
                          {player.seed && (
                            <span className="opacity-50">#{player.seed}</span>
                          )}
                        </span>
                      </span>
                    ) : (
                      `Pick ${slotIdx + 1}`
                    )}
                  </div>
                )
              })}

              {rulesComplete && (
                <div className={`mt-2 text-xs text-center font-semibold rounded py-0.5 ${
                  higherSeedOk && underdogOk
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {higherSeedOk && underdogOk ? '✓ Rules satisfied' : '✗ Rules violated!'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Snake order preview */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Pick Order</h3>
        <div className="overflow-x-auto">
          <table className="text-xs bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Round</th>
                {Array.from({ length: NUM_DRAFTERS }, (_, i) => (
                  <th key={i} className="px-4 py-2 text-center font-semibold text-slate-600">Pick {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PLAYERS_PER_TEAM }, (_, round) => (
                <tr key={round} className={round % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-3 py-1.5 font-semibold text-slate-500">Rd {round + 1}</td>
                  {Array.from({ length: NUM_DRAFTERS }, (_, pos) => {
                    const pickNum = round * NUM_DRAFTERS + pos + 1
                    const dPos = getDraftPosition(pickNum)
                    const drafter = drafters.find(d => d.draft_position === dPos)
                    const isMade = pickNum < currentPick
                    const isCurrent = pickNum === currentPick
                    return (
                      <td
                        key={pos}
                        className={`px-4 py-1.5 text-center ${
                          isCurrent ? 'bg-orange-100 text-orange-700 font-bold' :
                          isMade ? 'text-slate-400 line-through' :
                          'text-slate-600'
                        }`}
                      >
                        {drafter?.name || '?'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
