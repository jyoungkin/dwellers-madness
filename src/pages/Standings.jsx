import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const ROUNDS = ['Play-In', 'Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship']
const MEDALS = ['🥇', '🥈', '🥉']

function computeTotal(player) {
  return (player.player_scores || []).reduce((sum, s) => sum + (s.points || 0), 0)
}

function computeDrafterStats(drafter) {
  const players = drafter.players || []
  const totalPoints = players.reduce((sum, p) => sum + computeTotal(p), 0)
  const playersLeft = players.filter(p => !p.is_eliminated).length
  return { ...drafter, players, totalPoints, playersLeft }
}

function PlayerPill({ player }) {
  const pts = computeTotal(player)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        player.is_eliminated
          ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
          : 'bg-blue-50 border-blue-200 text-blue-800'
      }`}
    >
      {player.name.split(',')[0]}
      <span className="font-bold">{pts}</span>
    </span>
  )
}

export default function Standings() {
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('drafters')
        .select(`
          id, name, draft_position,
          players (
            id, name, team, is_eliminated,
            player_scores (round_name, points)
          )
        `)
        .order('draft_position')

      if (error) { setError(error.message); setLoading(false); return }

      const enriched = (data || []).map(computeDrafterStats)
      enriched.sort((a, b) => b.totalPoints - a.totalPoints)
      setStandings(enriched)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-16 text-slate-500">Loading standings...</div>
  if (error) return <div className="text-center py-16 text-red-500">Error: {error}</div>

  if (standings.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🏀</div>
        <h2 className="text-xl font-semibold text-slate-600">Draft hasn't happened yet</h2>
        <p className="text-slate-400 mt-2">Standings will appear here once the draft is complete.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">Standings</h2>
      <p className="text-sm text-slate-500 mb-6">Total points scored by all drafted players across the tournament.</p>

      <div className="grid gap-4">
        {standings.map((drafter, idx) => (
          <div
            key={drafter.id}
            className={`bg-white rounded-xl shadow-sm border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
              idx === 0 ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'
            }`}
          >
            {/* Rank + Name */}
            <div className="flex items-center gap-3 sm:w-48 shrink-0">
              <span className="text-2xl">{MEDALS[idx] || `#${idx + 1}`}</span>
              <div>
                <div className="font-bold text-lg text-slate-800">{drafter.name}</div>
                <div className="text-xs text-slate-400">
                  {drafter.playersLeft}/{drafter.players.length} players active
                </div>
              </div>
            </div>

            {/* Total Points */}
            <div className="text-center sm:w-24 shrink-0">
              <div className="text-3xl font-bold text-orange-500">{drafter.totalPoints}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">pts</div>
            </div>

            {/* Player pills */}
            <div className="flex flex-wrap gap-2 flex-1">
              {drafter.players.length === 0 ? (
                <span className="text-slate-400 text-sm italic">No players drafted</span>
              ) : (
                drafter.players.map(p => <PlayerPill key={p.id} player={p} />)
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
        <strong>Pill key:</strong> player name + their total tournament points. 
        Grayed out = eliminated. Still active = blue.
      </div>
    </div>
  )
}
