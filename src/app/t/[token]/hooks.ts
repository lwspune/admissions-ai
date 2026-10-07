'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ClientEvent {
  kind: string
  position?: number | null
  payload?: Record<string, unknown>
}

/**
 * Batched, fire-and-forget telemetry.
 *
 * Buffered and flushed every few seconds rather than sent per event: on 3G,
 * a request per keystroke would compete with answer saving, which must always
 * win. Every failure is swallowed — losing telemetry costs the report some
 * detail, losing an answer costs the candidate their test.
 *
 * Events are not timestamped here — the server stamps arrival, because a client
 * clock is not evidence. But arrival time is FLUSH time, which clusters events
 * into 5-second groups and destroys per-question timing for questions that were
 * never answered (an answered one carries its own dwell). So each event also
 * carries `offsetMs`: milliseconds since this attempt started, measured on the
 * client. It is a relative duration, not a timestamp, so there is still no
 * clock to trust, and the server's own total bounds it.
 */
export function useTelemetry(attemptId: string | null, startedAt: number | null, flushMs = 5000) {
  const buffer = useRef<ClientEvent[]>([])
  const attemptRef = useRef(attemptId)
  attemptRef.current = attemptId
  const startRef = useRef(startedAt)
  startRef.current = startedAt

  const flush = useCallback(async () => {
    const id = attemptRef.current
    if (!id || buffer.current.length === 0) return

    const events = buffer.current
    buffer.current = []

    try {
      await fetch('/api/t/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: id, events }),
        keepalive: true, // survives the page being backgrounded or closed
      })
    } catch {
      /* telemetry must never surface to the candidate */
    }
  }, [])

  const record = useCallback(
    (event: ClientEvent, immediate = false) => {
      const start = startRef.current
      buffer.current.push({
        ...event,
        payload: { ...(event.payload ?? {}), offsetMs: start === null ? null : Date.now() - start },
      })
      if (immediate) void flush()
    },
    [flush],
  )

  useEffect(() => {
    const timer = setInterval(() => void flush(), flushMs)
    return () => {
      clearInterval(timer)
      void flush()
    }
  }, [flush, flushMs])

  return { record, flush }
}

/**
 * Countdown that stops while the tab is hidden.
 *
 * The pause is a product decision (spec §1) and it is exploitable — close the
 * tab, look something up, come back. Two things bound it: the 3-hour window is
 * a hard backstop, and every pause is reported alongside whether the answer to
 * the question on screen changed afterwards.
 *
 * The value here is display only. The server recomputes the real deadline from
 * its own event log on every resume and at submit, so a tampered client clock
 * buys nothing.
 */
export function useCountdown({
  deadlineAt,
  windowEndsAt,
  onExpire,
  onVisibilityChange,
}: {
  deadlineAt: number | null
  windowEndsAt: number
  onExpire: (reason: 'timer' | 'window') => void
  onVisibilityChange: (hidden: boolean) => void
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)
  const expired = useRef(false)

  // Held in a ref so the ticking effect does not restart on every render.
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire
  const visibilityRef = useRef(onVisibilityChange)
  visibilityRef.current = onVisibilityChange

  useEffect(() => {
    const onChange = () => {
      const isHidden = document.visibilityState === 'hidden'
      setHidden(isHidden)
      visibilityRef.current(isHidden)
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    if (deadlineAt === null) return

    const tick = () => {
      // The window closes on wall-clock time whether or not the tab is
      // visible; only the paper’s own allowance pauses.
      if (Date.now() >= windowEndsAt) {
        if (!expired.current) {
          expired.current = true
          expireRef.current('window')
        }
        setRemainingMs(0)
        return
      }
      if (document.visibilityState === 'hidden') return

      const left = deadlineAt - Date.now()
      setRemainingMs(Math.max(0, left))
      if (left <= 0 && !expired.current) {
        expired.current = true
        expireRef.current('timer')
      }
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadlineAt, windowEndsAt])

  return { remainingMs, hidden }
}

/** mm:ss, for a countdown a 15-year-old reads under pressure. */
export function formatClock(ms: number | null): string {
  if (ms === null) return '--:--'
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
