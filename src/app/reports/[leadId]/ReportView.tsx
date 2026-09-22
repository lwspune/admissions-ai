'use client'

import { useState } from 'react'
import type { LeadReport } from '@/server/report'
import { SUBJECTS, type Subject } from '@/lib/types'

const SUBJECT_LABEL: Record<Subject, string> = {
  maths: 'Maths',
  english: 'English',
  science: 'Science',
}

export function ReportView({ data, role }: { data: LeadReport; role: string }) {
  const [showDetail, setShowDetail] = useState(false)
  const { lead, issue, attempt, report, priorIssues, identifyFailures } = data

  return (
    <>
      <header className="mt-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">{lead.name}</h1>
        <p className="text-sm text-slate-500">
          {lead.contact_mobile}
          {lead.school && ` · ${lead.school}`}
          {lead.class_level && ` · Class ${lead.class_level}`}
        </p>
        <p className="mt-1 text-xs text-slate-500">
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
          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Score</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {report.totals.score}
                <span className="text-lg text-slate-400"> / {report.totals.outOf}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {report.totals.correct} correct · {report.totals.incorrect} wrong ·{' '}
                {report.totals.skipped} skipped
              </p>
              <p className="mt-3 text-xs text-slate-500">
                No pass mark is computed. The bar is set outside this system.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Sections</p>
              <ul className="mt-2 space-y-2">
                {SUBJECTS.map((subject) => (
                  <SectionBar
                    key={subject}
                    label={SUBJECT_LABEL[subject]}
                    score={report.totals.sections[subject]}
                    outOf={report.questions.filter((q) => q.subject === subject).length}
                  />
                ))}
              </ul>
            </div>
          </section>

          <Facts facts={report.facts} attempt={attempt} identifyFailures={identifyFailures} />

          {priorIssues.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Earlier issues: {priorIssues.map((p) => `#${p.seq} ${p.state}`).join(' · ')}
            </p>
          )}

          <button
            type="button"
            className="min-h-tap mt-5 rounded border border-slate-300 px-4 py-2 text-sm font-medium"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
          >
            {showDetail ? 'Hide detail' : 'Show detail'}
          </button>

          {showDetail && <Detail questions={report.questions} role={role} />}
        </>
      )}
    </>
  )
}

function SectionBar({ label, score, outOf }: { label: string; score: number; outOf: number }) {
  // Negative marking means a section can go below zero; clamp the BAR, never
  // the number, so the reader sees the real score.
  const pct = outOf === 0 ? 0 : Math.max(0, Math.min(100, (score / outOf) * 100))
  return (
    <li>
      <div className="flex justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-900">
          {score} / {outOf}
        </span>
      </div>
      <div className="mt-1 h-2 rounded bg-slate-100">
        <div className="h-2 rounded bg-slate-700" style={{ width: `${pct}%` }} />
      </div>
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
    <section className="mt-4 rounded-lg border border-slate-200 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">What the test recorded</p>
        <p className="text-xs text-slate-400">
          submitted {attempt.submitReason === 'manual' ? 'by the candidate' : `on ${attempt.submitReason}`}
        </p>
      </div>

      {!facts.telemetrySeen && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No activity data reached the server for this attempt — a dropped connection would do
          this. The rows below mean “nothing was seen”, not “nothing happened”.
        </p>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-slate-100 pb-1 text-sm">
            <dt className="text-slate-600">{r.label}</dt>
            <dd className={r.notable ? 'font-medium text-amber-800' : 'text-slate-900'}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        These are observations, not a verdict. A pause can be an incoming call; a device change can
        be a dead battery. Read them alongside the call recording.
      </p>
    </section>
  )
}

function Detail({
  questions,
  role,
}: {
  questions: NonNullable<LeadReport['report']>['questions']
  role: string
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      {role === 'telecaller' && (
        <p className="mb-2 text-xs text-slate-500">
          Question text is not shown at your access level.
        </p>
      )}
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-2 pr-2">#</th>
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
            <tr key={q.position} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-2 tabular-nums text-slate-500">{q.position}</td>
              <td className="py-2 pr-2">{SUBJECT_LABEL[q.subject]}</td>
              <td className="py-2 pr-2 text-slate-500">{q.skill}</td>
              <td className="py-2 pr-2 text-slate-500">{q.difficulty}</td>
              <td className={`py-2 pr-2 ${verdictClass(q.verdict)}`}>
                {q.givenDisplay ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="py-2 pr-2 text-slate-500">{q.correctDisplay}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-500">
                {q.dwellMs === null ? (
                  <span title="No timing data for this question">unknown</span>
                ) : (
                  `${Math.round(q.dwellMs / 1000)}s`
                )}
                {q.dwellSource === 'nav' && <span className="text-slate-300" title="Derived from navigation"> ~</span>}
              </td>
              <td className="py-2">
                {q.changeCount > 0 ? q.changeCount : '—'}
                {q.changedAfterPause && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">after pause</span>
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
    <div className="mt-6 rounded-lg border border-slate-200 p-6 text-center">
      <p className="text-sm text-slate-600">
        {state === 'none'
          ? 'No test has been issued for this candidate yet.'
          : 'The test has been issued but not completed.'}
      </p>
      {priorIssues.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
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
  if (verdict === 'correct') return 'text-green-800'
  if (verdict === 'incorrect') return 'text-red-700'
  return 'text-slate-400'
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
