import { LIMIT_MS } from './types'

export type TimerEventKind = 'pause' | 'resume'
export interface TimerEvent {
  kind: TimerEventKind
  at: number
}

export interface TimerInput {
  startedAt: number
  events: TimerEvent[]
  now: number
  windowEndsAt: number
  limitMs?: number
}

export interface AttemptStatus {
  ended: boolean
  reason: 'timer' | 'window' | null
  remainingMs: number
}

/**
 * Active-time accounting for a timer that pauses when the tab is hidden.
 *
 * Every timestamp here is a SERVER instant. The client reports that a pause
 * happened, never when — so a tampered or merely wrong device clock cannot
 * manufacture or destroy time. Inputs are still clamped, because telemetry is
 * batched and can arrive late, out of order, or referencing an instant outside
 * the attempt.
 */
export function computeActiveMs(startedAt: number, events: TimerEvent[], now: number): number {
  if (now <= startedAt) return 0

  // Clamp into the attempt's span, then sort: batched telemetry can deliver a
  // resume before the pause it follows.
  const ordered = events
    .map((e) => ({ kind: e.kind, at: Math.min(Math.max(e.at, startedAt), now) }))
    .sort((a, b) => a.at - b.at)

  let total = 0
  let running = true
  let since = startedAt

  for (const event of ordered) {
    if (event.kind === 'pause' && running) {
      total += event.at - since
      running = false
    } else if (event.kind === 'resume' && !running) {
      since = event.at
      running = true
    }
    // A pause while paused or a resume while running is a duplicate, and
    // duplicates are expected: the batcher retries on a flaky connection.
  }

  // An unpaired pause is the common case — the candidate closed the tab and
  // never came back. Time must freeze at that pause, not run on to `now`.
  if (running) total += now - since

  return Math.max(0, total)
}

/**
 * The instant this attempt ends if it now runs without interruption.
 *
 * `min(now + remaining active time, window end)` — the 2-hour window is the
 * hard backstop that keeps a pausing timer bounded. Never returns an instant
 * before `now`, so a caller can always treat it as a countdown target.
 */
export function computeDeadline(input: TimerInput): number {
  const { startedAt, events, now, windowEndsAt, limitMs = LIMIT_MS } = input
  const remaining = Math.max(0, limitMs - computeActiveMs(startedAt, events, now))
  return Math.max(now, Math.min(now + remaining, windowEndsAt))
}

/**
 * Whether the attempt is over, and which limit ended it.
 *
 * When both expire together the reason is `timer`, because that is the limit
 * the candidate was shown and the one they will ask about.
 */
export function attemptStatus(input: TimerInput): AttemptStatus {
  const { startedAt, events, now, windowEndsAt, limitMs = LIMIT_MS } = input
  const remainingMs = Math.max(0, limitMs - computeActiveMs(startedAt, events, now))

  const timerEnded = remainingMs <= 0
  const windowEnded = now >= windowEndsAt

  return {
    ended: timerEnded || windowEnded,
    reason: timerEnded ? 'timer' : windowEnded ? 'window' : null,
    remainingMs,
  }
}

/**
 * Whether an attempt may begin at all (spec §4 rule 2).
 *
 * Starting with less than the full limit left in the window would hand someone
 * a two-minute test and produce a score nobody can read. They are told to ask
 * for a fresh link instead.
 */
export function canStart(now: number, windowEndsAt: number, limitMs: number = LIMIT_MS): boolean {
  return windowEndsAt - now >= limitMs
}
