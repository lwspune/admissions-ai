import { describe, it, expect } from 'vitest'
import { computeActiveMs, computeDeadline, attemptStatus, canStart, type TimerEvent } from './timer'
import { limitMsFor, WINDOW_MS } from './types'

// Every paper carries its own limit (2026-10-06); these tests are the 15-minute one.
const LIMIT_MS = limitMsFor(15)

const T0 = Date.UTC(2026, 8, 22, 10, 0, 0) // a fixed server instant
const MIN = 60_000

const at = (m: number) => T0 + m * MIN
const pause = (m: number): TimerEvent => ({ kind: 'pause', at: at(m) })
const resume = (m: number): TimerEvent => ({ kind: 'resume', at: at(m) })

// ── active time accounting ───────────────────────────────────────────────────

describe('computeActiveMs', () => {
  it('counts wall-clock time when the tab was never hidden', () => {
    expect(computeActiveMs(T0, [], at(5))).toBe(5 * MIN)
  })

  it('excludes time spent paused', () => {
    // active 0-2, paused 2-9, active 9-10  =>  3 minutes
    expect(computeActiveMs(T0, [pause(2), resume(9)], at(10))).toBe(3 * MIN)
  })

  it('stops accruing on an unpaired pause — tab closed and never reopened', () => {
    // This is the common case: the candidate walks away. Time must freeze at the
    // pause, not keep running to `now`.
    expect(computeActiveMs(T0, [pause(4)], at(90))).toBe(4 * MIN)
  })

  it('handles several pause/resume cycles', () => {
    const events = [pause(1), resume(3), pause(5), resume(20), pause(21)]
    // active: 0-1, 3-5, 20-21 => 1 + 2 + 1 = 4
    expect(computeActiveMs(T0, events, at(60))).toBe(4 * MIN)
  })

  it('ignores a duplicate pause while already paused', () => {
    expect(computeActiveMs(T0, [pause(2), pause(3), resume(10)], at(11))).toBe(3 * MIN)
  })

  it('ignores a duplicate resume while already running', () => {
    expect(computeActiveMs(T0, [resume(2), resume(3)], at(5))).toBe(5 * MIN)
  })

  it('sorts events that arrive out of order', () => {
    // Telemetry is batched; the server may receive a resume before its pause.
    expect(computeActiveMs(T0, [resume(9), pause(2)], at(10))).toBe(3 * MIN)
  })

  it('clamps an event timestamped before the attempt started', () => {
    expect(computeActiveMs(T0, [pause(-5), resume(2)], at(5))).toBe(3 * MIN)
  })

  it('clamps an event timestamped after now', () => {
    // A client clock running fast must not manufacture or destroy time.
    expect(computeActiveMs(T0, [pause(99)], at(5))).toBe(5 * MIN)
  })

  it('never returns a negative value', () => {
    expect(computeActiveMs(T0, [], T0 - 10 * MIN)).toBe(0)
  })
})

// Window-relative times, so the tests follow WINDOW_MS (3 hours since 0015).
const W = WINDOW_MS / MIN

// ── deadline ─────────────────────────────────────────────────────────────────

describe('computeDeadline', () => {
  const windowEndsAt = T0 + WINDOW_MS

  it('is start + 15 minutes for an attempt that has just begun', () => {
    expect(computeDeadline({ startedAt: T0, events: [], now: T0, windowEndsAt, limitMs: LIMIT_MS })).toBe(T0 + LIMIT_MS)
  })

  it('extends by the paused time when the candidate resumes', () => {
    // 2 min active, then a 7 min pause. On resume at minute 9 they should still
    // have 13 minutes left, so the deadline is minute 22.
    const deadline = computeDeadline({ startedAt: T0, events: [pause(2), resume(9)], now: at(9), windowEndsAt, limitMs: LIMIT_MS })
    expect(deadline).toBe(at(22))
  })

  it('never exceeds the 3-hour window — the window is the backstop', () => {
    // Resuming 5 minutes before the window closes, with 13 of active time left.
    // The window must win, otherwise banked idle time is unbounded.
    const deadline = computeDeadline({ startedAt: T0, events: [pause(2), resume(W - 5)], now: at(W - 5), windowEndsAt, limitMs: LIMIT_MS })
    expect(deadline).toBe(windowEndsAt)
    expect(deadline).toBe(at(W))
  })

  it('returns now when the active limit is already spent', () => {
    expect(computeDeadline({ startedAt: T0, events: [], now: at(20), windowEndsAt, limitMs: LIMIT_MS })).toBe(at(20))
  })

  it('never returns an instant before now', () => {
    const deadline = computeDeadline({ startedAt: T0, events: [], now: at(200), windowEndsAt, limitMs: LIMIT_MS })
    expect(deadline).toBeGreaterThanOrEqual(at(200))
  })

  it('is unaffected by the client clock — inputs are server timestamps only', () => {
    const a = computeDeadline({ startedAt: T0, events: [pause(2), resume(9)], now: at(9), windowEndsAt, limitMs: LIMIT_MS })
    const skewed = [
      { kind: 'pause', at: at(2) } as TimerEvent,
      { kind: 'resume', at: at(9) } as TimerEvent,
    ]
    expect(computeDeadline({ startedAt: T0, events: skewed, now: at(9), windowEndsAt, limitMs: LIMIT_MS })).toBe(a)
  })
})

