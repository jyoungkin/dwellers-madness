import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { fetchUpcomingOpponents, getOpponentForTeam } from '../lib/espnUpcoming.js'

/** Rounds that count toward scoring. Play-In excluded (teams stay in dataset). */
const ROUNDS = ['Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship']
const SCORING_ROUNDS = new Set(ROUNDS)

const ROUND_SHORT = {
  'Round of 64': 'R64',
  'Round of 32': 'R32',
  'Sweet Sixteen': 'S16',
  'Elite Eight': 'E8',
  'Final Four': 'F4',
  'Championship': 'NAT',
}

const SEED_FILTERS = [
  { id: 'all', label: 'All seeds' },
  { id: '5+', label: 'Seed 5+' },
  { id: 'dd', label: 'Double-digit (10+)' },
]

const DRAFT_FILTERS = [
  { id: 'all', label: 'All players' },
  { id: 'drafted', label: 'Drafted only' },
]

const PAGE_SIZE = 20

function getPoints(player, round) {
  return (player.player_scores || []).find(s => s.round_name === round)?.points ?? 0
}

function getTotal(player) {
  return (player.player_scores || []).reduce((sum, s) => {
    if (!SCORING_ROUNDS.has(s.round_name)) return sum
    return sum + (s.points || 0)
  }, 0)
}

function passesSeedFilter(player, filterId) {
  const seed = player.seed ?? 0
  if (filterId === 'all') return true
  if (filterId === '5+') return seed >= 5
  if (filterId === 'dd') return seed >= 10
  return true
}

export default function TournamentLeaders() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedRound, setSelectedRound] = useState('total')
  const [seedFilter, setSeedFilter] = useState('all')
  const [draftFilter, setDraftFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [upcomingOpponents, setUpcomingOpponents] = useState({})

  useEffect(() => {
    const load = () => fetchUpcomingOpponents().then(setUpcomingOpponents).catch(() => {})
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [refreshTrigger])

  useEffect(() => {
    const handler = () => setRefreshTrigger(t => t + 1)
    window.addEventListener('espn-sync-complete', handler)
    return () => window.removeEventListener('espn-sync-complete', handler)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('players')
        .select(`
          id, name, team, seed, is_eliminated, drafter_id,
          drafter:drafter_id(name),
          player_scores(round_name, points)
        `)

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setPlayers(data || [])
      setLoading(false)
    }
    load()
  }, [refreshTrigger])

  // Reset page when filters change (must run before any conditional return)
  useEffect(() => { setPage(0) }, [selectedRound, seedFilter, draftFilter])

  if (loading) return <div className="text-center py-16 text-slate-500">Loading leaders...</div>
  if (error) return <div className="text-center py-16 text-red-500">Error: {error}</div>

  const roundOptions = [
    { id: 'total', label: 'Total' },
    ...ROUNDS.map(r => ({ id: r, label: ROUND_SHORT[r] })),
  ]

  function getLeaders(roundId) {
    let list = players.filter(p => !p.is_eliminated)
    if (draftFilter === 'drafted') list = list.filter(p => !!p.drafter_id)
    list = list.filter(p => passesSeedFilter(p, seedFilter))
    if (roundId === 'total') {
      list = list
        .map(p => ({ ...p, _pts: getTotal(p) }))
        .filter(p => p._pts > 0)
        .sort((a, b) => b._pts - a._pts)
    } else {
      list = list
        .map(p => ({ ...p, _pts: getPoints(p, roundId) }))
        .filter(p => p._pts > 0)
        .sort((a, b) => b._pts - a._pts)
    }
    return list
  }

  const allLeaders = getLeaders(selectedRound)
  const totalPages = Math.max(1, Math.ceil(allLeaders.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const leaders = allLeaders.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f]">Tournament Leaders</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Top scorers by round. Highlighted = drafted in your league.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Round:</span>
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {roundOptions.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Seeds:</span>
          <select
            value={seedFilter}
            onChange={e => setSeedFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {SEED_FILTERS.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Show:</span>
          <select
            value={draftFilter}
            onChange={e => setDraftFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {DRAFT_FILTERS.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1e3a5f] text-white">
            <tr>
              <th className="text-left px-3 py-2 font-semibold w-10">#</th>
              <th className="text-left px-3 py-2 font-semibold">Player</th>
              <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Team</th>
              <th className="text-center px-3 py-2 font-bold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {leaders.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400 italic">
                  No scores yet for this round. Run ESPN sync in Admin to pull stats.
                </td>
              </tr>
            ) : (
              leaders.map((player, idx) => {
                const isDrafted = !!player.drafter_id
                const isLive = getOpponentForTeam(player.team, upcomingOpponents)?.isLive
                const rank = safePage * PAGE_SIZE + idx + 1
                return (
                  <tr
                    key={player.id}
                    className={`border-t border-slate-100 ${
                      isDrafted ? 'bg-amber-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-500 font-medium">{rank}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium text-slate-800 ${isDrafted ? 'text-amber-900' : ''}`}>
                        {isLive ? (
                          <span className="text-red-600 font-semibold animate-blink">{player.name} •</span>
                        ) : (
                          player.name
                        )}
                      </span>
                      {isDrafted && (
                        <span className="ml-1.5 text-xs bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-medium">
                          {player.drafter?.name ? `${player.drafter.name}` : 'Drafted'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">
                      {player.team}
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-orange-500">{player._pts}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {allLeaders.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          >
            ← Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {safePage + 1} of {totalPages} ({allLeaders.length} players)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        {allLeaders.length} players. Eliminated teams hidden. Sync scores from Admin → ESPN Sync to update.
      </p>
    </div>
  )
}
