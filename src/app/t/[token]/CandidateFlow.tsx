'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTelemetry, useCountdown, formatClock } from './hooks'
import type { Choice } from '@/lib/types'
import { Icon } from '@/components/icons'
import { Alert, Avatar, Badge, Mark, btn, card, control, cx } from '@/components/ui'
import { Shell } from './Shell'

interface Question {
  position: number
  subject: string
  part: 'basics' | 'syllabus'
  format: 'mcq' | 'numeric'
  stem: string
  options: Record<Choice, string> | null
}

interface SavedAnswer {
  position: number
  choice: Choice | null
  numeric_value: number | null
}

type Stage = 'identity' | 'instructions' | 'running' | 'done'

const CHOICES: Choice[] = ['A', 'B', 'C', 'D']
/** Countdown milestones announced to screen readers, in seconds. */
const ANNOUNCE_AT = [300, 60, 30]

export function CandidateFlow({
  token,
  candidateName,
  expiresAt,
  questionCount,
  minutes,
  syllabusClass,
}: {
  token: string
  candidateName: string
  expiresAt: string
  questionCount: number
  minutes: number
  /** Class N−1 on a 30-question paper; null on the 15-question one. */
  syllabusClass: number | null
}) {
  const windowEndsAt = new Date(expiresAt).getTime()

  const [stage, setStage] = useState<Stage>('identity')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<number, { choice: Choice | null; numeric: string }>>({})
  const [current, setCurrent] = useState(1)
  const [reviewing, setReviewing] = useState(false)

  const [startedAt, setStartedAt] = useState<number | null>(null)
  const { record, flush } = useTelemetry(attemptId, startedAt)
  const submitting = useRef(false)
  const questionEnteredAt = useRef(Date.now())
  const dwell = useRef<Record<number, number>>({})

  // ── submit ────────────────────────────────────────────────────────────────

  const submit = useCallback(
    async (reason: 'manual' | 'timer' | 'window') => {
      if (submitting.current || !attemptId) return
      submitting.current = true
      await flush()
      try {
        await fetch('/api/t/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, reason }),
          keepalive: true,
        })
      } catch {
        /* the server auto-submits on expiry regardless; never strand them here */
      }
      setStage('done')
    },
    [attemptId, flush],
  )

  // ── timer ─────────────────────────────────────────────────────────────────

  /**
   * On returning to the tab, ask the server for the deadline again.
   *
   * Start is idempotent — it returns the attempt in progress — so resume is
   * not a separate code path, and the deadline that comes back is computed
   * from the server's own event log rather than from anything this page has
   * been counting.
   */
  const resync = useCallback(async () => {
    try {
      const res = await fetch('/api/t/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.ok) setDeadlineAt(new Date(data.deadlineAt).getTime())
    } catch {
      /* keep the local countdown; the server decides at submit anyway */
    }
  }, [token])

  const onVisibility = useCallback(
    (hidden: boolean) => {
      if (!attemptId) return
      record({ kind: hidden ? 'pause' : 'resume', position: current }, true)
      if (!hidden) void resync()
    },
    [attemptId, current, record, resync],
  )

  // Declared after resync and onVisibility, both of which it consumes.
  const { remainingMs, hidden } = useCountdown({
    deadlineAt,
    windowEndsAt,
    onExpire: (reason) => void submit(reason),
    onVisibilityChange: onVisibility,
  })

  // ── screen-reader countdown milestones ────────────────────────────────────

  const [announcement, setAnnouncement] = useState('')
  const announced = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (remainingMs === null) return
    const seconds = Math.ceil(remainingMs / 1000)
    for (const mark of ANNOUNCE_AT) {
      if (seconds <= mark && !announced.current.has(mark)) {
        announced.current.add(mark)
        setAnnouncement(mark >= 60 ? `${mark / 60} minutes remaining` : `${mark} seconds remaining`)
      }
    }
  }, [remainingMs])

  // ── answer saving ─────────────────────────────────────────────────────────

  const saveAnswer = useCallback(
    async (position: number, choice: Choice | null, numeric: string) => {
      if (!attemptId) return
      const spent = dwell.current[position] ?? 0
      try {
        await fetch('/api/t/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attemptId,
            position,
            choice,
            numericValue: numeric === '' ? null : numeric,
            activeMs: spent + (Date.now() - questionEnteredAt.current),
          }),
        })
      } catch {
        // Answers are kept locally too, and re-sent on submit, so a dropped
        // save is not a lost answer.
      }
    },
    [attemptId],
  )

  const setChoice = (position: number, choice: Choice) => {
    setAnswers((prev) => ({ ...prev, [position]: { choice, numeric: '' } }))
    record({ kind: 'answer_set', position, payload: { to: choice } })
    void saveAnswer(position, choice, '')
  }

  const setNumeric = (position: number, numeric: string) => {
    setAnswers((prev) => ({ ...prev, [position]: { choice: null, numeric } }))
  }

  const commitNumeric = (position: number) => {
    const value = answers[position]?.numeric ?? ''
    record({ kind: 'answer_set', position, payload: { to: value } })
    void saveAnswer(position, null, value)
  }

  // ── navigation ────────────────────────────────────────────────────────────

  const goTo = (position: number) => {
    const spent = Date.now() - questionEnteredAt.current
    dwell.current[current] = (dwell.current[current] ?? 0) + spent
    questionEnteredAt.current = Date.now()
    record({ kind: 'nav', position, payload: { from: current } })
    setCurrent(position)
    setReviewing(false)
  }

  // ── copy / paste signals ──────────────────────────────────────────────────

  useEffect(() => {
    if (stage !== 'running') return
    const onPaste = () => record({ kind: 'paste', position: current }, true)
    const onCopy = () => record({ kind: 'copy', position: current })
    document.addEventListener('paste', onPaste)
    document.addEventListener('copy', onCopy)
    return () => {
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('copy', onCopy)
    }
  }, [stage, current, record])

  // ── stage transitions ─────────────────────────────────────────────────────

  async function doIdentify(mobile: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/t/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mobile }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'That number does not match this link.')
        return
      }
      setStage('instructions')
    } catch {
      setError('Could not reach the server. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function doStart() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/t/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, screen: `${window.screen.width}x${window.screen.height}` }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Could not start the test.')
        return
      }

      setAttemptId(data.attemptId)
      setDeadlineAt(new Date(data.deadlineAt).getTime())
      setQuestions(data.questions)
      setAnswers(
        Object.fromEntries(
          (data.answers as SavedAnswer[]).map((a) => [
            a.position,
            { choice: a.choice, numeric: a.numeric_value === null ? '' : String(a.numeric_value) },
          ]),
        ),
      )
      questionEnteredAt.current = Date.now()
      // Local instant the attempt began. Events carry a RELATIVE offset from
      // it, so telemetry survives flush-time clustering without a clock to trust.
      setStartedAt(Date.now())
      setStage('running')
    } catch {
      setError('Could not reach the server. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  // Consent is taken on the recorded call before the link is sent, so the
  // link opens on the number check (2026-10-11).
  if (stage === 'identity') {
    return <Identity onSubmit={doIdentify} busy={busy} error={error} />
  }
  if (stage === 'instructions') {
    return (
      <Instructions
        name={candidateName}
        expiresAt={windowEndsAt}
        questionCount={questionCount}
        minutes={minutes}
        syllabusClass={syllabusClass}
        onStart={doStart}
        busy={busy}
        error={error}
      />
    )
  }
  if (stage === 'done') return <Done />

  const question = questions.find((q) => q.position === current)
  const answered = questions.filter((q) => isAnswered(answers[q.position])).length

  return (
    <div className="flex min-h-screen flex-col">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex items-center gap-2.5">
            <Mark labelClassName="sr-only" />
            <span className="text-sm font-medium text-slate-700">
              Question <span className="font-semibold tabular-nums text-slate-900">{current}</span> of{' '}
              <span className="tabular-nums">{questions.length}</span>
            </span>
          </span>
          <TimerPill remainingMs={remainingMs} />
        </div>
        <div aria-hidden="true" className="h-1 bg-slate-100">
          <div
            className="h-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}
          />
        </div>
      </header>

      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-4 ${reviewing ? 'pb-10' : 'pb-28'}`}>
        {hidden && (
          <Alert tone="warning" className="mb-4">
            Timer paused.
          </Alert>
        )}

        {reviewing ? (
          <Review
            questions={questions}
            answers={answers}
            answered={answered}
            onGoTo={goTo}
            onSubmit={() => void submit('manual')}
            onBack={() => setReviewing(false)}
          />
        ) : (
          question && (
            <QuestionView
              question={question}
              syllabusClass={syllabusClass}
              answer={answers[question.position]}
              onChoice={setChoice}
              onNumeric={setNumeric}
              onNumericCommit={commitNumeric}
            />
          )
        )}

        <Palette
          questions={questions}
          answers={answers}
          answered={answered}
          current={current}
          onGoTo={goTo}
          reviewing={reviewing}
        />
      </main>

      {/* Kept on screen, so a long question never hides the way on. The review
          screen has its own buttons, so the bar steps aside for it. */}
      {!reviewing && (
        <nav
          aria-label="Previous and next question"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/85"
        >
          <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">
            <button
              type="button"
              className={`${btn('secondary', 'lg')} flex-1`}
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
              Previous
            </button>
            {current < questions.length ? (
              <button type="button" className={`${btn('primary', 'lg')} flex-1`} onClick={() => goTo(current + 1)}>
                Next
                <Icon name="chevronRight" className="h-5 w-5" />
              </button>
            ) : (
              <button type="button" className={`${btn('primary', 'lg')} flex-1`} onClick={() => setReviewing(true)}>
                Review &amp; submit
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

function isAnswered(a: { choice: Choice | null; numeric: string } | undefined): boolean {
  return a != null && (a.choice !== null || a.numeric.trim() !== '')
}

/** Calm until five minutes are left, amber then, red in the last minute. */
function TimerPill({ remainingMs }: { remainingMs: number | null }) {
  const left = remainingMs ?? Infinity
  const tone =
    left <= 60_000
      ? 'bg-rose-100 text-rose-800 ring-rose-200'
      : left <= 300_000
        ? 'bg-amber-100 text-amber-900 ring-amber-200'
        : 'bg-slate-100 text-slate-900 ring-slate-200'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ring-inset ${tone}`}>
      <Icon name="clock" className="h-4 w-4" />
      <span className="text-base font-semibold tabular-nums">{formatClock(remainingMs)}</span>
    </span>
  )
}

