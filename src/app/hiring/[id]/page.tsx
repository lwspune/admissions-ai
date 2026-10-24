import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { loadApplicantReport, type HiringReportQuestion, type HiringVerdict } from '@/server/hiring'
import { HIRING_SHAPE, HIRING_SUBJECT_LABEL, istTime, timeUsedMs } from '@/lib/hiring'
import { canHire } from '@/lib/staff'
import { CHOICES } from '@/lib/types'
import { MathText } from '@/components/MathText'
import { StaffShell } from '@/components/StaffShell'
import { Icon } from '@/components/icons'
import { Badge, EmptyState, Eyebrow, PageHeader, card, cx } from '@/components/ui'
import { DecisionControl, History, NoteForm, ResumeControl } from '../ApplicantControls'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Applicant', robots: { index: false, follow: false } }

const VERDICT: Record<HiringVerdict, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  correct: { label: 'Right', tone: 'success' },
  incorrect: { label: 'Wrong', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
}

const STATE_LABEL: Record<string, string> = {
  issued: 'link sent',
  opened: 'opened',
  started: 'started',
  submitted: 'submitted',
  voided: 'replaced by a newer link',
}

const when = istTime
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`

/** One applicant's answers, question by question, for the teacher who added them or superadmin (RLS). */
export default async function ApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staff = await currentStaff()
  if (!staff) redirect(`/login?next=/hiring/${id}`)
  if (!canHire(staff.role)) notFound()

  const report = await loadApplicantReport(await userClient(), id)
  if (!report) notFound()
  const { applicant, attempt, test, questions } = report
  const total = HIRING_SHAPE[applicant.subject].mcq + HIRING_SHAPE[applicant.subject].numeric
  const used = attempt && test ? timeUsedMs({ started_at: attempt.startedAt, submitted_at: attempt.submittedAt }, test.limitMinutes) : null

  return (
    <StaffShell staff={staff} width="narrow">
      <Link href="/hiring" className="min-h-tap inline-flex items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="chevronLeft" className="h-4 w-4" />
        Hiring
      </Link>
      <PageHeader
        title={applicant.name}
        description={`${HIRING_SUBJECT_LABEL[applicant.subject]} · ${applicant.mobile} · added ${when(applicant.createdAt)}`}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <DecisionControl applicantId={applicant.id} decision={applicant.decision} role={staff.role} />
        <ResumeControl
          applicantId={applicant.id}
          resume={
            applicant.resumeType && applicant.resumeName && applicant.resumeAt
              ? { name: applicant.resumeName, type: applicant.resumeType, at: applicant.resumeAt }
              : null
          }
        />
      </div>

      {attempt?.submittedAt && attempt.score !== null ? (
        <section className={cx(card, 'mt-6 p-5')} aria-label="Result">
          <p>
            <span className="text-3xl font-semibold tabular-nums text-slate-900">{attempt.score}</span>
            <span className="text-slate-600"> / {total}</span>
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {attempt.correct} right · {attempt.incorrect} wrong · {attempt.skipped} skipped
            {used !== null && test && <> · {clock(used)} of {test.limitMinutes} minutes</>}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Submitted {when(attempt.submittedAt)}
            {attempt.submitReason === 'timer' ? ', when time ran out' : ''}. Marked +1 right, −¼ wrong MCQ, 0 otherwise.
          </p>
        </section>
      ) : (
        <div className={cx(card, 'mt-6')}>
          <EmptyState icon="clock" title="No answers yet">
            {attempt ? 'The applicant is taking the test now.' : 'The applicant has not started the test.'}
          </EmptyState>
        </div>
      )}

      {report.tests.length > 0 && (
        <p className="mt-4 text-sm text-slate-600">
          Links:{' '}
          {report.tests
            .slice()
            .reverse()
            .map((t) => `#${t.issueSeq} sent ${when(t.createdAt)}, ${STATE_LABEL[t.state] ?? t.state}`)
            .join(' · ')}
        </p>
      )}

      <section aria-labelledby="history-heading" className={cx(card, 'mt-6 p-5 sm:p-6')}>
        <NoteForm applicantId={applicant.id} />
        <Eyebrow id="history-heading" className="mt-6">
          History
        </Eyebrow>
        <History notes={report.notes} />
      </section>

      {questions.length > 0 && (
        <section aria-labelledby="answers-heading" className="mt-8">
          <Eyebrow id="answers-heading">Answers</Eyebrow>
          <ol className="mt-3 space-y-3">
            {questions.map((q) => (
              <Question key={q.position} q={q} />
            ))}
          </ol>
        </section>
      )}
    </StaffShell>
  )
}

function Question({ q }: { q: HiringReportQuestion }) {
  const v = VERDICT[q.verdict]
  return (
    <li className={cx(card, 'p-4 sm:p-5')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">{q.position}.</span>
        <Badge tone={v.tone}>{v.label}</Badge>
        <span>{q.chapter}</span>
        <span>{q.paper}</span>
      </div>
      {q.direction && (
        <p className="mt-3 text-sm italic text-slate-600">
          <MathText text={q.direction} />
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-900">
        <MathText text={q.stem} />
      </p>

      {q.format === 'mcq' && q.options ? (
        <ul className="mt-3 space-y-1">
          {CHOICES.map((c) => {
            const isKey = c === q.answerKey
            const isGiven = c === q.given
            return (
              <li
                key={c}
                className={cx(
                  'flex items-start gap-2 rounded-lg px-2 py-1 text-sm',
                  isKey ? 'bg-emerald-50 font-medium text-emerald-900' : isGiven ? 'bg-rose-50 text-rose-900' : 'text-slate-700',
                )}
              >
                <span className="w-4 shrink-0 font-semibold">{c}.</span>
                <MathText text={q.options![c]} className="min-w-0 flex-1" />
                {isKey && <Badge tone="success">answer</Badge>}
                {isGiven && <Badge tone={isKey ? 'success' : 'danger'}>chosen</Badge>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-700">
          Answer <span className="font-semibold text-emerald-800">{q.numericAnswer}</span> · given{' '}
          <span className={cx('font-semibold', q.verdict === 'correct' ? 'text-emerald-800' : 'text-rose-800')}>
            {q.given ?? 'nothing'}
          </span>
        </p>
      )}
    </li>
  )
}
