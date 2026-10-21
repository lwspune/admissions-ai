'use client'

import { useEffect, useRef, useState } from 'react'
import type { ApplicantQuestion } from '@/lib/hiring'
import { istTime, parseTypedAnswer } from '@/lib/hiring'
import type { Choice } from '@/lib/types'
import { Icon } from '@/components/icons'
import { Avatar, Badge, Mark, btn, card, control, cx } from '@/components/ui'
import { Shell } from '@/app/t/[token]/Shell'
import { useCountdown, formatClock } from '@/app/t/[token]/hooks'

// The applicant's side of the teacher screening test: number, instructions,
// fifteen questions, submit. Built on the admissions test's screens, with two
// differences: the clock does not pause (copying is accepted for this screen,
// HIRING_TEST_SPEC.md), and question text arrives as HTML because the maths is
// drawn by KaTeX on the server (toApplicantPaper escapes everything else).

type Stage = 'identity' | 'instructions' | 'running' | 'done'
type Answer = { choice: Choice | null; typed: string }

const CHOICES: Choice[] = ['A', 'B', 'C', 'D']
const ANNOUNCE_AT = [300, 60, 30]
const lead = 'mt-2 text-[15px] leading-relaxed text-slate-600'
const fullWidth = `${btn('primary', 'lg')} mt-6 w-full`

