// The homepage animation's four screens: mock-ups of the signed-in product,
// drawn with the app's own pieces so they look like it. Every name is invented
// and the question is P8-M1 from the parents' sample paper, already public with
// its answer — never a bank item, whose answer would be published here.
//
// Each scene is a pure function of `step`; ProductTour advances it and cycles
// through them. Nothing here reads data, and the frame is aria-hidden: the
// page's own sentence says what it shows.

import { CANDIDATE_TEXT, LANG_LABEL } from '@/lib/candidateText'
import { issueMessage } from '@/lib/parentPack'
import { Icon } from '@/components/icons'
import { Avatar, Badge, cx } from '@/components/ui'

export interface SceneProps {
  step: number
}

const panel = 'rounded-xl border border-slate-200/80 bg-white shadow-card'
const enter = 'motion-safe:animate-fade-up'
const delay = (i: number) => ({ animationDelay: `${i * 90}ms` })

// ── the test ─────────────────────────────────────────────────────────────────

const QUESTION = {
  en: { stem: 'Find the next number in the series: 7, 10, 16, 25, 37, ___', options: ['49', '52', '55', '61'] },
  hi: { stem: 'श्रेणी की अगली संख्या ज्ञात कीजिए: 7, 10, 16, 25, 37, ___', options: ['49', '52', '55', '61'] },
}

export const TEST_STEPS = 11

