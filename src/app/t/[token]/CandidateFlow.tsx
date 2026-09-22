'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTelemetry, useCountdown, formatClock } from './hooks'
import type { Choice } from '@/lib/types'

interface Question {
  position: number
  subject: string
  format: 'mcq' | 'numeric'
  stem: string
  options: Record<Choice, string> | null
}

interface SavedAnswer {
  position: number
  choice: Choice | null
  numeric_value: number | null
}

type Stage = 'consent' | 'identity' | 'handover' | 'instructions' | 'running' | 'done'

const CHOICES: Choice[] = ['A', 'B', 'C', 'D']
/** Countdown milestones announced to screen readers, in seconds. */
const ANNOUNCE_AT = [300, 60, 30]

export function CandidateFlow({
  token,
  candidateName,
  expiresAt,
}: {
  token: string
  candidateName: string
  expiresAt: string
}) {
  const windowEndsAt = new Date(expiresAt).getTime()

  const [stage, setStage] = useState<Stage>('consent')
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
      setStage('handover')
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

  if (stage === 'consent') return <Consent onAgree={() => setStage('identity')} />
  if (stage === 'identity') {
    return <Identity onSubmit={doIdentify} busy={busy} error={error} />
  }
  if (stage === 'handover') {
    return <Handover name={candidateName} onReady={() => setStage('instructions')} />
  }
  if (stage === 'instructions') {
    return <Instructions expiresAt={windowEndsAt} onStart={doStart} busy={busy} error={error} />
  }
  if (stage === 'done') return <Done />

  const question = questions.find((q) => q.position === current)
  const answered = questions.filter((q) => isAnswered(answers[q.position])).length

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-8">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-sm text-slate-500">
          Question {current} of {questions.length}
        </span>
        <span
          className={`font-mono text-base tabular-nums ${
            (remainingMs ?? Infinity) <= 60_000 ? 'text-red-600' : 'text-slate-900'
          }`}
        >
          {formatClock(remainingMs)}
        </span>
      </header>

      {hidden && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Timer paused.
        </p>
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
        current={current}
        onGoTo={goTo}
        reviewing={reviewing}
      />

      <nav className="mt-4 flex gap-3">
        <button
          type="button"
          className="min-h-tap flex-1 rounded border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          onClick={() => goTo(current - 1)}
          disabled={current <= 1 || reviewing}
        >
          Previous
        </button>
        {current < questions.length ? (
          <button
            type="button"
            className="min-h-tap flex-1 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => goTo(current + 1)}
            disabled={reviewing}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="min-h-tap flex-1 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setReviewing(true)}
            disabled={reviewing}
          >
            Review &amp; submit
          </button>
        )}
      </nav>
    </main>
  )
}

function isAnswered(a: { choice: Choice | null; numeric: string } | undefined): boolean {
  return a != null && (a.choice !== null || a.numeric.trim() !== '')
}

// ── screens ─────────────────────────────────────────────────────────────────

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function Consent({ onAgree }: { onAgree: () => void }) {
  return (
    <Shell title="Before the test begins">
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
        <p>
          This message was sent to you as the parent or guardian. Please read this before handing the
          phone over.
        </p>
        <p>
          We will record the answers given, how long each question takes, and basic technical
          information about this device and connection — the browser, screen size and network address.
          This is used only to assess the candidate for admission, is seen only by institute staff, and
          is kept for 12 months.
        </p>
        <p>The result is not shown to the candidate and is not shared outside the institute.</p>
      </div>
      <button
        type="button"
        className="min-h-tap mt-5 w-full rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white"
        onClick={onAgree}
      >
        I am the parent or guardian, and I agree
      </button>
    </Shell>
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
    <Shell title="Confirm your number">
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Enter the mobile number this link was sent to.
      </p>
      <form
        className="mt-4"
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
          className="min-h-tap w-full rounded border border-slate-300 px-3 py-3 text-base"
          placeholder="10-digit mobile number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          aria-describedby={error ? 'mobile-error' : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p id="mobile-error" role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="min-h-tap mt-4 w-full rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </Shell>
  )
}

function Handover({ name, onReady }: { name: string; onReady: () => void }) {
  return (
    <Shell title="Please hand the phone over">
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        This test is for <span className="font-semibold text-slate-900">{name}</span>, who should
        answer it on their own. Please pass them the phone now.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        The questions test reasoning, not memory — there is nothing to revise, and help from anyone
        else only makes the result less useful to us.
      </p>
      <button
        type="button"
        className="min-h-tap mt-5 w-full rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white"
        onClick={onReady}
      >
        I am {name}, and I am ready
      </button>
    </Shell>
  )
}

