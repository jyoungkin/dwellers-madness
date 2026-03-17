/**
 * lineup.js
 * Auto-computes the optimal 6-player scoring lineup from a drafter's 10 players.
 *
 * Rules for the scoring lineup:
 *   - Exactly 6 players
 *   - At least 1 must be a double-digit seed (10+)
 *   - At least 1 OTHER must also be seeded 5+ (so ≥2 total from seed 5+, ≥1 being DD)
 *   - Subject to those constraints, maximize total tournament points
 *   - The lowest scorer in the 6 is the "Sixth Man"
 *
 * Uses brute-force over all C(10,6) = 210 combinations — trivially fast in the browser.
 */

const LINEUP_SIZE       = 6
const LINEUP_MIN_DD     = 1   // ≥1 double-digit seed in the lineup
const LINEUP_MIN_HIGHER = 2   // ≥2 players seeded 5+ in the lineup (DD counts)
const DD_THRESHOLD      = 10
const HIGHER_THRESHOLD  = 5

export function computePlayerTotal(player) {
  return (player.player_scores || []).reduce((sum, s) => sum + (s.points || 0), 0)
}

function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [head, ...tail] = arr
  const withHead    = combinations(tail, k - 1).map(c => [head, ...c])
  const withoutHead = combinations(tail, k)
  return [...withHead, ...withoutHead]
}

function comboScore(combo) {
  return combo.reduce((s, p) => s + p._total, 0)
}

function isValidLineup(combo) {
  const ddCount     = combo.filter(p => p.seed >= DD_THRESHOLD).length
  const higherCount = combo.filter(p => p.seed >= HIGHER_THRESHOLD).length
  return ddCount >= LINEUP_MIN_DD && higherCount >= LINEUP_MIN_HIGHER
}

/**
 * Given an array of player objects (each with a `player_scores` array and a `seed`),
 * returns the best valid 6-player scoring lineup.
 *
 * Return shape:
 *   {
 *     lineup:       Player[6],   // all 6 scoring players, sorted best→worst
 *     starters:     Player[5],   // top 5 scorers in the lineup
 *     sixthMan:     Player,      // lowest scorer in the lineup
 *     bench:        Player[],    // players NOT in the lineup
 *     lineupTotal:  number,      // sum of the 6 lineup players' points
 *     hasValidLineup: boolean,   // false if draft rules weren't met and no valid combo exists
 *   }
 */
export function computeAutoLineup(players) {
  if (!players || players.length === 0) {
    return { lineup: [], starters: [], sixthMan: null, bench: [], lineupTotal: 0, hasValidLineup: false }
  }

  // Attach pre-computed totals so we don't recalculate per combo
  const scored = players.map(p => ({ ...p, _total: computePlayerTotal(p) }))

  const allCombos   = combinations(scored, LINEUP_SIZE)
  const validCombos = allCombos.filter(isValidLineup)

  let lineup
  let hasValidLineup = true

  if (validCombos.length > 0) {
    lineup = validCombos.reduce((best, c) => comboScore(c) > comboScore(best) ? c : best)
  } else {
    // Draft rules weren't fully met — fall back to top 6 scorers with no constraint check
    hasValidLineup = false
    lineup = [...scored].sort((a, b) => b._total - a._total).slice(0, LINEUP_SIZE)
  }

  // Sort lineup best → worst; lowest scorer is the Sixth Man
  lineup.sort((a, b) => b._total - a._total)

  const lineupIds = new Set(lineup.map(p => p.id))
  const bench     = scored.filter(p => !lineupIds.has(p.id))
  const starters  = lineup.slice(0, 5)
  const sixthMan  = lineup[5] ?? null

  return {
    lineup,
    starters,
    sixthMan,
    bench,
    lineupTotal: comboScore(lineup),
    hasValidLineup,
  }
}
