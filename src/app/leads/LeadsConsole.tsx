'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CLASSES } from '@/lib/classes'
import { STAGES, STAGE_LABEL, STAGE_TONE, INTERESTS, type LeadFilters } from '@/lib/leads'
import type { LeadList } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { Icon } from '@/components/icons'
import { Alert, Avatar, Badge, EmptyState, PageHeader, btn, card, control, cx, hint, input, label } from '@/components/ui'
import { createLead, assignLeads, type ActionResult } from './actions'
import { RowTest } from './RowTest'

export function LeadsConsole({
  staff,
  list,
  filters,
  sources,
  assignees,
  pageSize,
}: {
  staff: { id: string; name: string | null; email: string; role: string }
  list: LeadList
  filters: LeadFilters
  sources: { id: string; name: string }[]
  assignees: Assignee[]
  pageSize: number
}) {
  const [adding, setAdding] = useState(false)
  const canAssign = staff.role !== 'telecaller'

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

      {adding && <AddLead onDone={() => setAdding(false)} />}

      <Filters filters={filters} sources={sources} assignees={assignees} canAssign={canAssign} />

      <Results
        list={list}
        filters={filters}
        pageSize={pageSize}
        me={staff.id}
        assignees={assignees}
        canAssign={canAssign}
      />
    </>
  )
}

const select = input

/** A plain GET form: the filters live in the URL, so a filtered list can be bookmarked or shared. */
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
  const active = [filters.stage, filters.interest, filters.source, canAssign && filters.assignee].filter(Boolean).length
  const anything = active > 0 || Boolean(filters.q)

  return (
    <form method="get" action="/leads" className={cx(card, 'mt-6 p-3 sm:p-4')}>
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
        <div className="grid gap-3 px-1 pb-1 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="stage" className={label}>
              Stage
            </label>
            <select id="stage" name="stage" defaultValue={filters.stage ?? ''} className={select}>
              <option value="">Any</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
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

function pageHref(filters: LeadFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.interest) params.set('interest', filters.interest)
  if (filters.source) params.set('source', filters.source)
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/leads?${query}` : '/leads'
}

function Results({
  list,
  filters,
  pageSize,
  me,
  assignees,
  canAssign,
}: {
  list: LeadList
  filters: LeadFilters
  pageSize: number
  me: string
  assignees: Assignee[]
  canAssign: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignee, setAssignee] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  const pages = Math.max(1, Math.ceil(list.total / pageSize))
  const names = new Map(assignees.map((a) => [a.id, a.label]))
  const assignedLabel = (id: string | null) =>
    id === null ? 'Unassigned' : id === me ? 'You' : (names.get(id) ?? 'Not a telecaller now')
  const allOnPage = list.rows.length > 0 && list.rows.every((r) => selected.has(r.id))

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
    <section aria-labelledby="results-heading" className="mt-6">
      <div className="flex min-h-tap flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" className="text-sm font-medium text-slate-700">
          {list.total === 0 ? 'No leads' : `${list.total} lead${list.total === 1 ? '' : 's'}`}
          {pages > 1 && <span className="text-slate-600"> · page {filters.page} of {pages}</span>}
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
        <div className={cx(card, 'mt-2')}>
          <EmptyState title="No leads here">
            {filters.q || filters.stage || filters.interest || filters.source || filters.assignee
              ? 'Nothing matches these filters.'
              : 'Add a lead, or import a sheet.'}
          </EmptyState>
        </div>
      ) : (
        <ul className={cx(card, 'mt-2 divide-y divide-slate-100 overflow-hidden')}>
          {list.rows.map((lead) => {
            const isSelected = selected.has(lead.id)
            return (
              <li
                key={lead.id}
                className={cx('flex items-start gap-3 px-3 py-3.5 transition-colors sm:px-4', isSelected ? 'bg-brand-50/60' : 'hover:bg-slate-50/70')}
              >
                {canAssign && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(lead.id)}
                    aria-label={`Select ${lead.name ?? lead.contact_mobile}`}
                    className="mt-2.5 h-5 w-5 shrink-0 rounded accent-brand-700"
                  />
                )}
                <Avatar name={lead.name} className="mt-0.5 hidden sm:grid" />
                <div className="min-w-0 flex-1">
                  <RowTest lead={lead} action={lead.testAction} canPaper={canAssign}>
                    {/* Full width on a phone, so the button drops below rather than squeezing the details. */}
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/leads/${lead.id}`} className="rounded font-semibold text-slate-900 hover:text-brand-700">
                          {lead.name ?? <span className="font-normal italic text-slate-600">No name</span>}
                        </Link>
                        {/* New is where every lead starts; only a stage someone set is worth a tag. */}
                        {lead.stage !== 'new' && <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>}
                        {/* "Issue link" says there is no test; the row must say a completed one is done. */}
                        {lead.testAction !== 'issue' && lead.test && (
                          <Badge tone={lead.testAction === 'report' ? 'success' : 'info'} icon={lead.testAction === 'report' ? 'check' : 'clock'}>
                            {lead.test}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-600">
                        <span className="tabular-nums">{lead.contact_mobile}</span>
                        {[
                          lead.interest,
                          lead.class_level && `Class ${lead.class_level}`,
                          lead.sources.join(', ') || 'Added by hand',
                          canAssign && assignedLabel(lead.assigned_to),
                        ]
                          .filter(Boolean)
                          .map((part, i) => (
                            <span key={i} className="flex items-center gap-x-2">
                              <span aria-hidden="true" className="text-slate-300">
                                •
                              </span>
                              {part}
                            </span>
                          ))}
                      </p>
                    </div>
                  </RowTest>
                  {lead.lastNote && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                      <Icon name="message" className="mt-0.5 h-3.5 w-3.5 text-slate-500" />
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-slate-600">{lead.lastNote.author_name ?? 'Import'}:</span>{' '}
                        {lead.lastNote.body}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
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
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between">
          {filters.page > 1 ? (
            <Link href={pageHref(filters, filters.page - 1)} className={btn('secondary')}>
              <Icon name="chevronLeft" className="h-4 w-4" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {filters.page < pages && (
            <Link href={pageHref(filters, filters.page + 1)} className={btn('secondary')}>
              Next
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          )}
        </nav>
      )}
    </section>
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
