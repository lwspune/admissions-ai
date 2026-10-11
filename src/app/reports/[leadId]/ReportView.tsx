'use client'

import { useState } from 'react'
import type { LeadReport } from '@/server/report'
import { SUBJECTS, type Subject } from '@/lib/types'
import { Icon } from '@/components/icons'
import { Alert, Badge, Eyebrow, btn, card, cx } from '@/components/ui'

const SUBJECT_LABEL: Record<Subject, string> = {
  maths: 'Maths',
  english: 'English',
  science: 'Science',
}

/** The parent sheet's subject colours, so the two reports read alike. */
const SUBJECT_BAR: Record<Subject, { bar: string; track: string }> = {
  maths: { bar: 'bg-blue-600', track: 'bg-blue-100' },
  english: { bar: 'bg-violet-600', track: 'bg-violet-100' },
  science: { bar: 'bg-emerald-600', track: 'bg-emerald-100' },
}

export function ReportView({ data, role }: { data: LeadReport; role: string }) {
  const [showDetail, setShowDetail] = useState(false)
  const { lead, issue, attempt, report, priorIssues, identifyFailures } = data

  return (
    <>
      <header className={cx(card, 'mt-2 p-5 sm:p-6')}>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{lead.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {lead.contact_mobile}
          {lead.school && ` · ${lead.school}`}
          {lead.class_level && ` · Admission to class ${lead.class_level}`}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {issue.state === 'none'
            ? 'No test issued'
            : `Issue ${issue.seq} of ${issue.of} · ${issue.state} · ${date(issue.createdAt)}`}
        </p>
      </header>

      {!report || !attempt ? (
        <NotTakenYet state={issue.state} priorIssues={priorIssues} />
      ) : (
        <>
          {/* ── the one screen (spec §8) ────────────────────────────────── */}
          <section className="mt-4 grid gap-4 md:grid-cols-2">
            <div className={cx(card, 'p-5 sm:p-6')}>
              <Eyebrow>Score</Eyebrow>
              <div className="mt-4 flex items-center gap-5">
                <div
                  aria-hidden="true"
                  className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#4338ca ${share(report.totals.score, report.totals.outOf)}%, #e0e7ff 0)`,
                  }}
                >
                  <span className="h-[76px] w-[76px] rounded-full bg-white" />
                </div>
                <div>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
                    {report.totals.score}
                    <span className="text-xl font-medium text-slate-500"> / {report.totals.outOf}</span>
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="success">{report.totals.correct} correct</Badge>
                    <Badge tone="danger">{report.totals.incorrect} wrong</Badge>
                    <Badge tone="neutral">{report.totals.skipped} skipped</Badge>
                  </p>
                </div>
              </div>
              <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                No pass mark is computed. The bar is set outside this system.
              </p>
            </div>

            <div className={cx(card, 'p-5 sm:p-6')}>
              <Eyebrow>Sections</Eyebrow>
              <ul className="mt-4 space-y-4">
                {SUBJECTS.map((subject) => (
                  <SectionBar
                    key={subject}
                    subject={subject}
                    label={SUBJECT_LABEL[subject]}
                    score={report.totals.sections[subject]}
                    outOf={report.questions.filter((q) => q.subject === subject).length}
                    parts={
                      data.issue.syllabusClass !== null && report.questions.some((q) => q.subject === subject && q.part === 'syllabus')
                        ? report.totals.parts
                            .filter((p) => p.subject === subject)
                            .map((p) => ({
                              label: p.part === 'syllabus' ? `Class ${data.issue.syllabusClass}` : 'Basics',
                              score: p.score,
                              outOf: p.outOf,
                            }))
                        : []
                    }
                  />
                ))}
              </ul>
            </div>
          </section>

          <Facts facts={report.facts} attempt={attempt} identifyFailures={identifyFailures} />

          {priorIssues.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              Earlier issues: {priorIssues.map((p) => `#${p.seq} ${p.state}`).join(' · ')}
            </p>
          )}

          <button
            type="button"
            className={cx(btn('secondary'), 'mt-5')}
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
          >
            <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform', showDetail && 'rotate-180')} />
            {showDetail ? 'Hide detail' : 'Show detail'}
          </button>

          {showDetail && <Detail questions={report.questions} role={role} syllabusClass={data.issue.syllabusClass} />}
        </>
      )}
    </>
  )
}

