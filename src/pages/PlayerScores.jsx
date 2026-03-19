import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { computeAutoLineup, computePlayerTotal } from '../lib/lineup.js'
import { getTeamRowStyle } from '../lib/teamColors.js'
import { fetchUpcomingOpponents, getOpponentForTeam, formatOpponentDisplay } from '../lib/espnUpcoming.js'

const ROUNDS = ['Round of 64', 'Round of 32', 'Sweet Sixteen', 'Elite Eight', 'Final Four', 'Championship']
const ROUND_SHORT = { 'Round of 64': 'R64', 'Round of 32': 'R32', 'Sweet Sixteen': 'S16', 'Elite Eight': 'E8', 'Final Four': 'F4', 'Championship': 'NAT' }

function RoleBadge({ role }) {
  if (role === 'starter')
    return <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded font-semibold">Starter</span>
  if (role === 'sixth')
    return <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-1.5 rounded font-semibold">6th Man</span>
  return <span className="ml-1 text-xs bg-slate-100 text-slate-400 px-1.5 rounded">Bench</span>
}

export default function PlayerScores() {
  const [drafters, setDrafters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDrafter, setSelectedDrafter] = useState('all')
  const [upcomingOpponents, setUpcomingOpponents] = useState({})
  const [tournamentOver, setTournamentOver] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    const handler = () => {
      setRefreshTrigger(t => t + 1)
      supabase.from('settings').select('value').eq('key', 'tournament_over').single()
        .then(({ data }) => setTournamentOver(data?.value === 'true'))
        .catch(() => {})
    }
    window.addEventListener('espn-sync-complete', handler)
    return () => window.removeEventListener('espn-sync-complete', handler)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('drafters')
        .select(`
          id, name, draft_position,
          players (
            id, name, team, seed, season_ppg, is_eliminated,
            player_scores (round_name, points)
          )
        `)
        .order('draft_position')

      if (error) { setError(error.message); setLoading(false); return }
      setDrafters(data || [])
      setLoading(false)
    }
    load()
  }, [refreshTrigger])

  useEffect(() => {
    fetchUpcomingOpponents().then(setUpcomingOpponents).catch(() => {})
  }, [refreshTrigger])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'tournament_over').single()
      .then(({ data }) => setTournamentOver(data?.value === 'true'))
      .catch(() => {})
  }, [])

  if (loading) return <div className="text-center py-16 text-slate-500">Loading scores...</div>
  if (error)   return <div className="text-center py-16 text-red-500">Error: {error}</div>

  const filtered = selectedDrafter === 'all' ? drafters : drafters.filter(d => d.id === selectedDrafter)

  if (drafters.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-semibold text-slate-600">No players drafted yet</h2>
        <p className="text-slate-400 mt-2">Player scores will appear here once the draft is complete.</p>
      </div>
    )
  }

  function getPoints(player, round) {
    return (player.player_scores || []).find(s => s.round_name === round)?.points ?? null
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a5f]">Player Scores</h2>
          <p className="text-sm text-slate-500">Points by round. Lineup = best valid 6 by score. Sixth Man = lowest of the 6.</p>
        </div>
        <select
          value={selectedDrafter}
          onChange={e => setSelectedDrafter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">All Teams</option>
          {drafters.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {filtered.map(drafter => {
        const players = drafter.players || []
        const { lineup, sixthMan, lineupTotal } = computeAutoLineup(players)
        const lineupIds  = new Set(lineup.map(p => p.id))
        const sixthManId = sixthMan?.id

        // Sort: lineup first (by score desc), then bench (by score desc)
        const sorted = [...players].sort((a, b) => {
          const aIn = lineupIds.has(a.id)
          const bIn = lineupIds.has(b.id)
          if (aIn !== bIn) return aIn ? -1 : 1
          return computePlayerTotal(b) - computePlayerTotal(a)
        })

        function getRole(player) {
          if (!lineupIds.has(player.id)) return 'bench'
          if (player.id === sixthManId)  return 'sixth'
          return 'starter'
        }

        function getDrafterLineupRoundTotal(round) {
          return lineup.reduce((sum, p) => sum + (getPoints(p, round) || 0), 0)
        }

        const hasBench = sorted.some(p => !lineupIds.has(p.id))

        return (
          <div key={drafter.id} className="mb-10">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-700">{drafter.name}</h3>
              <span className="text-orange-500 font-bold">{lineupTotal} lineup pts</span>
              <span className="text-xs text-slate-400">({players.length} total players drafted)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
                <thead className="bg-[#1e3a5f] text-white">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Player</th>
                    <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Team</th>
                    <th className="text-left px-3 py-2 font-semibold">Upcoming</th>
                    {ROUNDS.map(r => (
                      <th key={r} className="text-center px-2 py-2 font-semibold text-xs" title={r}>
                        {ROUND_SHORT[r]}
                      </th>
                    ))}
                    <th className="text-center px-3 py-2 font-bold text-orange-300">TOT</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((player, idx) => {
                    const role  = getRole(player)
                    const total = computePlayerTotal(player)
                    const isBench = role === 'bench'
                    const useSolidStyle = player.is_eliminated || tournamentOver
                    const rowStyle = getTeamRowStyle(player.team, { isBench, isEliminated: useSolidStyle, rowIndex: idx })
                    const opponentEntry = getOpponentForTeam(player.team, upcomingOpponents)
                    const opponentText = player.is_eliminated
                      ? '—'
                      : (formatOpponentDisplay(opponentEntry) ?? '—')
                    return (
                      <tr
                        key={player.id}
                        className="border-t border-slate-100"
                        style={rowStyle}
                      >
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {player.name}
                          </span>
                          <RoleBadge role={role} />
                          {player.is_eliminated && (
                            <span className="ml-1 text-xs bg-white/30 text-white px-1 rounded">OUT</span>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          {player.seed ? `(${player.seed}) ` : ''}{player.team}
                        </td>
                        <td className="px-3 py-2">
                          {opponentEntry?.isLive ? (
                            <span className="text-red-600 font-semibold animate-blink">{opponentText}</span>
                          ) : (
                            opponentText
                          )}
                        </td>
                        {ROUNDS.map(r => {
                          const pts = getPoints(player, r)
                          return (
                            <td key={r} className="px-2 py-2 text-center">
                              {pts === null
                                ? <span className="opacity-70">—</span>
                                : <span className={isBench ? 'opacity-80' : 'font-medium'}>{pts}</span>
                              }
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center font-bold">
                          {total}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Separator if there's bench */}
                  {hasBench && (
                    <tr>
                      <td colSpan={ROUNDS.length + 4} className="px-3 py-1 text-xs text-slate-400 bg-slate-100 font-semibold uppercase tracking-wide">
                        Bench (not counted in score)
                      </td>
                    </tr>
                  )}

                  {/* Lineup totals row */}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <td className="px-3 py-2 text-slate-600" colSpan={2}>Lineup Total</td>
                    <td />
                    {ROUNDS.map(r => {
                      const roundTotal = getDrafterLineupRoundTotal(r)
                      const hasAny = lineup.some(p => getPoints(p, r) !== null)
                      return (
                        <td key={r} className="px-2 py-2 text-center text-slate-600">
                          {hasAny ? roundTotal : <span className="text-slate-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center text-orange-500 text-lg">{lineupTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
