'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { browserClient } from '@/lib/browserClient'
import { CLASSES } from '@/lib/classes'
import { STAGES, STAGE_LABEL, INTERESTS, type LeadFilters } from '@/lib/leads'
import type { LeadList } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { createLead, assignLeads, type ActionResult } from './actions'

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
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const canAssign = staff.role !== 'telecaller'

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-600">
            {staff.name ?? staff.email} · {staff.role}
          </p>
        </div>
        <nav aria-label="Staff pages" className="flex flex-wrap gap-2">
          {/* Cosmetic only. Each page refuses the wrong role on its own, and
              the database refuses underneath: import_leads, RLS on test_items,
              the gate in src/server/staff.ts. */}
          {canAssign && <NavLink href="/leads/import">Import</NavLink>}
          {staff.role === 'superadmin' && (
            <>
              <NavLink href="/items">Questions</NavLink>
              <NavLink href="/staff">Staff</NavLink>
            </>
          )}
          <button
            type="button"
            className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? 'Cancel' : 'Add lead'}
          </button>
          <button
            type="button"
            className="min-h-tap rounded border border-slate-300 px-4 py-2 text-sm"
            onClick={async () => {
              await browserClient().auth.signOut()
              router.push('/login')
              router.refresh()
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

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
    </main>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm">
      {children}
    </Link>
  )
}

const select = 'min-h-tap mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-base'

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
  return (
    <form method="get" action="/leads" className="mt-5 grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3 lg:grid-cols-6">
      <div className="sm:col-span-3 lg:col-span-2">
        <label htmlFor="q" className="block text-sm font-medium text-slate-700">
          Search
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Name or mobile"
          className={select}
        />
      </div>
      <div>
        <label htmlFor="stage" className="block text-sm font-medium text-slate-700">
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
        <label htmlFor="interest" className="block text-sm font-medium text-slate-700">
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
        <label htmlFor="source" className="block text-sm font-medium text-slate-700">
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
          <label htmlFor="assignee" className="block text-sm font-medium text-slate-700">
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
      <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
        <button type="submit" className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Filter
        </button>
        <Link href="/leads" className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm">
          Clear
        </Link>
      </div>
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
    <section aria-labelledby="results-heading" className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" className="text-sm font-medium text-slate-700">
          {list.total === 0 ? 'No leads' : `${list.total} lead${list.total === 1 ? '' : 's'}`}
          {pages > 1 && ` · page ${filters.page} of ${pages}`}
        </h2>
        {canAssign && list.rows.length > 0 && (
          <label className="inline-flex min-h-tap items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allOnPage}
              onChange={() => setSelected(allOnPage ? new Set() : new Set(list.rows.map((r) => r.id)))}
              className="h-5 w-5"
            />
            Select all on this page
          </label>
        )}
      </div>

      {canAssign && selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <div>
            <label htmlFor="bulk-assignee" className="block text-sm font-medium text-slate-700">
              Assign {selected.size} selected to
            </label>
            <select
              id="bulk-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className={select}
            >
              <option value="">Nobody (unassign)</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={assign}
            disabled={pending}
            className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}
      <p aria-live="polite" className={result?.error ? 'mt-2 text-sm text-red-700' : 'sr-only'}>
        {result?.error ?? (result?.ok ? 'Assigned.' : '')}
      </p>

      <ul className="mt-3 space-y-2">
        {list.rows.map((lead) => (
          <li key={lead.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
            {canAssign && (
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggle(lead.id)}
                aria-label={`Select ${lead.name ?? lead.contact_mobile}`}
                className="mt-1 h-5 w-5 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                  {lead.name ?? <span className="italic text-slate-600">No name</span>}
                  <span className="font-normal text-slate-600"> · {lead.contact_mobile}</span>
                </Link>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                  {STAGE_LABEL[lead.stage]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {[
                  lead.interest,
                  lead.class_level && `Class ${lead.class_level}`,
                  lead.sources.join(', ') || 'Added by hand',
                  canAssign && assignedLabel(lead.assigned_to),
                  lead.test,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {lead.lastNote && (
                <p className="mt-1 truncate text-sm text-slate-700">
                  <span className="text-slate-600">{lead.lastNote.author_name ?? 'Import'}:</span> {lead.lastNote.body}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex justify-between">
          {filters.page > 1 ? (
            <Link href={pageHref(filters, filters.page - 1)} className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm">
              Previous
            </Link>
          ) : (
            <span />
          )}
          {filters.page < pages && (
            <Link href={pageHref(filters, filters.page + 1)} className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm">
              Next
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
    <form className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" action={(formData) => submit(formData)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label="Candidate name" required />
        <Field name="contact_mobile" label="Parent's mobile" required type="tel" hint="The test link is sent here" />
        <ClassField />
        <div>
          <label htmlFor="new-interest" className="block text-sm font-medium text-slate-700">
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
        <div role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="text-amber-900">{result.error}</p>
          {result.duplicates && result.duplicates.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-900">
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
            <p className="mt-2 text-amber-900">
              {result.hiddenDuplicates === 1 ? 'One lead' : `${result.hiddenDuplicates} leads`} on this number{' '}
              {result.hiddenDuplicates === 1 ? 'is' : 'are'} assigned to someone else. Ask a counsellor before adding it again.
            </p>
          )}
          {result.duplicates && (
            <>
              <p className="mt-2 text-amber-900">If this is a brother or sister on the same number, add them anyway.</p>
              <button
                type="submit"
                formNoValidate
                className="min-h-tap mt-2 rounded border border-amber-400 bg-white px-3 py-2 text-sm font-medium"
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
        </div>
      )}

      <button
        type="submit"
        className="min-h-tap mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save lead'}
      </button>
    </form>
  )
}

function Field({
  name,
  label,
  required,
  type = 'text',
  hint,
}: {
  name: string
  label: string
  required?: boolean
  type?: string
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        inputMode={type === 'tel' ? 'numeric' : undefined}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="min-h-tap mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
      />
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
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
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
        Needed before a test is issued
      </p>
    </div>
  )
}
