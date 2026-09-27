import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadBank, type BankItem } from '@/server/items'
import { groupBank, coverageByClass, type ItemStatus, type CoverageCell } from '@/lib/items'
import { CLASSES, TAUGHT_IN_MIN } from '@/lib/classes'
import { CHOICES, SUBJECTS, DIFFICULTIES, type Subject } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Questions', robots: { index: false, follow: false } }

const SUBJECT_LABEL: Record<Subject, string> = {
  maths: 'Maths',
  english: 'English',
  science: 'Science',
}

const FILTERS = ['all', 'review', 'live', 'retired'] as const
type Filter = (typeof FILTERS)[number]

const STATUS_STYLE: Record<ItemStatus, string> = {
  live: 'bg-green-100 text-green-900',
  review: 'bg-amber-100 text-amber-900',
  retired: 'bg-slate-200 text-slate-600',
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
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:underline">
        ← Candidates
      </Link>

      <header className="mt-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">Question bank</h1>
        <p className="mt-1 text-sm text-slate-500">
          {all.length} items · {all.filter((i) => i.status === 'live').length} live ·{' '}
          {all.filter((i) => i.status === 'review').length} awaiting review
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Answer keys are shown. This page is visible to superadmins only — do not screenshot it.
        </p>
      </header>

      <Coverage cells={coverageByClass(all.filter((i) => i.status === 'live').map((i) => ({ ...i, taught_in: i.taughtIn })))} />

      <nav aria-label="Filter by status" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/items' : `/items?status=${f}`}
            aria-current={filter === f ? 'page' : undefined}
            className={`min-h-tap inline-flex items-center rounded border px-3 py-2 text-sm capitalize ${
              filter === f
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {f}
          </Link>
        ))}
      </nav>

      {groups.map((group) => (
        <section key={`${group.subject}/${group.difficulty}`} className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">
            {SUBJECT_LABEL[group.subject]} · <span className="font-normal capitalize">{group.difficulty}</span>{' '}
            <span className="font-normal text-slate-400">({group.items.length})</span>
          </h2>

          {group.items.length === 0 ? (
            // An empty stratum is the most useful thing this page can say to
            // whoever decides what to author next, so it is stated, not hidden.
            <p className="mt-1 text-xs text-slate-400">
              Nothing here{filter === 'all' ? '' : ` with status ${filter}`}.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {group.items.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}

const COVERAGE_STYLE: Record<CoverageCell['status'], string> = {
  short: 'bg-red-100 text-red-900',
  thin: 'bg-amber-100 text-amber-900',
  ok: 'text-slate-700',
}

/**
 * How many live items each class can be shown per stratum. An admit to class
 * N draws content taught up to N−1, so a stratum can be healthy for class 12
 * and empty for class 9. Red means that class cannot be issued a paper at
 * all; amber means every paper for that class draws much the same items.
 */
function Coverage({ cells }: { cells: CoverageCell[] }) {
  const cell = (c: number, s: Subject, d: string) =>
    cells.find((x) => x.classLevel === c && x.subject === s && x.difficulty === d)!
  return (
    <section className="mt-4 overflow-x-auto" aria-labelledby="coverage-heading">
      <h2 id="coverage-heading" className="text-sm font-semibold text-slate-900">
        Live items each class can draw from
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        An admit to class N is tested on content taught up to class N−1. Red: that class cannot be issued a paper.
        Amber: fewer than twice a paper’s need, so its papers repeat.
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th scope="col" className="py-1 pr-3 font-medium">Class</th>
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
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-slate-500">{item.ref ?? 'no ref'}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[item.status]}`}>{item.status}</span>
        <span className="text-xs text-slate-400">{item.skill}</span>
        <span className="text-xs text-slate-400">{item.format}</span>
        {/* The floor means "open to every admit" and is what an untagged item
            carries, so it is shown as such rather than as a class number. */}
        <span className="text-xs text-slate-400">
          {item.taughtIn <= TAUGHT_IN_MIN ? 'all classes' : `taught in class ${item.taughtIn}`}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-900">{item.stem}</p>

      {item.format === 'mcq' && item.options ? (
        <ul className="mt-2 space-y-1">
          {CHOICES.map((choice) => {
            const isKey = choice === item.answerKey
            return (
              <li key={choice} className={`text-sm ${isKey ? 'font-medium text-green-800' : 'text-slate-600'}`}>
                {choice}. {item.options?.[choice]}
                {isKey && <span className="ml-2 text-xs uppercase tracking-wide">key</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm font-medium text-green-800">
          Answer: {item.numericAnswer}
          {item.numericTolerance > 0 && (
            <span className="ml-2 font-normal text-slate-500">± {item.numericTolerance}</span>
          )}
        </p>
      )}

      {item.rationale && (
        <details className="mt-2">
          <summary className="min-h-tap cursor-pointer text-xs text-slate-500">Rationale</summary>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.rationale}</p>
        </details>
      )}
    </li>
  )
}
