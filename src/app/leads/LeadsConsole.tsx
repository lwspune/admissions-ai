'use client'

import { useRef, useState, useTransition } from 'react'
import { canManageLeads } from '@/lib/staff'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CLASSES } from '@/lib/classes'
import {
  STAGES,
  COLUMN_TITLE,
  NEXT_STAGE,
  PAGE_SIZE,
  STAGE_TONE,
  INTERESTS,
  leadsHref,
  enquiryLabel,
  summaryHref,
  type LeadFilters,
  type Stage,
  type Tone,
} from '@/lib/leads'
import type { LeadListRow, Pipeline } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { Icon } from '@/components/icons'
import { Alert, Avatar, Badge, PageHeader, btn, card, control, cx, hint, input, label } from '@/components/ui'
import { createLead, assignLeads, setStage, type ActionResult } from './actions'
import { RowTest } from './RowTest'

export function LeadsConsole({
  staff,
  pipeline,
  filters,
  sources,
  assignees,
  feedWarning,
  download,
}: {
  staff: { id: string; name: string | null; email: string; role: string }
  pipeline: Pipeline
  filters: LeadFilters
  sources: { id: string; name: string }[]
  assignees: Assignee[]
  /** GoPost's leads are not arriving (src/lib/gopostLeads.ts); counsellors and superadmin only. */
  feedWarning: string | null
  /** "Download for Excel": your last download of the stage on screen, and how many are new since. Null hides it. */
  download: { lastAt: string | null; fresh: number | null } | null
}) {
  const [adding, setAdding] = useState(false)
  const canAssign = canManageLeads(staff.role)

  return (
    <>
      <PageHeader
        title="Leads"
        actions={
          <>
            {download && <DownloadMenu filters={filters} total={pipeline.list.total} download={download} />}
            <button
              type="button"
              className={adding ? btn('secondary') : btn('primary')}
              aria-expanded={adding}
              onClick={() => setAdding((v) => !v)}
            >
              {adding ? (
                'Cancel'
              ) : (
                <>
                  <Icon name="plus" className="h-4 w-4" />
                  Add lead
                </>
              )}
            </button>
          </>
        }
      />

      {feedWarning && (
        <Alert tone="warning" role="status" className="mt-4">
          <p>{feedWarning}</p>
        </Alert>
      )}

      {adding && <AddLead onDone={() => setAdding(false)} />}

      <Filters filters={filters} sources={sources} assignees={assignees} canAssign={canAssign} />

      <PipelineBar counts={pipeline.counts} filters={filters} />

      <StageList
        list={pipeline.list}
        filters={filters}
        me={staff.id}
        assignees={assignees}
        canAssign={canAssign}
      />
    </>
  )
}

const select = input

// The year in India, so a date in it shows without the year.
const THIS_YEAR = new Date(Date.now() + 5.5 * 3600_000).getUTCFullYear()

/**
 * One row of filters: a plain GET form, so a filtered pipeline can be
 * bookmarked or shared. The filters narrow every stage, and every count on
 * the bar with them; the stage itself is chosen on the bar.
 */
function Filters({
  filters,
  sources,
  assignees,
  canAssign,
}: {
  filters: LeadFilters
  sources: { id: string; name: string }[]
  assignees: Assignee[]
  canAssign: boolean
}) {
  const more = [filters.interest, canAssign && filters.assignee].filter(Boolean).length
  const anything = more > 0 || Boolean(filters.q || filters.source)

  return (
    <form method="get" action="/leads" className={cx(card, 'mt-5 p-3')}>
      {/* A search keeps the stage being looked at. */}
      {filters.stage !== 'new' && <input type="hidden" name="stage" value={filters.stage} />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search name or mobile"
            className={cx(control, 'block w-full pl-9')}
          />
        </div>
        <label htmlFor="source" className="sr-only">
          Source
        </label>
        <select id="source" name="source" defaultValue={filters.source ?? ''} className={cx(control, 'w-full sm:w-56')}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className={btn('primary')}>
          Search
        </button>
        {anything && (
          <Link href={leadsHref({ ...filters, q: '', source: null, interest: null, assignee: null })} className={btn('ghost')}>
            Clear
          </Link>
        )}
      </div>

      <details open={more > 0} className="group mt-1">
        <summary className="min-h-tap inline-flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <Icon name="filter" className="h-4 w-4 text-slate-500" />
          More filters
          {more > 0 && <Badge tone="brand">{more}</Badge>}
          <Icon name="chevronDown" className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 px-1 pb-1 pt-2 sm:grid-cols-2 lg:max-w-xl">
          <div>
            <label htmlFor="interest" className={label}>
              Interest
            </label>
            <select id="interest" name="interest" defaultValue={filters.interest ?? ''} className={select}>
              <option value="">Any</option>
              {INTERESTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          {canAssign && (
            <div>
              <label htmlFor="assignee" className={label}>
                Assigned to
              </label>
              <select id="assignee" name="assignee" defaultValue={filters.assignee ?? ''} className={select}>
                <option value="">Anyone</option>
                <option value="none">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </details>
    </form>
  )
}

/** A stage's colour, as a dot: the same meaning as its badge (STAGE_TONE). */
const DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-500',
  accent: 'bg-violet-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
}

// Chevron steps: each one points into the next. The first has no notch, the last no point.
const CHEVRON = {
  first: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)',
  middle: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)',
  last: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 16px 50%)',
}

