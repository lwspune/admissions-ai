import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadHiringBank, type HiringBankItem } from '@/server/hiring'
import { HIRING_SHAPE, HIRING_SUBJECTS, HIRING_SUBJECT_LABEL, type HiringSubject } from '@/lib/hiring'
import type { ItemStatus } from '@/lib/items'
import { CHOICES } from '@/lib/types'
import { MathText } from '@/components/MathText'
import { StaffShell } from '@/components/StaffShell'
import { Alert, Badge, PageHeader, card, cx } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Hiring questions', robots: { index: false, follow: false } }

const STATUS_TONE: Record<ItemStatus, 'success' | 'warning' | 'neutral'> = {
  live: 'success',
  review: 'warning',
  retired: 'neutral',
}

/**
 * The teacher screening test's question bank, for review before a subject is
 * promoted (`npm run hiring:seed -- --live --file <subject>`). Superadmin only:
 * reviewing and promoting are theirs. RLS (can_hire) is the access rule; this
 * check keeps a teacher from opening a page that is not for them.
 */
export default async function HiringQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>
}) {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/hiring/questions')
  if (staff.role !== 'superadmin') notFound()

  const requested = (await searchParams).subject
  const subject: HiringSubject = HIRING_SUBJECTS.includes(requested as HiringSubject)
    ? (requested as HiringSubject)
    : 'maths'

  const items = await loadHiringBank(await userClient(), subject)
  const count = (format: 'mcq' | 'numeric', status: ItemStatus) =>
    items.filter((i) => i.format === format && i.status === status).length
  const shape = HIRING_SHAPE[subject]

  return (
    <StaffShell staff={staff}>
      <PageHeader
        title="Hiring questions"
        description="Real exam questions for the teacher screening test, taken from PYQ Vault. Each applicant gets 15 drawn at random."
      />

      <nav aria-label="Subject" className="mt-6 inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
        {HIRING_SUBJECTS.map((s) => (
          <Link
            key={s}
            href={`/hiring/questions?subject=${s}`}
            aria-current={s === subject ? 'page' : undefined}
            className={cx(
              'min-h-tap inline-flex items-center rounded-lg px-4 text-sm font-medium transition-colors',
              s === subject ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {HIRING_SUBJECT_LABEL[s]}
          </Link>
        ))}
      </nav>

      <p className="mt-4 text-sm text-slate-700">
        A paper is {shape.mcq} MCQ{shape.numeric > 0 ? ` and ${shape.numeric} typed answers` : ''} in {shape.minutes}{' '}
        minutes. MCQ: {count('mcq', 'live')} live, {count('mcq', 'review')} in review
        {shape.numeric > 0 && (
          <>
            {' '}
            · typed answers: {count('numeric', 'live')} live, {count('numeric', 'review')} in review
          </>
        )}
        .
      </p>
      <Alert tone="warning" className="mt-4">
        Answers are shown. These are public past-year questions, but this page is for review only.
      </Alert>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No questions yet. Run npm run hiring:import, then npm run hiring:seed.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {items.map((item, i) => (
            <Question key={item.id} item={item} n={i + 1} />
          ))}
        </ol>
      )}
    </StaffShell>
  )
}

function Question({ item, n }: { item: HiringBankItem; n: number }) {
  return (
    <li className={cx(card, 'p-4 sm:p-5')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">{n}.</span>
        <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
        <span>{item.format === 'mcq' ? 'MCQ' : 'Typed answer'}</span>
        <span>{item.chapter}</span>
        <span>{item.paper}</span>
      </div>

      {item.direction && (
        <p className="mt-3 text-sm italic text-slate-600">
          <MathText text={item.direction} />
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-900">
        <MathText text={item.stem} />
      </p>

      {item.format === 'mcq' && item.options ? (
        <ul className="mt-3 space-y-1">
          {CHOICES.map((choice) => {
            const isKey = choice === item.answerKey
            return (
              <li
                key={choice}
                className={cx(
                  'flex items-start gap-2 rounded-lg px-2 py-1 text-sm',
                  isKey ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-slate-700',
                )}
              >
                <span className="w-4 shrink-0 font-semibold">{choice}.</span>
                <MathText text={item.options![choice]} className="min-w-0 flex-1" />
                {isKey && (
                  <Badge tone="success" icon="check">
                    key
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-900">
          Answer: {item.numericAnswer}
        </p>
      )}
    </li>
  )
}