// ── ending an attempt ────────────────────────────────────────────────────────

describe('attemptStatus', () => {
  const windowEndsAt = T0 + WINDOW_MS

  it('reports a live attempt as not ended, with time remaining', () => {
    const s = attemptStatus({ startedAt: T0, events: [], now: at(5), windowEndsAt, limitMs: LIMIT_MS })
    expect(s.ended).toBe(false)
    expect(s.reason).toBeNull()
    expect(s.remainingMs).toBe(10 * MIN)
  })

  it('ends with reason "timer" when 15 active minutes are spent', () => {
    const s = attemptStatus({ startedAt: T0, events: [], now: at(15), windowEndsAt, limitMs: LIMIT_MS })
    expect(s.ended).toBe(true)
    expect(s.reason).toBe('timer')
    expect(s.remainingMs).toBe(0)
  })

  it('ends with reason "window" when the 3 hours elapse first', () => {
    // Long pauses mean only 5 active minutes are spent, but the window is gone.
    const s = attemptStatus({ startedAt: T0, events: [pause(5), resume(W - 1)], now: at(W + 1), windowEndsAt, limitMs: LIMIT_MS })
    expect(s.ended).toBe(true)
    expect(s.reason).toBe('window')
  })

  it('prefers "timer" when both expire at the same instant', () => {
    const s = attemptStatus({ startedAt: T0, events: [], now: at(120), windowEndsAt, limitMs: LIMIT_MS })
    expect(s.ended).toBe(true)
    expect(s.reason).toBe('timer')
  })

  it('does not end an attempt that is merely paused', () => {
    const s = attemptStatus({ startedAt: T0, events: [pause(3)], now: at(40), windowEndsAt, limitMs: LIMIT_MS })
    expect(s.ended).toBe(false)
    expect(s.remainingMs).toBe(12 * MIN)
  })
})

// ── the start gate (spec §4 rule 2) ──────────────────────────────────────────

describe('canStart', () => {
  const windowEndsAt = T0 + WINDOW_MS

  it('allows a start at the beginning of the window', () => {
    expect(canStart(T0, windowEndsAt, LIMIT_MS)).toBe(true)
  })

  it('allows a start with exactly 15 minutes left', () => {
    expect(canStart(at(W - 15), windowEndsAt, LIMIT_MS)).toBe(true)
  })

  it('refuses a start with under 15 minutes left — a 2-minute test is meaningless', () => {
    expect(canStart(at(W - 14), windowEndsAt, LIMIT_MS)).toBe(false)
    expect(canStart(at(W - 2), windowEndsAt, LIMIT_MS)).toBe(false)
  })

  it('refuses a start after the window has closed', () => {
    expect(canStart(at(W + 1), windowEndsAt, LIMIT_MS)).toBe(false)
  })
})

// ── a 30-question paper runs 30 minutes ──────────────────────────────────────

describe('a 30-minute paper', () => {
  const windowEndsAt = T0 + WINDOW_MS
  const THIRTY = limitMsFor(30)

  it('sets its deadline 30 minutes out', () => {
    expect(computeDeadline({ startedAt: T0, events: [], now: T0, windowEndsAt, limitMs: THIRTY })).toBe(at(30))
  })

  it('is still running at 20 minutes, where a 15-minute paper has ended', () => {
    expect(attemptStatus({ startedAt: T0, events: [], now: at(20), windowEndsAt, limitMs: THIRTY }).ended).toBe(false)
    expect(attemptStatus({ startedAt: T0, events: [], now: at(20), windowEndsAt, limitMs: LIMIT_MS }).ended).toBe(true)
  })

  it('needs 30 minutes left in the window to start', () => {
    expect(canStart(at(W - 30), windowEndsAt, THIRTY)).toBe(true)
    expect(canStart(at(W - 29), windowEndsAt, THIRTY)).toBe(false)
  })
})
