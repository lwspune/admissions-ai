import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadBank, type BankItem } from '@/server/items'
import { groupBank, coverageByClass, thirtyReadiness, type ItemStatus, type CoverageCell, type Readiness } from '@/lib/items'
import { CLASSES, TAUGHT_IN_MIN } from '@/lib/classes'
import { CHOICES, SUBJECTS, DIFFICULTIES, type Subject } from '@/lib/types'
import { Icon } from '@/components/icons'
import { StaffShell } from '@/components/StaffShell'
import { Alert, Badge, Eyebrow, PageHeader, card, cx } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Questions', robots: { index: false, follow: false } }

const SUBJECT_LABEL: Record<Subject, string> = {
  maths: 'Maths',
  english: 'English',
  science: 'Science',
}

const FILTERS = ['all', 'review', 'live', 'retired'] as const
type Filter = (typeof FILTERS)[number]

const STATUS_TONE: Record<ItemStatus, 'success' | 'warning' | 'neutral'> = {
  live: 'success',
  review: 'warning',
  retired: 'neutral',
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/items')

  // The bank holds every answer key. A telecaller who reads it can coach the
  // items, and the incentives push exactly that way. 404 rather than a refusal
  // message: there is no reason to tell someone a page exists that they may
  // not have. The RLS policy on test_items is the rule; this is the door.
  if (staff.role !== 'superadmin') notFound()

  const requested = (await searchParams).status
  const filter: Filter = FILTERS.includes(requested as Filter) ? (requested as Filter) : 'all'

  const all = await loadBank(await userClient())
  const shown = filter === 'all' ? all : all.filter((i) => i.status === filter)
  const groups = groupBank(shown)

  return (
    <StaffShell staff={staff}>
      <PageHeader
        title="Question bank"
        description={
          <>
            {all.length} items · {all.filter((i) => i.status === 'live').length} live ·{' '}
            {all.filter((i) => i.status === 'review').length} awaiting review
          </>
        }
      />
      <Alert tone="warning" className="mt-4">
        Answer keys are shown. This page is visible to superadmins only — do not screenshot it.
      </Alert>

      <Coverage
        cells={coverageByClass(all.filter((i) => i.status === 'live').map((i) => ({ ...i, taught_in: i.taughtIn })))}
        readiness={thirtyReadiness(all.filter((i) => i.status === 'live').map((i) => ({ ...i, taught_in: i.taughtIn })))}
      />

      <nav aria-label="Filter by status" className="mt-6 inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/items' : `/items?status=${f}`}
            aria-current={filter === f ? 'page' : undefined}
            className={cx(
              'min-h-tap inline-flex items-center rounded-lg px-4 text-sm font-medium capitalize transition-colors',
              filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {f}
          </Link>
        ))}
      </nav>

      {groups.map((group) => (
        <section key={`${group.subject}/${group.difficulty}`} className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">
            {SUBJECT_LABEL[group.subject]} · <span className="font-normal capitalize">{group.difficulty}</span>{' '}
            <span className="font-normal text-slate-600">({group.items.length})</span>
          </h2>

          {group.items.length === 0 ? (
            // An empty stratum is the most useful thing this page can say to
            // whoever decides what to author next, so it is stated, not hidden.
            <p className="mt-1 text-xs text-slate-600">
              Nothing here{filter === 'all' ? '' : ` with status ${filter}`}.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {group.items.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </StaffShell>
  )
}

const COVERAGE_STYLE: Record<CoverageCell['status'], string> = {
  short: 'bg-red-100 text-red-900',
  thin: 'bg-amber-100 text-amber-900',
  ok: 'text-slate-800',
}

/**
 * How many live items each class can be shown per stratum. An admit to class
 * N draws content taught up to N−1, so a stratum can be healthy for class 12
 * and empty for class 9. Red means that class cannot be issued a paper at
 * all; amber means every paper for that class draws much the same items.
 */
function Coverage({ cells, readiness }: { cells: CoverageCell[]; readiness: Readiness[] }) {
  const ready = (c: number) => readiness.find((r) => r.classLevel === c)!
  const cell = (c: number, s: Subject, d: string) =>
    cells.find((x) => x.classLevel === c && x.subject === s && x.difficulty === d)!
  return (
    <section className={cx(card, 'mt-6 overflow-x-auto p-5 sm:p-6')} aria-labelledby="coverage-heading">
      <Eyebrow id="coverage-heading">Live items each class can draw from</Eyebrow>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        An admit to class N is tested on content taught up to class N−1. Red: that class cannot be issued a paper.
        Amber: fewer than twice a paper’s need, so its papers repeat. The counts are basics; Paper shows whether a
        class gets 30 questions, which needs its class N−1 first-term syllabus items live.
      </p>
      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="py-1 pr-3 font-medium">Class</th>
            <th scope="col" className="py-1 pr-3 font-medium">Paper</th>
            {SUBJECTS.map((s) =>
              DIFFICULTIES.map((d) => (
                <th key={`${s}/${d}`} scope="col" className="py-1 pr-3 font-medium">
                  {SUBJECT_LABEL[s].slice(0, 3)} <span className="capitalize">{d.slice(0, 3)}</span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {CLASSES.map((c) => (
            <tr key={c} className="border-t border-slate-100">
              <th scope="row" className="py-1 pr-3 text-left font-medium text-slate-700">
                {c}
              </th>
              <td className="py-1 pr-3">
                {ready(c).ready ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">30 q</span>
                ) : (
                  <span
                    className="tabular-nums text-slate-700"
                    title={ready(c).missing.map((m) => `${m.subject} ${m.part} ${m.difficulty}: ${m.count} of ${m.needed}`).join('; ')}
                  >
                    15 q
                    <span className="sr-only">
                      , 30 questions needs {ready(c).missing.map((m) => `${m.needed - m.count} more ${m.subject} ${m.part} ${m.difficulty}`).join(', ')}
                    </span>
                  </span>
                )}
              </td>
              {SUBJECTS.map((s) =>
                DIFFICULTIES.map((d) => {
                  const x = cell(c, s, d)
                  return (
                    <td key={`${s}/${d}`} className="py-1 pr-3">
                      <span className={`rounded px-1.5 py-0.5 tabular-nums ${COVERAGE_STYLE[x.status]}`}>
                        {x.count}
                        <span className="sr-only">
                          {x.status === 'short' ? ', short: a paper needs ' + x.needed : x.status === 'thin' ? ', thin' : ''}
                        </span>
                      </span>
                    </td>
                  )
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Item({ item }: { item: BankItem }) {
  return (
    <li className={cx(card, 'p-4 sm:p-5')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-600">{item.ref ?? 'no ref'}</span>
        <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
        <span className="text-xs text-slate-600">{item.skill}</span>
        <span className="text-xs text-slate-600">{item.format}</span>
        {/* The floor means "open to every admit" and is what an untagged item
            carries, so it is shown as such rather than as a class number. */}
        <span className="text-xs text-slate-600">
          {item.taughtIn <= TAUGHT_IN_MIN ? 'all classes' : `taught in class ${item.taughtIn}`}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-900">{item.stem}</p>

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
                <span className="min-w-0 flex-1">{item.options?.[choice]}</span>
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
          {item.numericTolerance > 0 && (
            <span className="ml-2 font-normal text-slate-600">± {item.numericTolerance}</span>
          )}
        </p>
      )}

      {item.rationale && (
        <details className="group mt-2">
          <summary className="min-h-tap inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Rationale
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.rationale}</p>
        </details>
      )}
    </li>
  )
}
