import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const NUM_DRAFTERS = 8
const PLAYERS_PER_TEAM = 5
const TOTAL_PICKS = NUM_DRAFTERS * PLAYERS_PER_TEAM

// Compute which draft_position is on the clock for a given pick number (1-indexed)
function getDraftPosition(pickNumber) {
  const idx = pickNumber - 1 // 0-indexed
  const round = Math.floor(idx / NUM_DRAFTERS)
  const posInRound = idx % NUM_DRAFTERS
  return round % 2 === 0 ? posInRound + 1 : NUM_DRAFTERS - posInRound
}

export default function DraftMode() {
  const [drafters, setDrafters] = useState([])
  const [allPlayers, setAllPlayers] = useState([])
  const [picks, setPicks] = useState([]) // { pick_number, drafter_id, player_id }
  const [currentPick, setCurrentPick] = useState(1)
  const [draftStatus, setDraftStatus] = useState('not_started') // not_started | in_progress | completed
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

  const filteredPlayers = undraftedPlayers.filter(p => {
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
  })

  const onClockDrafter = drafters.find(d => d.draft_position === getDraftPosition(currentPick))

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
    const prevPick = last.pick_number
    await supabase.from('settings').upsert([
      { key: 'draft_current_pick', value: String(prevPick) },
      { key: 'draft_status', value: 'in_progress' },
    ])

    setSaving(false)
    await reload()
  }

  if (loading) return <div className="text-center py-16 text-slate-500">Loading draft...</div>

  // Build per-drafter pick board
  const picksById = {}
  for (const pick of picks) {
    if (!picksById[pick.drafter_id]) picksById[pick.drafter_id] = []
    picksById[pick.drafter_id].push(pick)
  }

  const playerById = Object.fromEntries(allPlayers.map(p => [p.id, p]))

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a5f]">Draft Mode</h2>
          <p className="text-sm text-slate-500">Snake draft — {NUM_DRAFTERS} teams × {PLAYERS_PER_TEAM} picks = {TOTAL_PICKS} total picks</p>
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

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {draftStatus === 'not_started' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <p className="font-semibold">Draft hasn't started yet.</p>
          <p className="text-sm mt-1">Make sure your 8 drafters are set up in the Admin panel, then click Start Draft.</p>
        </div>
      )}

      {draftStatus === 'completed' && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-6 text-center mb-6">
          <div className="text-4xl mb-2">🎉</div>
          <p className="font-bold text-lg">Draft Complete!</p>
          <p className="text-sm mt-1">All {TOTAL_PICKS} picks have been made. Good luck everyone!</p>
        </div>
      )}

      {draftStatus === 'in_progress' && onClockDrafter && (
        <div className="bg-orange-50 border-2 border-orange-400 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-0.5">
              Pick {currentPick} of {TOTAL_PICKS} — Round {Math.ceil(currentPick / NUM_DRAFTERS)}
            </div>
            <div className="text-2xl font-bold text-slate-800">🏀 {onClockDrafter.name} is on the clock</div>
          </div>
          {/* Search + pick */}
          <div className="flex-1 max-w-sm">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player name or team..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
            {search && (
              <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-lg max-h-64 overflow-y-auto">
                {filteredPlayers.length === 0 ? (
                  <div className="px-3 py-2 text-slate-400 text-sm">No matches</div>
                ) : (
                  filteredPlayers.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      onClick={() => makePick(p)}
                      disabled={saving}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0 flex justify-between items-center group"
                    >
                      <div>
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          {p.seed ? `#${p.seed} ` : ''}{p.team}
                        </span>
                      </div>
                      {p.season_ppg && (
                        <span className="text-xs text-orange-500 font-bold">{p.season_ppg} ppg</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draft board — all drafters with their picks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {drafters.map(drafter => {
          const dPicks = picksById[drafter.id] || []
          const isOnClock = draftStatus === 'in_progress' && onClockDrafter?.id === drafter.id
          return (
            <div
              key={drafter.id}
              className={`rounded-xl border p-3 ${isOnClock ? 'border-orange-400 ring-2 ring-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}
            >
              <div className={`text-xs font-bold uppercase tracking-wide mb-2 truncate ${isOnClock ? 'text-orange-600' : 'text-slate-500'}`}>
                {isOnClock && '🏀 '}{drafter.name}
              </div>
              {Array.from({ length: PLAYERS_PER_TEAM }).map((_, slotIdx) => {
                const pick = dPicks[slotIdx]
                const player = pick ? playerById[pick.player_id] : null
                return (
                  <div
                    key={slotIdx}
                    className={`text-xs rounded px-2 py-1 mb-1 border ${
                      player
                        ? 'bg-blue-50 border-blue-200 text-blue-800 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-300 italic'
                    }`}
                  >
                    {player ? player.name.split(',')[0] : `Pick ${slotIdx + 1}`}
                  </div>
                )
              })}
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
                  <th key={i} className="px-2 py-2 text-center font-semibold text-slate-600">Pick {i + 1}</th>
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
                        className={`px-2 py-1.5 text-center ${
                          isCurrent ? 'bg-orange-100 text-orange-700 font-bold' :
                          isMade ? 'text-slate-400 line-through' :
                          'text-slate-600'
                        }`}
                      >
                        {drafter?.name.split(' ')[0] || '?'}
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