// ── screens ─────────────────────────────────────────────────────────────────

const lead = 'mt-2 text-[15px] leading-relaxed text-slate-600'
const fullWidth = `${btn('primary', 'lg')} mt-6 w-full`

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700">
      <Icon name="alert" className="mt-0.5 h-4 w-4" />
      {children}
    </p>
  )
}

function Identity({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (mobile: string) => void
  busy: boolean
  error: string
}) {
  const [mobile, setMobile] = useState('')
  return (
    <Shell title="Confirm your number" icon="phone" step={1}>
      <p className={lead}>Enter the mobile number this link was sent to.</p>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(mobile)
        }}
      >
        <label htmlFor="mobile" className="sr-only">
          Mobile number
        </label>
        <input
          id="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          className={cx(control, 'block w-full py-3 text-lg tracking-wide')}
          placeholder="10-digit mobile number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          aria-describedby={error ? 'mobile-error' : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error && <FieldError id="mobile-error">{error}</FieldError>}
        <button type="submit" className={fullWidth} disabled={busy}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </Shell>
  )
}

function Instructions({
  name,
  expiresAt,
  questionCount,
  minutes,
  syllabusClass,
  onStart,
  busy,
  error,
}: {
  name: string
  expiresAt: number
  questionCount: number
  minutes: number
  syllabusClass: number | null
  onStart: () => void
  busy: boolean
  error: string
}) {
  const closes = new Date(expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return (
    <Shell title="How the test works" icon="book" step={2}>
      {/* Names who should answer: breaking that becomes a choice, not an ambiguity. */}
      <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-100">
        <Avatar name={name} className="h-11 w-11 bg-white text-sm" />
        <p className="text-sm leading-relaxed text-slate-700">
          This test is for <span className="font-semibold text-slate-900">{name}</span>, who should answer it on their
          own.
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat value={String(questionCount)} label="questions" />
        <Stat value={String(minutes)} label="minutes" />
        <Stat value={closes} label="link closes" />
      </dl>
      <ul className="mt-5 space-y-3 text-sm leading-relaxed text-slate-700">
        <Rule>
          {questionCount} questions — maths, English and science — in {minutes} minutes.
        </Rule>
        {syllabusClass !== null && (
          <Rule>
            Some maths and science questions are from the Class {syllabusClass} syllabus; each question is marked
            either Basics or Class {syllabusClass}.
          </Rule>
        )}
        <Rule>One mark for a correct answer. A quarter mark is deducted for a wrong multiple-choice answer; there is no penalty on the type-in questions, or for leaving one blank.</Rule>
        <Rule>You can go back and change any answer before submitting.</Rule>
        <Rule>
          If you leave this page the timer pauses, but this link stops working at{' '}
          <span className="font-semibold text-slate-900">{closes}</span> whatever happens.
        </Rule>
        <Rule>The timer starts when you press Start, not now.</Rule>
      </ul>
      {error && <FieldError>{error}</FieldError>}
      <button type="button" className={fullWidth} onClick={onStart} disabled={busy}>
        {busy ? 'Starting…' : 'Start the test'}
      </button>
    </Shell>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-slate-50 px-2 py-3 ring-1 ring-inset ring-slate-200">
      <dt className="mt-0.5 text-xs text-slate-600">{label}</dt>
      <dd className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-900 sm:text-lg">{value}</dd>
    </div>
  )
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Icon name="check" className="mt-1 h-4 w-4 text-brand-600" />
      <span>{children}</span>
    </li>
  )
}

