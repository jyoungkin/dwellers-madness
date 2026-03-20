import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { computeAutoLineup, computePlayerTotal } from '../lib/lineup.js'
import { getTeamPillStyle } from '../lib/teamColors.js'
import { fetchUpcomingOpponents, getOpponentForTeam } from '../lib/espnUpcoming.js'

const MEDALS = ['🥇', '🥈', '🥉']

function PlayerPill({ player, role, tournamentOver, isLive }) {
  const pts = computePlayerTotal(player)
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border'
  const useSolidStyle = player.is_eliminated || tournamentOver

  const namePart = player.name.split(',')[0]
  const nameDisplay = isLive ? (
    <span className="text-red-600 font-semibold animate-blink">{namePart} •</span>
  ) : (
    namePart
  )

  if (role === 'bench') {
    if (useSolidStyle) {
      const pillStyle = getTeamPillStyle(player.team, { isEliminated: true, isBench: true })
      return (
        <span className={base} style={pillStyle}>
          {nameDisplay}
          <span className="opacity-60">{pts}</span>
        </span>
      )
    }
    return (
      <span className={`${base} bg-slate-100 border-slate-200 text-slate-400`}>
        {nameDisplay}
        <span className="opacity-60">{pts}</span>
      </span>
    )
  }

  const pillStyle = getTeamPillStyle(player.team, { isEliminated: useSolidStyle })
  const isSixthMan = role === 'sixth'

  return (
    <span
      className={base}
      style={pillStyle}
    >
      {nameDisplay}
      {isSixthMan && <span className="ml-0.5 text-xs opacity-70">(6th)</span>}
      <span className="font-bold">{pts}</span>
    </span>
  )
}

export default function Standings() {
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tournamentOver, setTournamentOver] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [upcomingOpponents, setUpcomingOpponents] = useState({})

  useEffect(() => {
    const load = () => fetchUpcomingOpponents().then(setUpcomingOpponents).catch(() => {})
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [refreshTrigger])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'tournament_over').single()
      .then(({ data }) => setTournamentOver(data?.value === 'true'))
      .catch(() => {})
  }, [])

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
            id, name, team, seed, is_eliminated,
            player_scores (round_name, points)
          )
        `)
        .order('draft_position')

      if (error) { setError(error.message); setLoading(false); return }

      const enriched = (data || []).map(drafter => {
        const players = drafter.players || []
        const { lineup, sixthMan, bench, lineupTotal, hasValidLineup } = computeAutoLineup(players)
        const lineupIds  = new Set(lineup.map(p => p.id))
        const sixthManId = sixthMan?.id
        const playersLeft = lineup.filter(p => !p.is_eliminated).length

        return {
          ...drafter,
          players,
          lineup,
          bench,
          lineupIds,
          sixthManId,
          lineupTotal,
          hasValidLineup,
          playersLeft,
        }
      })

      enriched.sort((a, b) => b.lineupTotal - a.lineupTotal)
      setStandings(enriched)
      setLoading(false)
    }
    load()
  }, [refreshTrigger])

  if (loading) return <div className="text-center py-16 text-slate-500">Loading standings...</div>
  if (error)   return <div className="text-center py-16 text-red-500">Error: {error}</div>

  if (standings.length === 0 || standings.every(d => d.players.length === 0)) {
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
      <p className="text-sm text-slate-500 mb-1">
        Score = best 6 players from each team (must include ≥1 double-digit seed + ≥1 other seed 5+).
        Lowest scorer of the 6 = Sixth Man.
      </p>

      <div className="grid gap-4 mt-4">
        {standings.map((drafter, idx) => (
          <div
            key={drafter.id}
            className={`bg-white rounded-xl shadow-sm border p-4 ${
              idx === 0 ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'
            }`}
          >
            {/* Top row: rank, name, score */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-2xl">{MEDALS[idx] || `#${idx + 1}`}</span>
              <div className="flex-1">
                <div className="font-bold text-lg text-slate-800">{drafter.name}</div>
                <div className="text-xs text-slate-400">
                  {drafter.playersLeft}/{drafter.lineup.length} lineup players still active
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-orange-500">{drafter.lineupTotal}</div>
                <div className="text-xs text-slate-400 uppercase tracking-wide">lineup pts</div>
              </div>
            </div>

            {!drafter.hasValidLineup && drafter.players.length > 0 && (
              <div className="mb-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠️ No valid 6-player lineup found — showing top 6 scorers without rule enforcement.
              </div>
            )}

            {/* Scoring lineup */}
            {drafter.lineup.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Scoring Lineup
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {drafter.lineup.map(p => (
                    <PlayerPill
                      key={p.id}
                      player={p}
                      role={p.id === drafter.sixthManId ? 'sixth' : 'starter'}
                      tournamentOver={tournamentOver}
                      isLive={getOpponentForTeam(p.team, upcomingOpponents)?.isLive}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Bench */}
            {drafter.bench.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Bench
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {drafter.bench.map(p => (
                    <PlayerPill
                      key={p.id}
                      player={p}
                      role="bench"
                      tournamentOver={tournamentOver}
                      isLive={getOpponentForTeam(p.team, upcomingOpponents)?.isLive}
                    />
                  ))}
                </div>
              </div>
            )}

            {drafter.players.length === 0 && (
              <span className="text-slate-400 text-sm italic">No players drafted</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
        <strong>Lineup key:</strong> Colored = scoring lineup (team colors) &nbsp;|&nbsp;
        <strong>(6th)</strong> = Sixth Man (lowest scorer in lineup) &nbsp;|&nbsp;
        Gray = bench (not counted in score)
      </div>
    </div>
  )
}
