'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { Avatar, Badge, cx } from '@/components/ui'

// The homepage's one animation: a mock-up of the admin screens, drawn with the
// app's own pieces so it looks like the product. Every name is invented and
// nothing here reads data. The frame is aria-hidden; the sentence beside it
// says what it shows.

const STAFF = [
  { name: 'Neha Kulkarni', role: 'Superadmin', tone: 'brand' },
  { name: 'Imran Shaikh', role: 'Counsellor', tone: 'accent' },
  { name: 'Pooja Deshmukh', role: 'Telecaller', tone: 'info' },
  { name: 'Sagar More', role: 'Telecaller', tone: 'info' },
] as const

const CLASSES = [8, 9, 10, 11, 12]

/** The new account appears at this step; the bars fill from 1, the badges from BADGES_FROM. */
const ADDED_AT = 3
const BADGES_FROM = 5
/** The last badge lands at step 9; the rest is a pause on the finished screen before it starts again. */
const STEPS = 14
const TICK_MS = 650

const panel = 'rounded-xl border border-slate-200/80 bg-white shadow-card'

function AdminScene({ step }: { step: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={cx(panel, 'p-4')}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
          <Icon name="shield" className="h-4 w-4" />
          Staff
        </p>
        <ul className="mt-3 space-y-2.5">
          {STAFF.map((s, i) => {
            const added = i === STAFF.length - 1
            return (
              <li
                key={s.name}
                // The new row holds its place from the start, so the card does not jump when it shows.
                className={cx(
                  'flex items-center gap-2.5 transition-all duration-500',
                  added && step < ADDED_AT ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
                )}
              >
                <Avatar name={s.name} className="h-8 w-8" />
                <span className="flex-1 truncate text-sm font-medium text-slate-900">{s.name}</span>
                {added && <Badge tone="success">Added</Badge>}
                <Badge tone={s.tone}>{s.role}</Badge>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 border-t border-slate-100 pt-2 text-xs text-slate-600">
          Telecallers see only the leads assigned to them, and never the questions.
        </p>
      </div>

      <div className={cx(panel, 'p-4')}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
          <Icon name="book" className="h-4 w-4" />
          Question bank, by class
        </p>
        <ul className="mt-3 space-y-2.5">
          {CLASSES.map((c, i) => (
            <li key={c} className="text-sm">
              <p className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">Admitting class {c}</span>
                <span className={cx('transition-opacity duration-500', step >= BADGES_FROM + i ? 'opacity-100' : 'opacity-0')}>
                  <Badge tone="success" icon="check">
                    30 questions
                  </Badge>
                </span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
                  style={{ width: step >= 1 + i ? '100%' : '0%' }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Plays on a loop, and stops on request, off-screen, or for anyone who asks
 * for less motion; stopped, it shows the finished screen.
 */
export function ProductTour() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false), { threshold: 0.25 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const running = playing && onScreen && !reduced
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS), TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  const still = reduced || !playing

  return (
    <div ref={root} className="overflow-hidden rounded-2xl border border-slate-200 bg-canvas shadow-raised">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <span
          aria-hidden="true"
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
        >
          <Icon name="lock" className="h-3 w-3 shrink-0" />
          aptitudetestai.vercel.app/staff
        </span>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause the animation' : 'Play the animation'}
            className="min-h-tap min-w-tap -my-2 -mr-2 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
          >
            <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
          </button>
        )}
      </div>
      <div aria-hidden="true" className="p-3 sm:p-5">
        <AdminScene step={still ? STEPS - 1 : step} />
      </div>
    </div>
  )
}