function Done() {
  return (
    <Shell title="Thank you" icon="checkCircle" tone="success">
      <p className={lead}>Your answers have been received. The institute will be in touch.</p>
    </Shell>
  )
}

// ── running-test pieces ─────────────────────────────────────────────────────

function QuestionView({
  question,
  syllabusClass,
  answer,
  onChoice,
  onNumeric,
  onNumericCommit,
}: {
  question: Question
  syllabusClass: number | null
  answer: { choice: Choice | null; numeric: string } | undefined
  onChoice: (position: number, choice: Choice) => void
  onNumeric: (position: number, value: string) => void
  onNumericCommit: (position: number) => void
}) {
  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby={`q-${question.position}`}>
      <p className="flex flex-wrap gap-2">
        <Badge tone="brand" className="capitalize">
          {question.subject}
        </Badge>
        {syllabusClass !== null && (
          <Badge tone={question.part === 'syllabus' ? 'accent' : 'neutral'}>
            {question.part === 'syllabus' ? `Class ${syllabusClass}` : 'Basics'}
          </Badge>
        )}
      </p>
      <h2 id={`q-${question.position}`} className="mt-3 text-[17px] leading-relaxed text-slate-900">
        {question.stem}
      </h2>

      {question.format === 'mcq' && question.options ? (
        <fieldset className="mt-5 space-y-2.5">
          <legend className="sr-only">Choose one answer</legend>
          {CHOICES.map((choice) => {
            const selected = answer?.choice === choice
            return (
              <label key={choice} className="block cursor-pointer">
                <input
                  type="radio"
                  name={`q-${question.position}`}
                  className="peer sr-only"
                  checked={selected}
                  onChange={() => onChoice(question.position, choice)}
                />
                {/* The radio is hidden; this card is what is seen, so it carries the focus ring. */}
                <span
                  className={`min-h-tap flex items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-[15px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 ${
                    selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                      selected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {selected ? <Icon name="check" className="h-4 w-4" /> : choice}
                  </span>
                  <span className="pt-0.5 text-slate-900">
                    <span className="sr-only">{choice}. </span>
                    {question.options![choice]}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <div className="mt-5">
          <label htmlFor={`n-${question.position}`} className="text-sm font-medium text-slate-700">
            Type your answer as a number
          </label>
          <input
            id={`n-${question.position}`}
            type="text"
            inputMode="decimal"
            className={cx(control, 'mt-2 block w-full py-3 text-lg')}
            value={answer?.numeric ?? ''}
            onChange={(e) => onNumeric(question.position, e.target.value)}
            onBlur={() => onNumericCommit(question.position)}
          />
        </div>
      )}
    </section>
  )
}

function Palette({
  questions,
  answers,
  answered,
  current,
  onGoTo,
  reviewing,
}: {
  questions: Question[]
  answers: Record<number, { choice: Choice | null; numeric: string }>
  answered: number
  current: number
  onGoTo: (position: number) => void
  reviewing: boolean
}) {
  return (
    <nav className={`${card} mt-4 p-4`} aria-label="Questions">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">All questions</h2>
        <p className="text-xs text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{answered}</span> of {questions.length} answered
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
        {questions.map((q) => {
          const done = isAnswered(answers[q.position])
          const isCurrent = !reviewing && q.position === current
          return (
            <li key={q.position}>
              <button
                type="button"
                onClick={() => onGoTo(q.position)}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Question ${q.position}, ${done ? 'answered' : 'not answered'}`}
                className={`min-h-tap w-full rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                  isCurrent
                    ? 'bg-brand-700 text-white shadow-sm'
                    : done
                      ? 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100'
                      : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {q.position}
              </button>
            </li>
          )
        })}
      </ul>
      <ul aria-hidden="true" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-700" /> Current
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-50 ring-1 ring-inset ring-brand-200" /> Answered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-white ring-1 ring-inset ring-slate-300" /> Not answered
        </li>
      </ul>
    </nav>
  )
}

function Review({
  questions,
  answers,
  answered,
  onGoTo,
  onSubmit,
  onBack,
}: {
  questions: Question[]
  answers: Record<number, { choice: Choice | null; numeric: string }>
  answered: number
  onGoTo: (position: number) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const unanswered = questions.length - answered
  return (
    <section className={`${card} p-5 sm:p-6`}>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">Ready to submit?</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-200">
          <p className="text-2xl font-semibold tabular-nums text-emerald-800">{answered}</p>
          <p className="text-xs text-emerald-800">answered</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{unanswered}</p>
          <p className="text-xs text-slate-600">not answered</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        {unanswered === 0
          ? 'You have answered every question.'
          : `${unanswered} question${unanswered === 1 ? '' : 's'} not answered. Blank answers score zero, but there is no penalty for them.`}
      </p>
      {unanswered > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {questions
            .filter((q) => !isAnswered(answers[q.position]))
            .map((q) => (
              <li key={q.position}>
                <button type="button" className={btn('secondary', 'sm')} onClick={() => onGoTo(q.position)}>
                  Go to {q.position}
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-6 flex gap-3">
        <button type="button" className={`${btn('secondary', 'lg')} flex-1`} onClick={onBack}>
          Keep working
        </button>
        <button type="button" className={`${btn('primary', 'lg')} flex-1`} onClick={onSubmit}>
          Submit
        </button>
      </div>
    </section>
  )
}
