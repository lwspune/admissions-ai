import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadParentReport } from '@/server/report'
import type { ParentReport } from '@/lib/report'
import type { Subject } from '@/lib/types'
import { Icon } from '@/components/icons'
import { PrintButton } from './PrintButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

const SUBJECT: Record<Subject, { label: string; text: string; soft: string; bar: string; border: string }> = {
  maths: { label: 'Maths', text: 'text-blue-700', soft: 'bg-blue-100', bar: 'bg-blue-600', border: 'border-t-blue-600' },
  english: { label: 'English', text: 'text-violet-700', soft: 'bg-violet-100', bar: 'bg-violet-600', border: 'border-t-violet-600' },
  science: { label: 'Science', text: 'text-emerald-700', soft: 'bg-emerald-100', bar: 'bg-emerald-600', border: 'border-t-emerald-600' },
}

/**
 * The score sheet staff save as PDF and send to the parent. Score only — the
 * questions never leave the institute. Everything shown comes through
 * `toParentReport`, the allow-list.
 */
export default async function ParentReportPage({ params }: { params: Promise<{ leadId: string }> }) {
  const staff = await currentStaff()
  if (!staff) redirect('/login')

  const { leadId } = await params
  const report = await loadParentReport(await userClient(), leadId, staff.role)
  if (!report) notFound()

  const { total } = report

  return (
    <main
      className="min-h-screen bg-canvas px-4 py-6 print:min-h-0 print:bg-white print:p-0"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* The browser's PDF names itself after the title. */}
      <title>{`Score Report — ${report.name}`}</title>
      {/* Portrait A4 whatever the print dialog defaults to: landscape spills onto a second page. */}
      <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>

      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3 print:hidden">
        <Link
          href={`/leads/${leadId}`}
          className="inline-flex min-h-tap items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
          Back to lead
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white shadow-raised print:max-w-none print:shadow-none">
        <header className="bg-gradient-to-br from-blue-900 to-indigo-700 px-5 py-7 text-white sm:px-8">
          <p className="text-xs uppercase tracking-[0.14em] text-indigo-200">Aptitude Test</p>
          <h1 className="mt-1 text-2xl font-bold">Score Report</h1>
          <p className="mt-1 text-sm text-indigo-100">{total.outOf} questions · Maths, English and Science</p>
        </header>

        <div className="px-5 pb-7 pt-6 sm:px-8">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Detail label="Candidate">{report.name}</Detail>
            <Detail label="Test date">{longDate(report.testDate)}</Detail>
            <Detail label="Time used">
              {duration(report.timeUsedMs)} of {Math.round(report.timeAvailableMs / 60_000)} min
              <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-full rounded-full bg-indigo-700"
                  style={{ width: `${share(report.timeUsedMs, report.timeAvailableMs)}%` }}
                />
              </span>
            </Detail>
          </dl>

          <section
            aria-label="Total score"
            className="mt-6 flex flex-col items-center gap-6 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 px-6 py-5 text-center sm:flex-row sm:text-left"
          >
            <div
              role="img"
              aria-label={`Total score ${total.score} out of ${total.outOf}`}
              className="grid h-32 w-32 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#4338ca ${share(total.score, total.outOf)}%, #c7d2fe 0)`,
              }}
            >
              <div className="grid h-[104px] w-[104px] place-content-center rounded-full bg-white text-center">
                <b className="text-3xl leading-none text-blue-900">{total.score}</b>
                <small className="text-sm text-slate-600">out of {total.outOf}</small>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Total score</h2>
              <p className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Pill tone="bg-emerald-100 text-emerald-800" n={total.correct} label="correct" />
                <Pill tone="bg-rose-100 text-rose-800" n={total.wrong} label="wrong" />
                <Pill tone="bg-slate-200 text-slate-700" n={total.notAttempted} label="not attempted" />
              </p>
            </div>
          </section>

          <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-slate-600">By subject</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {report.subjects.map((s) => (
              <SubjectCard key={s.subject} subject={s.subject} counts={s} syllabusClass={report.syllabusClass} />
            ))}
          </div>

          <p className="mt-6 border-t border-dashed border-slate-200 pt-4 text-xs text-slate-600">
            Marking: +1 for each correct answer · −0.25 for each wrong multiple-choice answer · 0 for a wrong
            numeric answer or a question not attempted.
          </p>
        </div>
      </article>
    </main>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  )
}

function Pill({ tone, n, label }: { tone: string; n: number; label: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-sm ${tone}`}>
      <b className="text-lg">{n}</b> {label}
    </span>
  )
}

function SubjectCard({
  subject,
  counts,
  syllabusClass,
}: {
  subject: Subject
  counts: ParentReport['subjects'][number]
  syllabusClass: number | undefined
}) {
  const c = SUBJECT[subject]
  return (
    <section aria-label={c.label} className={`rounded-xl border border-t-4 border-slate-200 px-4 py-3.5 ${c.border}`}>
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${c.text} ${c.soft}`}>
        {c.label}
      </span>
      <p className="mb-1.5 mt-2.5 text-2xl font-bold leading-none">
        {counts.score} <small className="text-base font-medium text-slate-600">/ {counts.outOf}</small>
      </p>
      <span aria-hidden="true" className={`block h-2 overflow-hidden rounded-full ${c.soft}`}>
        <span className={`block h-full rounded-full ${c.bar}`} style={{ width: `${share(counts.score, counts.outOf)}%` }} />
      </span>
      {counts.parts && syllabusClass !== undefined && (
        // One row per part, like the counts below: a single "Basics x / 5 ·
        // Class 9 y / 5" line broke mid-phrase in a third-width card.
        <dl className="mt-2 space-y-0.5 border-b border-slate-100 pb-2 text-sm text-slate-700">
          {counts.parts.map((p) => (
            <div key={p.part} className="flex justify-between">
              <dt>{p.part === 'syllabus' ? `Class ${syllabusClass}` : 'Basics'}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {p.score} / {p.outOf}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <dl className="mt-3 space-y-0.5 text-sm text-slate-600">
        <Row label="Correct" n={counts.correct} />
        <Row label="Wrong" n={counts.wrong} />
        <Row label="Not attempted" n={counts.notAttempted} />
      </dl>
    </section>
  )
}

function Row({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{n}</dd>
    </div>
  )
}

/** Percent for a bar; a negative score (−0.25 marking) draws an empty bar. */
function share(value: number, outOf: number): number {
  if (outOf <= 0) return 0
  return Math.min(100, Math.max(0, (value / outOf) * 100))
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}