/** Server-built HTML: KaTeX output and escaped text only (mathToHtml). */
function Html({ html, className, id }: { html: string; className?: string; id?: string }) {
  return <span id={id} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

export function HiringFlow({
  token,
  applicantName,
  subject,
  expiresAt,
  questionCount,
  minutes,
  started,
}: {
  token: string
  applicantName: string
  subject: string
  expiresAt: string
  questionCount: number
  minutes: number
  /** An attempt is under way: after the number, go straight back to it. */
  started: boolean
}) {
  const [stage, setStage] = useState<Stage>('identity')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [questions, setQuestions] = useState<ApplicantQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [typedError, setTypedError] = useState<Record<number, string>>({})
  const [current, setCurrent] = useState(1)
  const [reviewing, setReviewing] = useState(false)
  const submitting = useRef(false)
  // Saves not yet answered by the server. Submitting waits for them, so the
  // last answer typed is never graded as blank.
  const inFlight = useRef(new Set<Promise<unknown>>())
  // The typed answer last sent per question, so leaving one unchanged (or
  // never filled) sends nothing.
  const lastTyped = useRef<Record<number, number | null>>({})

  const post = async (path: string, body: object) => {
    const res = await fetch(`/api/h/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: path === 'submit',
    })
    return res.json()
  }

  const save = (position: number, choice: Choice | null, numericValue: number | null) => {
    if (!attemptId) return
    // A dropped save is retried by the next change; the answer stays on screen.
    const pending = post('answer', { attemptId, position, choice, numericValue }).catch(() => {})
    inFlight.current.add(pending)
    void pending.finally(() => inFlight.current.delete(pending))
  }

  /** Saves the typed answer on screen, if it is a valid one. False if it is not. */
  const commitTyped = (position: number): boolean => {
    if (questions.find((q) => q.position === position)?.format !== 'numeric') return true
    const value = parseTypedAnswer(answers[position]?.typed ?? '')
    if (value === 'invalid') {
      setTypedError((prev) => ({ ...prev, [position]: 'Enter a whole number from 0 to 9999.' }))
      return false
    }
    setTypedError((prev) => ({ ...prev, [position]: '' }))
    if ((lastTyped.current[position] ?? null) === value) return true
    lastTyped.current[position] = value
    save(position, null, value)
    return true
  }

  const submit = async (reason: 'manual' | 'timer') => {
    if (submitting.current || !attemptId) return
    submitting.current = true
    commitTyped(current)
    await Promise.allSettled([...inFlight.current])
    try {
      await post('submit', { attemptId, reason })
    } catch {
      /* the server closes a timed-out attempt itself; never strand them here */
    }
    setStage('done')
  }

  // The deadline is the server's and does not move. The window does not cap a
  // started paper, so it plays no part here.
  const { remainingMs } = useCountdown({
    deadlineAt,
    windowEndsAt: Number.POSITIVE_INFINITY,
    onExpire: () => void submit('timer'),
    onVisibilityChange: () => {},
  })

  const [announcement, setAnnouncement] = useState('')
  const announced = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (remainingMs === null) return
    const seconds = Math.ceil(remainingMs / 1000)
    for (const mark of ANNOUNCE_AT) {
      if (seconds <= mark && !announced.current.has(mark)) {
        announced.current.add(mark)
        setAnnouncement(mark >= 60 ? `${mark / 60} minutes left` : `${mark} seconds left`)
      }
    }
  }, [remainingMs])

  const setChoice = (position: number, choice: Choice) => {
    setAnswers((prev) => ({ ...prev, [position]: { choice, typed: '' } }))
    save(position, choice, null)
  }

  const goTo = (position: number) => {
    // Leaving a typed answer saves it, as a blur would; a tap does not always blur.
    commitTyped(current)
    setCurrent(position)
    setReviewing(false)
    window.scrollTo({ top: 0 })
  }

  async function doIdentify() {
    setBusy(true)
    setError('')
    try {
      const data = await post('identify', { token, mobile })
      if (!data.ok) {
        setError(data.error ?? 'That number does not match this link.')
        return
      }
      if (started) await doStart()
      else setStage('instructions')
    } catch {
      setError('You seem to be offline. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function doStart() {
    setBusy(true)
    setError('')
    try {
      const data = await post('start', { token, mobile })
      if (!data.ok) {
        setError(data.error ?? 'The test could not be started. Try again.')
        return
      }
      setAttemptId(data.attemptId)
      setDeadlineAt(new Date(data.deadlineAt).getTime())
      setQuestions(data.questions)
      const saved = data.answers as { position: number; choice: Choice | null; numericValue: number | null }[]
      setAnswers(
        Object.fromEntries(
          saved.map((a) => [a.position, { choice: a.choice, typed: a.numericValue === null ? '' : String(a.numericValue) }]),
        ),
      )
      for (const a of saved) if (a.numericValue !== null) lastTyped.current[a.position] = a.numericValue
      setStage('running')
    } catch {
      setError('You seem to be offline. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'identity') {
    return (
      <Shell title="Confirm your number" icon="phone" step={1}>
        <p className={lead}>Enter the mobile number this link was sent to.</p>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault()
            void doIdentify()
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

  if (stage === 'instructions') {
    const closes = istTime(expiresAt)
    return (
      <Shell title={`${subject} screening test`} icon="book" step={2}>
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-100">
          <Avatar name={applicantName} className="h-11 w-11 bg-white text-sm" />
          <p className="text-sm leading-relaxed text-slate-700">
            For <span className="font-semibold text-slate-900">{applicantName}</span>
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={String(questionCount)} label="questions" />
          <Stat value={String(minutes)} label="minutes" />
          <Stat value={closes} label="start by" />
        </dl>
        <ul className="mt-5 space-y-3 text-sm leading-relaxed text-slate-700">
          <Rule>
            {questionCount} questions from real {subject.toLowerCase()} exam papers, in {minutes} minutes.
          </Rule>
          <Rule>Multiple choice: +1 for a right answer, −¼ for a wrong one, 0 if you leave it.</Rule>
          {subject !== 'English' && <Rule>The last three ask you to type a whole number: +1 if right, nothing off if wrong.</Rule>}
          <Rule>Move between questions and change answers freely until you submit.</Rule>
          <Rule>
            <span className="font-semibold text-slate-900">The clock does not stop</span> once you start, even if you
            leave the page. When time is up, your answers are submitted as they stand.
          </Rule>
          <Rule>Answers save as you go. If you lose your connection, open the link again.</Rule>
          <Rule>
            <span className="font-semibold text-slate-900">In the interview you may be asked to solve and explain</span>{' '}
            questions from this test.
          </Rule>
        </ul>
        {error && <FieldError>{error}</FieldError>}
        <button type="button" className={fullWidth} onClick={() => void doStart()} disabled={busy}>
          {busy ? 'Starting…' : 'Start the test'}
        </button>
      </Shell>
    )
  }

  if (stage === 'done') {
    return (
      <Shell title="Your test is submitted" icon="checkCircle" tone="success">
        <p className={lead}>Thank you. The institute has your answers and will be in touch.</p>
      </Shell>
    )
  }

  const question = questions.find((q) => q.position === current)
  const isAnswered = (p: number) => {
    const a = answers[p]
    // A typed answer counts only when it is one the test accepts.
    return a != null && (a.choice !== null || typeof parseTypedAnswer(a.typed) === 'number')
  }
  const answered = questions.filter((q) => isAnswered(q.position)).length

  return (
    <div className="flex min-h-screen flex-col">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex items-center gap-2.5">
            <Mark labelClassName="sr-only" />
            <span className="whitespace-nowrap text-sm font-medium text-slate-700">
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
        {reviewing ? (
          <section className={`${card} p-5 sm:p-6`}>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Ready to submit?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {answered} of {questions.length} answered.
              {answered < questions.length ? ' You can still go back to the others.' : ''} Once submitted, answers cannot be changed.
            </p>
            {answered < questions.length && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {questions
                  .filter((q) => !isAnswered(q.position))
                  .map((q) => (
                    <li key={q.position}>
                      <button type="button" className={btn('secondary', 'sm')} onClick={() => goTo(q.position)}>
                        Question {q.position}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" className={`${btn('secondary', 'lg')} flex-1`} onClick={() => setReviewing(false)}>
                Keep working
              </button>
              <button type="button" className={`${btn('primary', 'lg')} flex-1`} onClick={() => void submit('manual')}>
                Submit
              </button>
            </div>
          </section>
        ) : (
          question && (
            <section className={`${card} p-5 sm:p-6`} aria-labelledby={`q-${question.position}`}>
              <Badge tone="brand">{question.format === 'mcq' ? 'Choose one' : 'Type a whole number'}</Badge>
              {question.direction && <Html html={question.direction} className="mt-3 block text-sm italic text-slate-600" />}
              <h2 className="mt-3 text-[17px] font-normal leading-relaxed text-slate-900">
                <Html id={`q-${question.position}`} html={question.stem} />
              </h2>

              {question.format === 'mcq' && question.options ? (
                <fieldset className="mt-5 space-y-2.5">
                  <legend className="sr-only">Choose one answer</legend>
                  {CHOICES.map((choice) => {
                    const selected = answers[question.position]?.choice === choice
                    return (
                      <label key={choice} className="block cursor-pointer">
                        <input
                          type="radio"
                          name={`q-${question.position}`}
                          className="peer sr-only"
                          checked={selected}
                          onChange={() => setChoice(question.position, choice)}
                        />
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
                          <span className="min-w-0 pt-0.5 text-slate-900">
                            <span className="sr-only">{choice}. </span>
                            <Html html={question.options?.[choice] ?? ''} />
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              ) : (
                <div className="mt-5">
                  <label htmlFor={`n-${question.position}`} className="text-sm font-medium text-slate-700">
                    Your answer (a whole number)
                  </label>
                  <input
                    id={`n-${question.position}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={cx(control, 'mt-2 block w-full py-3 text-lg')}
                    value={answers[question.position]?.typed ?? ''}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [question.position]: { choice: null, typed: e.target.value } }))
                    }
                    onBlur={() => commitTyped(question.position)}
                    aria-describedby={typedError[question.position] ? `n-${question.position}-error` : undefined}
                    aria-invalid={typedError[question.position] ? true : undefined}
                  />
                  {typedError[question.position] && (
                    <FieldError id={`n-${question.position}-error`}>{typedError[question.position]}</FieldError>
                  )}
                </div>
              )}
            </section>
          )
        )}

        <nav className={`${card} mt-4 p-4`} aria-label="Questions">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Questions</h2>
            <p className="text-xs text-slate-600">
              <span className="font-semibold tabular-nums text-slate-900">{answered}</span> of {questions.length} answered
            </p>
          </div>
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
            {questions.map((q) => {
              const done = isAnswered(q.position)
              const isCurrent = !reviewing && q.position === current
              return (
                <li key={q.position}>
                  <button
                    type="button"
                    onClick={() => goTo(q.position)}
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
        </nav>
      </main>

      {!reviewing && (
        <nav
          aria-label="Move between questions"
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
                Review and submit
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700">
      <Icon name="alert" className="mt-0.5 h-4 w-4" />
      {children}
    </p>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-slate-50 px-2 py-3 ring-1 ring-inset ring-slate-200">
      <dt className="mt-0.5 text-xs text-slate-600">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</dd>
    </div>
  )
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-brand-600" />
      <span>{children}</span>
    </li>
  )
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
      <span className="sr-only">Time left </span>
      <span className="text-base font-semibold tabular-nums">{formatClock(remainingMs)}</span>
    </span>
  )
}