export function TestScene({ step }: SceneProps) {
  const chosen = step >= 3 ? 1 : null
  const hindi = step >= 6
  const left = 18 * 60 + 42 - step
  const q = hindi ? QUESTION.hi : QUESTION.en
  const t = CANDIDATE_TEXT[hindi ? 'hi' : 'en']

  return (
    <div className="mx-auto flex max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-canvas shadow-raised">
      <div className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-medium text-slate-700">
            {t.running.question[0]}
            <span className="font-semibold text-slate-900">7</span>
            {t.running.question[1]}30{t.running.question[2]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex rounded-full bg-slate-100 p-0.5 text-xs font-medium">
              <span className={cx('rounded-full px-2 py-1 transition-colors', !hindi ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>
                {LANG_LABEL.en}
              </span>
              <span className={cx('rounded-full px-2 py-1 transition-colors', hindi ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>
                {LANG_LABEL.hi}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-inset ring-slate-200">
              <Icon name="clock" className="h-3.5 w-3.5" />
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          </span>
        </div>
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-brand-600 transition-[width] duration-500" style={{ width: `${((chosen === null ? 6 : 7) / 30) * 100}%` }} />
        </div>
      </div>

      <div className="flex-1 p-3">
        <div className={cx(panel, 'p-4')}>
          <p className="flex gap-2">
            <Badge tone="brand">{t.subject.maths}</Badge>
            <Badge>{t.part.basics}</Badge>
          </p>
          <p key={hindi ? 'hi' : 'en'} className={cx('mt-3 text-[15px] leading-relaxed text-slate-900', enter)}>
            {q.stem}
          </p>
          <div className="mt-4 space-y-2">
            {q.options.map((text, i) => {
              const on = chosen === i
              return (
                <div
                  key={i}
                  className={cx(
                    'flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm transition-colors duration-300',
                    on ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-300',
                      on ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {on ? <Icon name="check" className="h-3.5 w-3.5" /> : 'ABCD'[i]}
                  </span>
                  {text}
                </div>
              )
            })}
          </div>
        </div>
        <p className={cx('mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600 transition-opacity duration-300', chosen === null && 'opacity-0')}>
          <Icon name="checkCircle" className="h-3.5 w-3.5 text-emerald-700" />
          Saved
        </p>
      </div>
    </div>
  )
}

// ── the report ───────────────────────────────────────────────────────────────

// 22 correct, 4 wrong (−0.25 each), 4 skipped: 21. Each subject adds up.
const SECTIONS = [
  { name: 'English', score: 7.75, bar: 'bg-violet-600', track: 'bg-violet-100', parts: null },
  { name: 'Maths', score: 6.5, bar: 'bg-blue-600', track: 'bg-blue-100', parts: 'Basics 4 / 5 · Class 8 2.5 / 5' },
  { name: 'Science', score: 6.75, bar: 'bg-emerald-600', track: 'bg-emerald-100', parts: 'Basics 3.75 / 5 · Class 8 3 / 5' },
]

export const REPORT_STEPS = 11

export function ReportScene({ step }: SceneProps) {
  const filled = step >= 1
  const shown = Math.round(21 * Math.min(1, Math.max(0, step) / 4))
  const r = 34
  const length = 2 * Math.PI * r

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name="Riya Patil" />
        <div>
          <p className="font-semibold text-slate-900">Riya Patil</p>
          <p className="text-xs text-slate-600">Class 9 · 30 questions · 26 of 30 minutes used</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cx(panel, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Score</p>
          <div className="mt-3 flex items-center gap-4">
            <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
              <circle cx="40" cy="40" r={r} fill="none" stroke="#e0e7ff" strokeWidth="9" />
              <circle
                cx="40"
                cy="40"
                r={r}
                fill="none"
                stroke="#4338ca"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={length}
                strokeDashoffset={filled ? length * (1 - 21 / 30) : length}
                className="transition-[stroke-dashoffset] duration-[1600ms] ease-out"
              />
            </svg>
            <div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                {shown}
                <span className="text-lg font-medium text-slate-500"> / 30</span>
              </p>
              <p className={cx('mt-1.5 flex flex-wrap gap-1 transition-opacity duration-500', step < 4 && 'opacity-0')}>
                <Badge tone="success">22 correct</Badge>
                <Badge tone="danger">4 wrong</Badge>
                <Badge>4 skipped</Badge>
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600">No pass mark is computed. Your team sets the bar.</p>
        </div>

        <div className={cx(panel, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Sections</p>
          <ul className="mt-3 space-y-3">
            {SECTIONS.map((s, i) => (
              <li key={s.name}>
                <p className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="tabular-nums text-slate-900">
                    {s.score} <span className="text-slate-500">/ 10</span>
                  </span>
                </p>
                <div className={cx('mt-1 h-2 overflow-hidden rounded-full', s.track)}>
                  <div
                    className={cx('h-full rounded-full transition-[width] duration-1000 ease-out', s.bar)}
                    style={{ width: step >= 2 + i ? `${s.score * 10}%` : '0%', transitionDelay: `${i * 120}ms` }}
                  />
                </div>
                {s.parts && <p className="mt-1 text-xs text-slate-600">{s.parts}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className={cx(
          panel,
          'flex items-center justify-between gap-3 px-4 py-3 transition-all duration-500',
          step >= 6 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        <span className="flex items-center gap-2 text-sm text-slate-700">
          <Icon name="fileText" className="h-4 w-4 text-brand-700" />
          A one-page score summary for the parent
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white">
          <Icon name="printer" className="h-3.5 w-3.5" />
          Save PDF
        </span>
      </div>
    </div>
  )
}

// ── leads ────────────────────────────────────────────────────────────────────

const LEADS = [
  { name: 'Riya Patil', meta: 'Class 9 · NDA', stage: 'New' as const },
  { name: 'Arjun Mehta', meta: 'Class 11 · NDA', stage: 'In EIS' as const, tested: true },
  { name: 'Kabir Shaikh', meta: 'Class 10 · SPI', stage: 'CNR' as const },
  { name: 'Ananya Joshi', meta: 'Class 8 · SPI', stage: 'In EIS' as const },
  { name: 'Vihaan Kulkarni', meta: 'Class 12 · NDA', stage: 'Contacted' as const },
]
const STAGE_TONE = { New: 'neutral', Contacted: 'info', CNR: 'warning', 'In EIS': 'success' } as const

const MESSAGE = issueMessage({ name: 'Riya Patil', testUrl: 'https://aptitudetestai.vercel.app/t/r7Kq2mXa', classLevel: 9 })

export const LEADS_STEPS = 12

export function LeadsScene({ step }: SceneProps) {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="flex flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500">
          <Icon name="search" className="h-4 w-4" />
          Search name or number
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-4 w-4" />
          <span className="hidden sm:inline">Add lead</span>
        </span>
      </div>

      <ul className={cx(panel, 'mt-3 divide-y divide-slate-100')}>
        {LEADS.map((lead, i) => {
          const riya = i === 0
          const stage = riya && step >= 3 ? 'Contacted' : lead.stage
          const issued = riya && step >= 5
          return (
            <li key={lead.name} className={cx('flex items-center gap-3 px-3 py-2.5', enter)} style={delay(i)}>
              <Avatar name={lead.name} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                <p className="text-xs text-slate-600">{lead.meta}</p>
              </div>
              <Badge key={stage} tone={STAGE_TONE[stage]} className={riya ? enter : undefined}>
                {stage}
              </Badge>
              <span
                className={cx(
                  'hidden rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-300 sm:inline-flex',
                  riya && step === 4 ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-slate-300 bg-white text-slate-800',
                )}
              >
                {'tested' in lead ? 'Report' : issued ? 'Reissue' : 'Issue link'}
              </span>
            </li>
          )
        })}
      </ul>

      <div
        className={cx(
          'absolute bottom-0 right-0 w-[min(100%,22rem)] rounded-xl rounded-br-sm bg-[#dcf8c6] p-3 text-[13px] leading-snug text-slate-900 shadow-raised transition-all duration-500',
          step >= 5 ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        )}
      >
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <Icon name="message" className="h-3.5 w-3.5" />
          To the parent, on WhatsApp
        </p>
        <p className="whitespace-pre-line break-words">{MESSAGE}</p>
      </div>
    </div>
  )
}

// ── admin ────────────────────────────────────────────────────────────────────

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
/** The last badge lands at step 9; the rest holds the finished screen. */
export const ADMIN_STEPS = 13

export function AdminScene({ step }: SceneProps) {
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