function Instructions({
  expiresAt,
  onStart,
  busy,
  error,
}: {
  expiresAt: number
  onStart: () => void
  busy: boolean
  error: string
}) {
  const closes = new Date(expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return (
    <Shell title="How the test works">
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
        <li>15 questions — maths, English and science — in 15 minutes.</li>
        <li>One mark for a correct answer. A quarter mark is deducted for a wrong multiple-choice answer; there is no penalty on the type-in questions, or for leaving one blank.</li>
        <li>You can go back and change any answer before submitting.</li>
        <li>
          If you leave this page the timer pauses, but this link stops working at{' '}
          <span className="font-semibold text-slate-900">{closes}</span> whatever happens.
        </li>
        <li>The timer starts when you press Start, not now.</li>
      </ul>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        className="min-h-tap mt-5 w-full rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        onClick={onStart}
        disabled={busy}
      >
        {busy ? 'Starting…' : 'Start the test'}
      </button>
    </Shell>
  )
}

function Done() {
  return (
    <Shell title="Thank you">
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Your answers have been received. The institute will be in touch.
      </p>
    </Shell>
  )
}

// ── running-test pieces ─────────────────────────────────────────────────────

function QuestionView({
  question,
  answer,
  onChoice,
  onNumeric,
  onNumericCommit,
}: {
  question: Question
  answer: { choice: Choice | null; numeric: string } | undefined
  onChoice: (position: number, choice: Choice) => void
  onNumeric: (position: number, value: string) => void
  onNumericCommit: (position: number) => void
}) {
  return (
    <section className="mt-5" aria-labelledby={`q-${question.position}`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{question.subject}</p>
      <h2 id={`q-${question.position}`} className="mt-1 text-base leading-relaxed text-slate-900">
        {question.stem}
      </h2>

      {question.format === 'mcq' && question.options ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Choose one answer</legend>
          {CHOICES.map((choice) => {
            const selected = answer?.choice === choice
            return (
              <label
                key={choice}
                className={`min-h-tap flex cursor-pointer items-start gap-3 rounded border px-3 py-3 text-sm ${
                  selected ? 'border-slate-900 bg-slate-50' : 'border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name={`q-${question.position}`}
                  className="mt-0.5"
                  checked={selected}
                  onChange={() => onChoice(question.position, choice)}
                />
                <span>
                  <span className="font-semibold text-slate-500">{choice}.</span>{' '}
                  {question.options![choice]}
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <div className="mt-4">
          <label htmlFor={`n-${question.position}`} className="text-sm text-slate-600">
            Type your answer as a number
          </label>
          <input
            id={`n-${question.position}`}
            type="text"
            inputMode="decimal"
            className="min-h-tap mt-2 w-full rounded border border-slate-300 px-3 py-3 text-base"
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
  current,
  onGoTo,
  reviewing,
}: {
  questions: Question[]
  answers: Record<number, { choice: Choice | null; numeric: string }>
  current: number
  onGoTo: (position: number) => void
  reviewing: boolean
}) {
  return (
    <nav className="mt-6 border-t border-slate-200 pt-4" aria-label="Questions">
      <ul className="flex flex-wrap gap-2">
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
                className={`min-h-tap min-w-tap rounded text-sm font-medium ${
                  isCurrent
                    ? 'bg-slate-900 text-white'
                    : done
                      ? 'bg-slate-200 text-slate-900'
                      : 'border border-slate-300 text-slate-500'
                }`}
              >
                {q.position}
              </button>
            </li>
          )
        })}
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
    <section className="mt-5">
      <h2 className="text-base font-semibold text-slate-900">Ready to submit?</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
                <button
                  type="button"
                  className="min-h-tap rounded border border-slate-300 px-3 text-sm"
                  onClick={() => onGoTo(q.position)}
                >
                  Go to {q.position}
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="min-h-tap flex-1 rounded border border-slate-300 px-4 py-3 text-sm font-medium"
          onClick={onBack}
        >
          Keep working
        </button>
        <button
          type="button"
          className="min-h-tap flex-1 rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white"
          onClick={onSubmit}
        >
          Submit
        </button>
      </div>
    </section>
  )
}
