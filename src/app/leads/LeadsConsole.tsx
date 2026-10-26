'use client'

import { useRef, useState, useTransition } from 'react'
import { canManageLeads } from '@/lib/staff'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CLASSES } from '@/lib/classes'
import {
  STAGES,
  COLUMN_TITLE,
  BOARD_MAX,
  BOARD_STEP,
  INTERESTS,
  leadsHref,
  summaryHref,
  type LeadFilters,
  type Stage,
} from '@/lib/leads'
import type { LeadList, LeadListRow } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { Icon } from '@/components/icons'
import { Alert, Avatar, Badge, PageHeader, btn, card, control, cx, hint, input, label } from '@/components/ui'
import { createLead, assignLeads, setStage, type ActionResult } from './actions'
import { RowTest } from './RowTest'

export function LeadsConsole({
  staff,
  board,
  filters,
  sources,
  assignees,
  feedWarning,
}: {
  staff: { id: string; name: string | null; email: string; role: string }
  board: Record<Stage, LeadList>
  filters: LeadFilters
  sources: { id: string; name: string }[]
  assignees: Assignee[]
  /** GoPost's leads are not arriving (src/lib/gopostLeads.ts); counsellors and superadmin only. */
  feedWarning: string | null
}) {
  const [adding, setAdding] = useState(false)
  const canAssign = canManageLeads(staff.role)

  return (
    <>
      <PageHeader
        title="Leads"
        actions={
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
        }
      />

      {feedWarning && (
        <Alert tone="warning" role="status" className="mt-4">
          <p>{feedWarning}</p>
        </Alert>
      )}

      {adding && <AddLead onDone={() => setAdding(false)} />}

      <Filters filters={filters} sources={sources} assignees={assignees} canAssign={canAssign} />

      <Board board={board} filters={filters} me={staff.id} assignees={assignees} canAssign={canAssign} />
    </>
  )
}

const select = input

/**
 * A plain GET form: the filters live in the URL, so a filtered board can be
 * bookmarked or shared. There is no stage filter: every stage is a column.
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
  const active = [filters.interest, filters.source, canAssign && filters.assignee].filter(Boolean).length
  const anything = active > 0 || Boolean(filters.q)

  return (
    <form method="get" action="/leads" className={cx(card, 'mt-6 p-3 sm:p-4')}>
      {/* A search keeps a phone on the column it was looking at. */}
      {filters.col !== 'new' && <input type="hidden" name="col" value={filters.col} />}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
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
        <button type="submit" className={btn('primary')}>
          Search
        </button>
        {anything && (
          <Link href="/leads" className={btn('ghost')}>
            Clear
          </Link>
        )}
      </div>

      <details open={active > 0} className="group mt-2">
        <summary className="min-h-tap inline-flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <Icon name="filter" className="h-4 w-4 text-slate-500" />
          Filters
          {active > 0 && <Badge tone="brand">{active}</Badge>}
          <Icon name="chevronDown" className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 px-1 pb-1 pt-2 sm:grid-cols-3">
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
          <div>
            <label htmlFor="source" className={label}>
              Source
            </label>
            <select id="source" name="source" defaultValue={filters.source ?? ''} className={select}>
              <option value="">Any</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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

/**
 * The pipeline (2026-10-26): one column per stage, and a lead moves between
 * them from its card. On a wide screen the five columns sit side by side; on
 * anything narrower, tabs show one column at a time, since five do not fit.
 */
