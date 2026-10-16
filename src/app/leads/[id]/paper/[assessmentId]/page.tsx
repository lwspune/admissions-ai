import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadPaperTest } from '@/server/paperTest'
import { CANDIDATE_TEXT, LANG_LABEL } from '@/lib/candidateText'
import type { Lang } from '@/lib/hindi'
import { CHOICES } from '@/lib/types'
import { Icon } from '@/components/icons'
import { Alert, cx } from '@/components/ui'
import { PaperActions } from './PaperActions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * A paper test's question paper, to print, and its OMR sheet, to download
 * (2026-10-16). Counsellors and superadmin only: `loadPaperTest` returns
 * nothing for a telecaller, who never sees question text.
 *
 * The questions come through `toCandidatePaper`, so the page carries what a
 * candidate's screen would and no answer. Hindi is offered on the same terms
 * as on screen: only when every maths and science question has it, and
 * English questions stay English.
 */
export default async function PaperTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assessmentId: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id, assessmentId } = await params
  const staff = await currentStaff()
  if (!staff) redirect(`/login?next=/leads/${id}/paper/${assessmentId}`)

  const paper = await loadPaperTest(await userClient(), assessmentId, staff.role)
  if (!paper || paper.leadId !== id) notFound()

  const lang: Lang = (await searchParams).lang === 'hi' && paper.hindi ? 'hi' : 'en'
  const t = CANDIDATE_TEXT[lang]
  const issued = longDate(paper.issuedAt)

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 print:min-h-0 print:bg-white print:p-0">
      <title>{`Question paper ${paper.paperNo} — ${paper.name}`}</title>
      {/* White body too: its bg-canvas class otherwise prints under a short last page, and a class outranks a plain body rule, hence !important. */}
      <style>{'@page { size: A4 portrait; margin: 12mm; } @media print { body { background: #fff !important; } }'}</style>

      <div className="mx-auto mb-4 max-w-3xl space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/leads/${id}`}
            className="inline-flex min-h-tap items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
            Back to lead
          </Link>
          <PaperActions sheet={paper.sheet} />
        </div>
        {paper.hindi && (
          <nav aria-label="Language of the question paper" className="flex gap-2 text-sm">
            {(['en', 'hi'] as const).map((l) => (
              <Link
                key={l}
                href={l === 'hi' ? '?lang=hi' : '?'}
                aria-current={l === lang ? 'page' : undefined}
                lang={l}
                className={cx(
                  'min-h-tap inline-flex items-center rounded-lg border px-3',
                  l === lang
                    ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {LANG_LABEL[l]}
              </Link>
            ))}
          </nav>
        )}
        {paper.state !== 'issued' ? (
          <Alert tone="warning">
            This paper test is {paper.state === 'voided' ? 'replaced by a newer test' : paper.state}. Do not print it
            for a candidate.
          </Alert>
        ) : (
          <p className="text-sm text-slate-600">
            Print this paper and the OMR sheet for {paper.name}. The sheet carries paper number {paper.paperNo}, so
            each candidate needs their own. Scan the filled sheet by {longDate(paper.expiresAt)}.
          </p>
        )}
      </div>

      {/* Printed: 10 pt text, a 14 pt title, questions in two columns (2026-10-16). The screen
          keeps its own sizes; every print change is a print: variant. */}
      <article
        lang={lang}
        className="mx-auto max-w-3xl rounded-2xl bg-white px-5 py-6 shadow-raised sm:px-8 print:max-w-none print:rounded-none print:p-0 print:text-[10pt] print:shadow-none"
      >
        <header className="border-b border-slate-300 pb-4 print:pb-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-600 print:text-[8pt]">Aptitude Test</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 print:mt-0 print:text-[14pt]">{t.paper.title}</h1>
          <p className="mt-1 text-sm text-slate-700 print:text-[10pt]">{t.paper.admission(paper.classLevel)}</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 print:mt-1.5 print:grid-cols-2 print:text-[10pt]">
            <Detail label={t.paper.name}>{paper.name}</Detail>
            <Detail label={t.paper.paperNo}>{paper.paperNo}</Detail>
            <Detail label={t.paper.date}>{issued}</Detail>
          </dl>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-800 print:mt-2 print:space-y-0 print:text-[10pt]">
            <li>{t.rules.paper(paper.questions.length, paper.minutes)}</li>
            {paper.syllabusClass !== null && <li>{t.rules.syllabus(paper.syllabusClass)}</li>}
            <li className="font-semibold">{t.paper.answerSheet}</li>
            <li>{t.paper.marking}</li>
          </ul>
        </header>

        {/* Each question stays whole within a printed column. */}
        <ol className="mt-2 divide-y divide-slate-200 print:mt-1 print:columns-2 print:gap-8">
          {paper.questions.map((q) => {
            const hindi = lang === 'hi' && q.stemHi !== null
            const stem = hindi ? q.stemHi! : q.stem
            const options = hindi ? q.optionsHi : q.options
            return (
              <li
                key={q.position}
                className="break-inside-avoid py-4 print:py-1.5"
                lang={hindi ? 'hi' : 'en'}
              >
                <div className="flex gap-3 print:gap-2">
                  <span className="w-7 shrink-0 text-right font-bold tabular-nums text-slate-900 print:w-6">
                    {q.position}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-600 print:text-[7.5pt]">
                      {t.subject[q.subject]}
                      {paper.syllabusClass !== null &&
                        ` · ${q.part === 'syllabus' ? t.part.syllabus(paper.syllabusClass) : t.part.basics}`}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-900 print:mt-0.5 print:text-[10pt] print:leading-snug">
                      {stem}
                    </p>
                    {q.format === 'mcq' && options ? (
                      <ol className="mt-2 grid gap-x-6 gap-y-1 text-[15px] text-slate-900 sm:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-x-4 print:gap-y-0.5 print:text-[10pt] print:leading-snug">
                        {CHOICES.map((c) => (
                          <li key={c} className="flex gap-2">
                            <span className="font-semibold">({c})</span>
                            <span>{options[c]}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-sm italic text-slate-700 print:mt-1 print:text-[10pt]">
                        {t.paper.numericBox(q.position)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </article>
    </main>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-600">{label}:</dt>
      <dd className="font-semibold text-slate-900">{children}</dd>
    </div>
  )
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}