function SectionBar({
  subject,
  label,
  score,
  outOf,
  parts,
}: {
  subject: Subject
  label: string
  score: number
  outOf: number
  /** Basics and Class N−1, on a 30-question paper. Empty otherwise. */
  parts: { label: string; score: number; outOf: number }[]
}) {
  // Negative marking means a section can go below zero; clamp the BAR, never
  // the number, so the reader sees the real score.
  const pct = outOf === 0 ? 0 : Math.max(0, Math.min(100, (score / outOf) * 100))
  return (
    <li>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">
          {score} <span className="font-normal text-slate-500">/ {outOf}</span>
        </span>
      </div>
      <div className={cx('mt-1.5 h-2 overflow-hidden rounded-full', SUBJECT_BAR[subject].track)}>
        <div className={cx('h-full rounded-full', SUBJECT_BAR[subject].bar)} style={{ width: `${pct}%` }} />
      </div>
      {parts.length > 0 && (
        <p className="mt-1 text-xs tabular-nums text-slate-600">
          {parts.map((p) => `${p.label} ${p.score} / ${p.outOf}`).join(' · ')}
        </p>
      )}
    </li>
  )
}

function Facts({
  facts,
  attempt,
  identifyFailures,
}: {
  facts: LeadReport['report'] extends null ? never : NonNullable<LeadReport['report']>['facts']
  attempt: NonNullable<LeadReport['attempt']>
  identifyFailures: number
}) {
  const rows: { label: string; value: string; notable: boolean }[] = [
    {
      label: 'Pauses',
      value:
        facts.pauseCount === 0
          ? 'None'
          : `${facts.pauseCount}, ${minutes(facts.pauseTotalMs)} total`,
      notable: facts.pauseCount > 0,
    },
    {
      label: 'Answers changed after a pause',
      value: facts.changedAfterPause.length === 0 ? 'None' : `Q${facts.changedAfterPause.join(', Q')}`,
      notable: facts.changedAfterPause.length > 0,
    },
    { label: 'Paste events', value: String(facts.pasteCount), notable: facts.pasteCount > 0 },
    { label: 'Device changed mid-test', value: facts.deviceChanged ? 'Yes' : 'No', notable: facts.deviceChanged },
    {
      label: 'Time used',
      value: `${minutes(facts.timeUsedMs)} of ${minutes(facts.timeAvailableMs)}`,
      notable: false,
    },
    {
      label: 'Failed number attempts',
      value: String(identifyFailures),
      notable: identifyFailures >= 3,
    },
  ]

  return (
    <section className={cx(card, 'mt-4 p-5 sm:p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>What the test recorded</Eyebrow>
        <p className="text-xs text-slate-600">
          submitted {attempt.submitReason === 'manual' ? 'by the candidate' : `on ${attempt.submitReason}`}
        </p>
      </div>

      {!facts.telemetrySeen && (
        <Alert tone="warning" className="mt-3">
          No activity data reached the server for this attempt — a dropped connection would do
          this. The rows below mean “nothing was seen”, not “nothing happened”.
        </Alert>
      )}

      <dl className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm">
            <dt className="text-slate-600">{r.label}</dt>
            <dd className={r.notable ? 'flex items-center gap-1.5 font-medium text-amber-800' : 'font-medium text-slate-900'}>
              {r.notable && <Icon name="alert" className="h-3.5 w-3.5" />}
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-slate-600">
        These are observations, not a verdict. A pause can be an incoming call; a device change can
        be a dead battery. Read them alongside the call recording.
      </p>
    </section>
  )
}

function partLabel(part: 'basics' | 'syllabus', syllabusClass: number | null): string {
  if (syllabusClass === null) return ''
  return part === 'syllabus' ? ` · Class ${syllabusClass}` : ' · Basics'
}

function Detail({
  questions,
  role,
  syllabusClass,
}: {
  questions: NonNullable<LeadReport['report']>['questions']
  role: string
  syllabusClass: number | null
}) {
  return (
    <div className={cx(card, 'mt-4 overflow-x-auto')}>
      {role === 'telecaller' && (
        <p className="flex items-center gap-1.5 px-4 pt-3 text-xs text-slate-600">
          <Icon name="lock" className="h-3.5 w-3.5" />
          Question text is not shown at your access level.
        </p>
      )}
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600 [&_th:first-child]:pl-4">
          <tr>
            <th className="py-2 pr-2">#</th>
            <th className="w-[22rem] py-2 pr-3">Question</th>
            <th className="py-2 pr-2">Subject</th>
            <th className="py-2 pr-2">Skill</th>
            <th className="py-2 pr-2">Level</th>
            <th className="py-2 pr-2">Answered</th>
            <th className="py-2 pr-2">Correct</th>
            <th className="py-2 pr-2">Time</th>
            <th className="py-2">Changes</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.position} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
              <td className="py-2.5 pl-4 pr-2 tabular-nums text-slate-600">{q.position}</td>
              <td className="py-2 pr-3 text-slate-700">
                {q.stem || <span className="text-slate-500">—</span>}
              </td>
              <td className="py-2 pr-2">
                {SUBJECT_LABEL[q.subject]}
                {partLabel(q.part, syllabusClass)}
              </td>
              <td className="py-2 pr-2 text-slate-600">{q.skill}</td>
              <td className="py-2 pr-2 capitalize text-slate-600">{q.difficulty}</td>
              <td className={`py-2 pr-2 ${verdictClass(q.verdict)}`}>
                {q.givenDisplay ?? <span className="text-slate-500">—</span>}
              </td>
              <td className="py-2 pr-2 text-slate-600">{q.correctDisplay}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-600">
                {q.dwellMs === null ? (
                  <span title="No timing data for this question">unknown</span>
                ) : (
                  `${Math.round(q.dwellMs / 1000)}s`
                )}
                {q.dwellSource === 'nav' && <span className="text-slate-500" title="Derived from navigation"> ~</span>}
              </td>
              <td className="py-2 pr-4">
                {q.changeCount > 0 ? q.changeCount : '—'}
                {q.changedAfterPause && (
                  <Badge tone="warning" className="ml-1">after pause</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NotTakenYet({
  state,
  priorIssues,
}: {
  state: string
  priorIssues: { seq: number; state: string }[]
}) {
  return (
    <div className={cx(card, 'mt-4 flex flex-col items-center p-8 text-center')}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-600">
        <Icon name="clock" className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-700">
        {state === 'none'
          ? 'No test has been issued for this candidate yet.'
          : 'The test has been issued but not completed.'}
      </p>
      {priorIssues.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          Earlier issues: {priorIssues.map((p) => `#${p.seq} ${p.state}`).join(' · ')}
        </p>
      )}
      {priorIssues.length >= 2 && (
        <p className="mt-2 text-xs text-amber-800">
          Repeatedly issued without being completed — worth a call.
        </p>
      )}
    </div>
  )
}

function verdictClass(verdict: string): string {
  if (verdict === 'correct') return 'font-medium text-emerald-800'
  if (verdict === 'incorrect') return 'font-medium text-rose-700'
  return 'text-slate-500'
}

/** Percent for the ring; a negative score (−0.25 marking) draws an empty one. */
function share(value: number, outOf: number): number {
  if (outOf <= 0) return 0
  return Math.min(100, Math.max(0, (value / outOf) * 100))
}

function minutes(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

function date(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