/**
 * The pipeline (2026-10-26): every stage as a step with its count. A step is
 * a link: clicking it shows that stage's leads below, across the page.
 */
function PipelineBar({ counts, filters }: { counts: Record<Stage, number>; filters: LeadFilters }) {
  return (
    <nav aria-label="Pipeline" className="mt-5">
      {/* On a phone the bar scrolls sideways; the step cut off at the edge says there are more. */}
      <ol className="flex overflow-x-auto pb-1 [filter:drop-shadow(0_1px_1px_rgb(15_23_42/0.14))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STAGES.map((s, i) => {
          const selected = s === filters.stage
          const shape = i === 0 ? CHEVRON.first : i === STAGES.length - 1 ? CHEVRON.last : CHEVRON.middle
          return (
            <li key={s} className={cx('min-w-[9.5rem] flex-1 shrink-0 sm:min-w-[10.5rem]', i > 0 && '-ml-2')}>
              <Link
                href={leadsHref(filters, { stage: s })}
                aria-current={selected ? 'page' : undefined}
                style={{ clipPath: shape }}
                className={cx(
                  // On a phone the count sits under the name, so the name is never cut short.
                  'flex h-16 flex-col justify-center text-sm outline-none transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                  'focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-300',
                  i === 0 ? 'pl-4' : 'pl-8',
                  i === STAGES.length - 1 ? 'pr-4' : 'pr-8',
                  selected ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 hover:bg-brand-50',
                )}
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-full', DOT[STAGE_TONE[s]], selected && 'ring-2 ring-white')} />
                  <span className="truncate">{COLUMN_TITLE[s]}</span>
                </span>
                <span className={cx('text-lg font-semibold tabular-nums', selected ? 'text-white' : 'text-slate-900')}>
                  {counts[s].toLocaleString('en-IN')}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The stage the bar shows, a page at a time, one lead per row across the page. */
function StageList({
  list,
  filters,
  me,
  assignees,
  canAssign,
}: {
  list: Pipeline['list']
  filters: LeadFilters
  me: string
  assignees: Assignee[]
  canAssign: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignee, setAssignee] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  const names = new Map(assignees.map((a) => [a.id, a.label]))
  const assignedLabel = (id: string | null) =>
    id === null ? 'Unassigned' : id === me ? 'You' : (names.get(id) ?? 'Not a telecaller now')
  const allOnPage = list.rows.length > 0 && list.rows.every((r) => selected.has(r.id))
  const title = COLUMN_TITLE[filters.stage]

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function assign() {
    setResult(null)
    start(async () => {
      const r = await assignLeads([...selected], assignee)
      setResult(r)
      if (r.ok) {
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  return (
    <section aria-labelledby="stage-heading" className="mt-4">
      <div className="flex min-h-tap flex-wrap items-center justify-between gap-3">
        <h2 id="stage-heading" className="text-base font-semibold text-slate-900">
          {title}
          <span className="ml-2 text-sm font-normal text-slate-600">
            {list.total === 0
              ? 'no leads'
              : `${list.total.toLocaleString('en-IN')} lead${list.total === 1 ? '' : 's'}${pages > 1 ? ` · page ${filters.page} of ${pages}` : ''}`}
          </span>
        </h2>
        {canAssign && list.rows.length > 0 && (
          <label className="inline-flex min-h-tap cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allOnPage}
              onChange={() => setSelected(allOnPage ? new Set() : new Set(list.rows.map((r) => r.id)))}
              className="h-5 w-5 rounded accent-brand-700"
            />
            Select all on this page
          </label>
        )}
      </div>

      <p aria-live="polite" className={result?.error ? 'mb-2 text-sm text-rose-700' : 'sr-only'}>
        {result?.error ?? (result?.ok ? 'Assigned.' : '')}
      </p>

      {list.rows.length === 0 ? (
        <div className={cx(card, 'mt-2 px-6 py-12 text-center')}>
          <p className="font-medium text-slate-900">No leads in {title}</p>
          <p className="mt-1 text-sm text-slate-600">
            {filters.q || filters.source || filters.interest || filters.assignee
              ? 'Nothing here matches these filters.'
              : 'Move a lead here with the buttons on its row.'}
          </p>
        </div>
      ) : (
        <ul className={cx(card, 'mt-2 divide-y divide-slate-100')}>
          {list.rows.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              filters={filters}
              canAssign={canAssign}
              selected={selected.has(lead.id)}
              toggle={toggle}
              assignedLabel={assignedLabel}
            />
          ))}
        </ul>
      )}

      {canAssign && selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-900 p-3 text-white shadow-raised sm:p-4">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="bulk-assignee" className="block text-sm font-medium text-slate-200">
              Assign {selected.size} selected to
            </label>
            <select
              id="bulk-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className={cx(input, 'border-slate-700')}
            >
              <option value="">Nobody (unassign)</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className={cx(btn('ghost'), 'text-slate-200 hover:bg-white/10')}>
            Clear selection
          </button>
          <button type="button" onClick={assign} disabled={pending} className={cx(btn('primary'), 'bg-white text-slate-900 hover:bg-slate-100')}>
            {pending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
          {filters.page > 1 ? (
            <Link href={leadsHref(filters, { page: filters.page - 1 })} className={btn('secondary')}>
              <Icon name="chevronLeft" className="h-4 w-4" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-600">
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages ? (
            <Link href={leadsHref(filters, { page: filters.page + 1 })} className={btn('secondary')}>
              Next
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  )
}

function LeadRow({
  lead,
  filters,
  canAssign,
  selected,
  toggle,
  assignedLabel,
}: {
  lead: LeadListRow
  filters: LeadFilters
  canAssign: boolean
  selected: boolean
  toggle: (id: string) => void
  assignedLabel: (id: string | null) => string
}) {
  const who = lead.name ?? lead.contact_mobile
  // A comment a person wrote is worth a line on the row; an import's note stays in the history.
  const note = lead.lastNote?.kind === 'note' ? lead.lastNote : null

  return (
    <li className={cx('flex items-start gap-3 px-3 py-3 transition-colors sm:px-4', selected ? 'bg-brand-50/60' : 'hover:bg-slate-50/70')}>
      {canAssign && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggle(lead.id)}
          aria-label={`Select ${who}`}
          className="mt-2.5 h-5 w-5 shrink-0 rounded accent-brand-700"
        />
      )}
      <Avatar name={lead.name} className="mt-0.5 hidden sm:grid" />
      <div className="min-w-0 flex-1">
        <RowTest lead={lead} action={lead.testAction} canPaper={canAssign} reportHref={summaryHref(lead.id, filters)}>
          <div className="grid min-w-0 flex-1 basis-full gap-x-6 gap-y-0.5 sm:basis-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/leads/${lead.id}`} className="rounded font-semibold text-slate-900 hover:text-brand-700">
                  {lead.name ?? <span className="font-normal italic text-slate-600">No name</span>}
                </Link>
                {/* "Issue link" says there is no test; the row must say a completed one is done. */}
                {lead.testAction !== 'issue' && lead.test && (
                  <Badge tone={lead.testAction === 'report' ? 'success' : 'info'} icon={lead.testAction === 'report' ? 'check' : 'clock'}>
                    {lead.test}
                  </Badge>
                )}
              </div>
              <p className="text-sm tabular-nums text-slate-600">
                {[lead.contact_mobile, lead.interest, lead.class_level && `Class ${lead.class_level}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="min-w-0 text-sm text-slate-600 lg:self-center">
              <p className="truncate">
                {[lead.sources.join(', ') || 'Added by hand', canAssign && assignedLabel(lead.assigned_to)].filter(Boolean).join(' · ')}
              </p>
              {note && (
                <p className="truncate text-slate-700">
                  <Icon name="message" className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-slate-500" />
                  {note.body}
                </p>
              )}
            </div>
            {/* The list is sorted by this date, newest first (migration 0027). */}
            <p className="text-sm tabular-nums text-slate-600 lg:self-center">
              {enquiryLabel(lead.enquired_on, lead.sources.length > 0, THIS_YEAR)}
            </p>
          </div>
          <span className="flex items-center gap-2">
            <NextStage leadId={lead.id} stage={lead.stage} who={who} />
            <MoveMenu leadId={lead.id} stage={lead.stage} who={who} />
          </span>
        </RowTest>
      </div>
    </li>
  )
}

function useMove(leadId: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const move = (to: Stage, then?: () => void) => {
    setError('')
    start(async () => {
      const r = await setStage(leadId, to)
      then?.()
      if (!r.ok) setError(r.error ?? 'Could not move the lead.')
      router.refresh()
    })
  }
  return { pending, error, move }
}

/** The usual next step in one click (NEXT_STAGE); none from an outcome. */
function NextStage({ leadId, stage, who }: { leadId: string; stage: Stage; who: string }) {
  const next = NEXT_STAGE[stage]
  const { pending, error, move } = useMove(leadId)
  if (!next) return null
  return (
    <>
      <button
        type="button"
        onClick={() => move(next)}
        disabled={pending}
        aria-label={`Move ${who} to ${COLUMN_TITLE[next]}`}
        className={btn('secondary', 'sm')}
      >
        <Icon name="arrowRight" className="h-4 w-4" />
        {pending ? 'Moving…' : COLUMN_TITLE[next]}
      </button>
      {error && (
        <span role="alert" className="text-sm text-rose-700">
          {error}
        </span>
      )}
    </>
  )
}

/**
 * Every other stage, forwards or back (2026-10-26). The database writes the
 * history line and refuses a lead the user cannot see.
 */
function MoveMenu({ leadId, stage, who }: { leadId: string; stage: Stage; who: string }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const { pending, error, move } = useMove(leadId)
  const close = () => menu.current?.removeAttribute('open')

  return (
    <div>
      <details
        ref={menu}
        className="relative"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close()
            menu.current?.querySelector('summary')?.focus()
          }
        }}
      >
        <summary
          aria-label={`Move ${who} to another stage`}
          title="Move to another stage"
          className={cx(btn('secondary', 'sm'), 'cursor-pointer list-none px-2.5 [&::-webkit-details-marker]:hidden')}
        >
          <Icon name="more" className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-raised">
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Move to</p>
          <ul>
            {STAGES.filter((s) => s !== stage).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => move(s, close)}
                  disabled={pending}
                  className="min-h-tap flex w-full items-center gap-2 rounded-md px-3 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                >
                  <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', DOT[STAGE_TONE[s]])} />
                  {COLUMN_TITLE[s]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
      {error && (
        <p role="alert" className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * "Download for Excel" (2026-10-26, after GoPost's): the stage and filters on
 * screen, every lead or only those that reached the app since your last
 * download of the stage. Each choice is a POST, since it moves your download
 * point (migration 0028); the browser saves the file and stays on the page.
 */
function DownloadMenu({
  filters,
  total,
  download,
}: {
  filters: LeadFilters
  total: number
  download: { lastAt: string | null; fresh: number | null }
}) {
  const router = useRouter()
  const menu = useRef<HTMLDetailsElement>(null)
  const title = COLUMN_TITLE[filters.stage]
  const item = 'flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <details
      ref={menu}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          menu.current?.removeAttribute('open')
          menu.current?.querySelector('summary')?.focus()
        }
      }}
    >
      <summary className={cx(btn('secondary'), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
        <Icon name="download" className="h-4 w-4" />
        Download for Excel
      </summary>
      <form
        method="post"
        action="/leads/export"
        onSubmit={() => {
          menu.current?.removeAttribute('open')
          // The new download point shows once the file has been built.
          setTimeout(() => router.refresh(), 2000)
        }}
        className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-raised"
      >
        <input type="hidden" name="stage" value={filters.stage} />
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        {filters.source && <input type="hidden" name="source" value={filters.source} />}
        {filters.interest && <input type="hidden" name="interest" value={filters.interest} />}
        {filters.assignee && <input type="hidden" name="assignee" value={filters.assignee} />}
        <button type="submit" name="kind" value="all" disabled={total === 0} className={item}>
          <span className="font-medium text-slate-900">
            All in {title} ({total.toLocaleString('en-IN')})
          </span>
          <span className="text-xs text-slate-600">With the search and filters on screen</span>
        </button>
        {download.lastAt ? (
          <button type="submit" name="kind" value="new" disabled={!download.fresh} className={item}>
            <span className="font-medium text-slate-900">
              New since your last download ({(download.fresh ?? 0).toLocaleString('en-IN')})
            </span>
            <span className="text-xs text-slate-600">Last download {download.lastAt}</span>
          </button>
        ) : (
          <p className="px-3 py-2 text-xs text-slate-600">
            Your first download of {title}, so there is no “new since” yet.
          </p>
        )}
      </form>
    </details>
  )
}

function AddLead({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  function submit(formData: FormData, asSibling = false) {
    if (asSibling) formData.set('confirm_sibling', 'yes')
    start(async () => {
      const r = await createLead(formData)
      setResult(r)
      if (r.ok) {
        router.refresh()
        onDone()
      }
    })
  }

  return (
    <form className={cx(card, 'mt-6 p-4 sm:p-6')} action={(formData) => submit(formData)}>
      <h2 className="text-base font-semibold text-slate-900">New lead</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Candidate name" required />
        <Field name="contact_mobile" label="Parent's mobile" required type="tel" hint="The test link is sent here" />
        <ClassField />
        <div>
          <label htmlFor="new-interest" className={label}>
            Interest
          </label>
          <select id="new-interest" name="interest" defaultValue="" className={select}>
            <option value="">Not known yet</option>
            {INTERESTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <Field name="school" label="School" />
        <Field name="city" label="City" />
        <Field name="board" label="Board" />
      </div>

      {result?.error && (
        <Alert tone="warning" role="alert" className="mt-4">
          <p>{result.error}</p>
          {result.duplicates && result.duplicates.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/leads/${d.id}`} className="underline">
                    {d.name ?? 'No name'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(result.hiddenDuplicates ?? 0) > 0 && (
            <p className="mt-2">
              {result.hiddenDuplicates === 1 ? 'One lead' : `${result.hiddenDuplicates} leads`} on this number{' '}
              {result.hiddenDuplicates === 1 ? 'is' : 'are'} assigned to someone else. Ask a counsellor before adding it again.
            </p>
          )}
          {result.duplicates && (
            <>
              <p className="mt-2">If this is a brother or sister on the same number, add them anyway.</p>
              <button
                type="submit"
                formNoValidate
                className={cx(btn('secondary', 'sm'), 'mt-2')}
                onClick={(e) => {
                  e.preventDefault()
                  const form = (e.target as HTMLElement).closest('form')!
                  submit(new FormData(form), true)
                }}
              >
                Add as a sibling
              </button>
            </>
          )}
        </Alert>
      )}

      <div className="mt-6 flex justify-end">
        <button type="submit" className={btn('primary')} disabled={pending}>
          {pending ? 'Saving…' : 'Save lead'}
        </button>
      </div>
    </form>
  )
}

function Field({
  name,
  label: text,
  required,
  type = 'text',
  hint: help,
}: {
  name: string
  label: string
  required?: boolean
  type?: string
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={name} className={label}>
        {text}
        {required && <span aria-hidden="true" className="text-rose-600"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        inputMode={type === 'tel' ? 'numeric' : undefined}
        aria-describedby={help ? `${name}-hint` : undefined}
        className={input}
      />
      {help && (
        <p id={`${name}-hint`} className={hint}>
          {help}
        </p>
      )}
    </div>
  )
}

/**
 * The class the candidate is being admitted to, not the one they are in. In
 * the admission season a student who has finished class 10 is in nobody's
 * class; the batch they join is unambiguous. Optional on a lead; issuing a
 * test refuses a lead without one, since it decides which items can be drawn.
 */
export function ClassField({ defaultValue = '', id = 'class_level' }: { defaultValue?: string; id?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        Admission to class
      </label>
      <select id={id} name="class_level" defaultValue={defaultValue} aria-describedby={`${id}-hint`} className={select}>
        <option value="">Not known yet</option>
        {CLASSES.map((c) => (
          <option key={c} value={c}>
            Class {c}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className={hint}>
        Needed before a test is issued
      </p>
    </div>
  )
}
