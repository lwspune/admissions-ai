'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { cx } from '@/components/ui'
import {
  ADMIN_STEPS,
  AdminScene,
  LEADS_STEPS,
  LeadsScene,
  REPORT_STEPS,
  ReportScene,
  TEST_STEPS,
  TestScene,
  type SceneProps,
} from './tourScenes'

const SCENES: { name: string; path: string; steps: number; Scene: (p: SceneProps) => React.ReactNode }[] = [
  { name: 'the test', path: '/t/r7Kq2mXa', steps: TEST_STEPS, Scene: TestScene },
  { name: 'the report', path: '/reports/riya-patil', steps: REPORT_STEPS, Scene: ReportScene },
  { name: 'leads', path: '/leads', steps: LEADS_STEPS, Scene: LeadsScene },
  { name: 'admin', path: '/staff', steps: ADMIN_STEPS, Scene: AdminScene },
]

const TICK_MS = 650

/**
 * The homepage's animation: test, report, leads and admin, one after another
 * in one frame. Plays on a loop, and stops on request, off-screen, or for
 * anyone who asks for less motion; stopped, each screen shows finished and the
 * dots move between them.
 *
 * Every screen is drawn in the same grid cell and only the current one is
 * visible, so the frame is as tall as the tallest and never jumps.
 */
export function ProductTour() {
  const [active, setActive] = useState(0)
  const [step, setStep] = useState(0)
  // Bumped each time a screen comes round again, so its entrance replays.
  const [round, setRound] = useState(0)
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
    const id = window.setInterval(() => setStep((s) => s + 1), TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (step >= SCENES[active]!.steps) {
      setActive((a) => (a + 1) % SCENES.length)
      setStep(0)
      setRound((r) => r + 1)
    }
  }, [step, active])

  const still = reduced || !playing

  function show(i: number) {
    setActive(i)
    setStep(0)
    setRound((r) => r + 1)
  }

  return (
    <div ref={root}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-canvas shadow-raised">
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
            aptitudetestai.vercel.app{SCENES[active]!.path}
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
        <div aria-hidden="true" className="grid p-3 sm:p-5">
          {SCENES.map((s, i) => {
            const on = i === active
            return (
              <div
                key={on ? `${s.name}-${round}` : s.name}
                // Remounted when it comes round (the key), so its entrance replays.
                className={cx('[grid-area:1/1]', on ? 'motion-safe:animate-fade-up' : 'pointer-events-none invisible')}
              >
                {/* Off screen or stopped, a screen shows finished. */}
                <s.Scene step={on && !still ? Math.min(step, s.steps - 1) : s.steps - 1} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex justify-center">
        {SCENES.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onClick={() => show(i)}
            aria-label={`Show ${s.name}`}
            aria-current={i === active ? 'true' : undefined}
            className="min-h-tap min-w-tap group inline-flex items-center justify-center rounded-full"
          >
            <span
              className={cx(
                'h-2 rounded-full transition-all duration-300',
                i === active ? 'w-6 bg-brand-700' : 'w-2 bg-slate-300 group-hover:bg-slate-400',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