function Board({
  board,
  filters,
  me,
  assignees,
  canAssign,
}: {
  board: Record<Stage, LeadList>
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

  const names = new Map(assignees.map((a) => [a.id, a.label]))
  const assignedLabel = (id: string | null) =>
    id === null ? 'Unassigned' : id === me ? 'You' : (names.get(id) ?? 'Not a telecaller now')

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
    <section aria-label="Pipeline" className="mt-6">
      {/* The last tab is cut off at the edge, which says there are more; a scrollbar would only add a grey line. */}
      <nav aria-label="Stages" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] xl:hidden [&::-webkit-scrollbar]:hidden">
        {STAGES.map((s) => (
          <Link
            key={s}
            href={leadsHref(filters, { col: s })}
            aria-current={s === filters.col ? 'page' : undefined}
            className={cx(
              'min-h-tap inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium',
              s === filters.col ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {COLUMN_TITLE[s]}
            <span className={cx('tabular-nums', s === filters.col ? 'text-brand-100' : 'text-slate-500')}>{board[s].total}</span>
          </Link>
        ))}
      </nav>

      <p aria-live="polite" className={result?.error ? 'mt-2 text-sm text-rose-700' : 'sr-only'}>
        {result?.error ?? (result?.ok ? 'Assigned.' : '')}
      </p>

      <div className="mt-3 xl:mt-0 xl:grid xl:grid-cols-5 xl:items-start xl:gap-3">
        {STAGES.map((s) => (
          <Column
            key={s}
            stage={s}
            list={board[s]}
            filters={filters}
            shown={s === filters.col}
            canAssign={canAssign}
            selected={selected}
            toggle={toggle}
            assignedLabel={assignedLabel}
          />
        ))}
      </div>

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
    </section>
  )
}

function Column({
  stage,
  list,
  filters,
  shown,
  canAssign,
  selected,
  toggle,
  assignedLabel,
}: {
  stage: Stage
  list: LeadList
  filters: LeadFilters
  /** The column a phone shows; on a wide screen every column shows. */
  shown: boolean
  canAssign: boolean
  selected: Set<string>
  toggle: (id: string) => void
  assignedLabel: (id: string | null) => string
}) {
  const headingId = `column-${stage}`
  const allHere = list.rows.length > 0 && list.rows.every((r) => selected.has(r.id))
  const more = list.total - list.rows.length

  return (
    <section aria-labelledby={headingId} className={cx(shown ? 'block' : 'hidden', 'min-w-0 xl:block')}>
      <div className="flex min-h-tap items-center justify-between gap-2 px-1">
        {/* Below xl the selected tab already names the column; the heading stays for screen readers. */}
        <h2 id={headingId} className="text-sm font-semibold text-slate-800 max-xl:sr-only">
          {COLUMN_TITLE[stage]} <span className="font-normal tabular-nums text-slate-600">{list.total}</span>
        </h2>
        {canAssign && list.rows.length > 0 && (
          <label className="inline-flex min-h-tap cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={allHere}
              onChange={() => list.rows.forEach((r) => (allHere || !selected.has(r.id)) && toggle(r.id))}
              aria-label={`Select every lead shown in ${COLUMN_TITLE[stage]}`}
              className="h-5 w-5 rounded accent-brand-700"
            />
            All
          </label>
        )}
      </div>

      {list.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">No leads</p>
      ) : (
        <ul className="space-y-2">
          {list.rows.map((lead) => (
            <LeadCard
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

      {more > 0 &&
        (filters.show[stage] < BOARD_MAX ? (
          <Link href={leadsHref(filters, { more: stage })} scroll={false} className={cx(btn('secondary', 'sm'), 'mt-2 w-full')}>
            Show {Math.min(BOARD_STEP, more)} more
            <span className="font-normal text-slate-600">· {more} not shown</span>
          </Link>
        ) : (
          <p className="mt-2 px-1 text-xs text-slate-600">
            {more} more not shown. Search or filter to find one.
          </p>
        ))}
    </section>
  )
}

function LeadCard({
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
  return (
    <li className={cx(card, 'p-3', selected && 'ring-2 ring-brand-500')}>
      <div className="flex items-start gap-2">
        {canAssign && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggle(lead.id)}
            aria-label={`Select ${who}`}
            className="mt-0.5 h-5 w-5 shrink-0 rounded accent-brand-700"
          />
        )}
        <Avatar name={lead.name} className="hidden sm:grid xl:hidden" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/leads/${lead.id}`} className="break-words rounded font-semibold text-slate-900 hover:text-brand-700">
              {lead.name ?? <span className="font-normal italic text-slate-600">No name</span>}
            </Link>
            {/* "Issue link" says there is no test; the card must say a completed one is done. */}
            {lead.testAction !== 'issue' && lead.test && (
              <Badge tone={lead.testAction === 'report' ? 'success' : 'info'} icon={lead.testAction === 'report' ? 'check' : 'clock'}>
                {lead.test}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {[lead.contact_mobile, lead.interest, lead.class_level && `Class ${lead.class_level}`].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm text-slate-600">
            {[lead.sources.join(', ') || 'Added by hand', canAssign && assignedLabel(lead.assigned_to)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {lead.lastNote && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
          <Icon name="message" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="line-clamp-2 min-w-0">
            <span className="font-medium text-slate-600">{lead.lastNote.author_name ?? 'Import'}:</span> {lead.lastNote.body}
          </span>
        </p>
      )}

      <div className="mt-2">
        <RowTest lead={lead} action={lead.testAction} canPaper={canAssign} reportHref={summaryHref(lead.id, filters)}>
          <MoveMenu leadId={lead.id} stage={lead.stage} who={who} />
        </RowTest>
      </div>
    </li>
  )
}

/**
 * Moves a lead to any other stage, forwards or back (2026-10-26). The
 * database writes the history line and refuses a lead the user cannot see.
 */
function MoveMenu({ leadId, stage, who }: { leadId: string; stage: Stage; who: string }) {
  const router = useRouter()
  const menu = useRef<HTMLDetailsElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  function close() {
    menu.current?.removeAttribute('open')
  }

  function move(to: Stage) {
    setError('')
    start(async () => {
      const r = await setStage(leadId, to)
      close()
      if (!r.ok) setError(r.error ?? 'Could not move the lead.')
      router.refresh()
    })
  }

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
          className={cx(btn('secondary', 'sm'), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}
        >
          {pending ? 'Moving…' : 'Move'}
          <Icon name="chevronDown" className="h-4 w-4" />
        </summary>
        <ul className="absolute left-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-raised">
          {STAGES.filter((s) => s !== stage).map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => move(s)}
                disabled={pending}
                className="min-h-tap w-full rounded-md px-3 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              >
                {COLUMN_TITLE[s]}
              </button>
            </li>
          ))}
        </ul>
      </details>
      {error && (
        <p role="alert" className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
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
