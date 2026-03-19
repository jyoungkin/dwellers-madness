/**
 * Auto-sync with ESPN during tournament days.
 * - 15 min until first game of the day starts
 * - 1 min for the remainder of that calendar day once games start
 * ESPN API is free — no cost for polling.
 */

import { syncTournamentScores } from './espnSync.js'

const TOURNAMENT_DATES = [
  '20260317', '20260318', '20260319', '20260320', '20260321', '20260322',
  '20260326', '20260327', '20260328', '20260329', '20260404', '20260406',
]

const SLOW_INTERVAL_MS = 15 * 60 * 1000  // 15 min
const FAST_INTERVAL_MS = 60 * 1000       // 1 min

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function isTournamentActive() {
  const today = todayStr()
  const firstDate = TOURNAMENT_DATES[0]
  const lastDate = TOURNAMENT_DATES[TOURNAMENT_DATES.length - 1]
  return today >= firstDate && today <= lastDate
}

let intervalId = null
let currentIntervalMs = SLOW_INTERVAL_MS
let lastScheduleTime = 0
let lastDayStr = ''

function scheduleNext(runSync) {
  const now = Date.now()
  const elapsed = now - lastScheduleTime
  const remaining = Math.max(0, currentIntervalMs - elapsed)
  intervalId = setTimeout(() => {
    lastScheduleTime = Date.now()
    runSync().then(() => {
      scheduleNext(runSync)
    })
  }, remaining)
}

export function startAutoSync() {
  if (!isTournamentActive()) return () => {}

  async function runSync() {
    try {
      const day = todayStr()
      if (day !== lastDayStr) {
        lastDayStr = day
        currentIntervalMs = SLOW_INTERVAL_MS
      }
      const result = await syncTournamentScores(/* no progress callback for background */)
      if (result?.gamesStartedToday && currentIntervalMs === SLOW_INTERVAL_MS) {
        currentIntervalMs = FAST_INTERVAL_MS
      }
      window.dispatchEvent(new CustomEvent('espn-sync-complete'))
    } catch {
      // silent fail for background sync
    }
  }

  // Run once after 1 min (avoid firing immediately on page load)
  const initialTimeout = setTimeout(async () => {
    lastScheduleTime = Date.now()
    await runSync()
    intervalId = null
    scheduleNext(runSync)
  }, 60 * 1000)

  return () => {
    clearTimeout(initialTimeout)
    if (intervalId) clearTimeout(intervalId)
    intervalId = null
  }
}

export function stopAutoSync() {
  if (intervalId) {
    clearTimeout(intervalId)
    intervalId = null
  }
}
