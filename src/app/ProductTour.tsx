'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { cx } from '@/components/ui'
import {
  ADMIN_STEPS,
  AdminScene,
  FrameBar,
  LEADS_STEPS,
  LeadsScene,
  REPORT_STEPS,
  ReportScene,
  TEST_STEPS,
  TestScene,
  type SceneProps,
} from './tourScenes'

const SCENES: { id: string; tab: string; path: string; caption: string; steps: number; Scene: (p: SceneProps) => React.ReactNode }[] = [
  {
    id: 'test',
    tab: 'The test',
    path: '/t/r7Kq2mXa',
    caption: 'The applicant answers on the parent’s phone. Every answer saves as it is chosen, the timer pauses if the tab is hidden, and maths and science can be read in Hindi.',
    steps: TEST_STEPS,
    Scene: TestScene,
  },
  {
    id: 'report',
    tab: 'Report',
    path: '/reports/riya-patil',
    caption: 'Graded on the server the moment it ends. Counsellors see the score by subject, and a one-page summary can go to the parent.',
    steps: REPORT_STEPS,
    Scene: ReportScene,
  },
  {
    id: 'leads',
    tab: 'Leads',
    path: '/leads',
    caption: 'Every enquiry in one list, with its stage and history. Issuing a test writes the WhatsApp message for the parent: the link, and the class’s syllabus and sample paper.',
    steps: LEADS_STEPS,
    Scene: LeadsScene,
  },
  {
    id: 'admin',
    tab: 'Admin',
    path: '/staff',
    caption: 'Add telecallers and counsellors, each seeing only what their role needs. The question bank shows which classes are ready for a full paper.',
    steps: ADMIN_STEPS,
    Scene: AdminScene,
  },
]

/** How long each step of a scene shows. */
const TICK_MS = 650

/**
 * The homepage's tour of the signed-in product. Plays on its own, pauses on
 * request, off-screen, or for anyone who asks for less motion — they get each
 * screen finished and still, and move between them with the tabs.
 */
export function ProductTour() {
  const [active, setActive] = useState(0)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      setReduced(query.matches)
      if (query.matches) setPlaying(false)
    }
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
    }
  }, [step, active])

  const scene = SCENES[active]!
  const last = scene.steps - 1
  // Still means finished: a paused or motion-averse visitor sees the whole screen.
  const shown = reduced ? last : Math.min(step, last)

  function choose(i: number) {
    setActive(i)
    setStep(playing && !reduced ? 0 : SCENES[i]!.steps - 1)
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? SCENES.length - 1 : (i + move + SCENES.length) % SCENES.length
    if (move === 0 && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    choose(to)
    tabs.current[to]?.focus()
  }

  return (
    <div ref={root}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Screens of the product" className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card ring-1 ring-slate-200/80">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el
              }}
              id={`tour-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`tour-panel-${s.id}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                'min-h-tap relative shrink-0 overflow-hidden rounded-lg px-3 text-sm font-medium transition-colors sm:px-4',
                i === active ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              {s.tab}
              {i === active && running && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/70 transition-transform duration-500 ease-linear"
                  style={{ transform: `scaleX(${(step + 1) / s.steps})` }}
                />
              )}
            </button>
          ))}
        </div>
        {!reduced && (
          <button
            type="button"
            onClick={() => {
              if (playing) setStep(last)
              else setStep(0)
              setPlaying(!playing)
            }}
            aria-label={playing ? 'Pause the tour' : 'Play the tour'}
            className="min-h-tap min-w-tap inline-flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-white hover:shadow-card"
          >
            <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
      </div>

      <div
        id={`tour-panel-${scene.id}`}
        role="tabpanel"
        aria-labelledby={`tour-tab-${scene.id}`}
        className="mt-4 grid gap-5 lg:grid-cols-[1fr_17rem] lg:items-center"
      >
        <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-slate-200 bg-canvas shadow-raised">
          <FrameBar path={scene.path} />
          <div key={scene.id} className="h-[29rem] p-3 motion-safe:animate-fade-up sm:h-[27rem] sm:p-5">
            <scene.Scene step={shown} />
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-700">{scene.caption}</p>
      </div>
    </div>
  )
}
