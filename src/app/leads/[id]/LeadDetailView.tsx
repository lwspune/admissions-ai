'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { STAGES, STAGE_LABEL, INTERESTS, MAX_NOTE, formatStageChange } from '@/lib/leads'
import type { LeadDetail } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { addNote, setStage, assignLeads, updateLead, type ActionResult } from '../actions'
import { IssuePanel } from '../IssuePanel'
import { ClassField } from '../LeadsConsole'

const control = 'min-h-tap mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-base'
const primary = 'min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50'

export function LeadDetailView({
  detail,
  me,
  canAssign,
  assignees,
}: {
  detail: LeadDetail
  me: string
  canAssign: boolean
  assignees: Assignee[]
}) {
  const { lead, origins, comments, assessments } = detail

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-600 hover:underline">
        ← All leads
      </Link>

      <header className="mt-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {lead.name ?? <span className="italic text-slate-600">No name</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          <a href={`tel:+91${lead.contact_mobile}`} className="underline">
            {lead.contact_mobile}
          </a>
          {lead.interest && ` · ${lead.interest}`}
          {lead.class_level && ` · Admission to class ${lead.class_level}`}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {origins.length === 0
            ? 'Added by hand'
            : origins
                .map((o) => `${o.source}${o.source_date ? ` (${dateOnly(o.source_date)})` : ''}`)
                .join(' · ')}
        </p>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <StageControl leadId={lead.id} stage={lead.stage} />
        {canAssign ? (
          <AssignControl leadId={lead.id} assignedTo={lead.assigned_to} assignees={assignees} />
        ) : (
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Assigned to</p>
            <p className="mt-1">{lead.assigned_to === me ? 'You' : 'Someone else'}</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <NoteForm leadId={lead.id} />
      </div>

      <section aria-labelledby="history-heading" className="mt-6">
        <h2 id="history-heading" className="text-sm font-semibold text-slate-900">
          History
        </h2>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nothing yet.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded border border-slate-200 bg-white p-3">
                <p className={c.kind === 'stage' ? 'text-sm italic text-slate-700' : 'whitespace-pre-wrap text-sm text-slate-900'}>
                  {c.kind === 'stage' ? formatStageChange(c.body) : c.body}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {c.author_name ?? 'System'}
                  {c.kind === 'import' && ' · imported'} · {when(c.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-6">
        <IssuePanel lead={lead} assessments={assessments} />
      </div>

      <div className="mt-6">
        <EditLead lead={lead} />
      </div>
    </main>
  )
}

function useAction() {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) => {
    setResult(null)
    start(async () => {
      const r = await fn()
      setResult(r)
      if (r.ok) {
        onOk?.()
        router.refresh()
      }
    })
  }
  return { result, pending, run }
}

function Status({ result, ok }: { result: ActionResult | null; ok: string }) {
  if (result?.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-red-700">
        {result.error}
      </p>
    )
  }
  return (
    <p aria-live="polite" className="sr-only">
      {result?.ok ? ok : ''}
    </p>
  )
}

function StageControl({ leadId, stage }: { leadId: string; stage: LeadDetail['lead']['stage'] }) {
  const [value, setValue] = useState<string>(stage)
  const { result, pending, run } = useAction()

  return (
    <form
      className="rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setStage(leadId, value))
      }}
    >
      <label htmlFor="stage" className="block text-sm font-semibold text-slate-900">
        Stage
      </label>
      <div className="flex gap-2">
        <select id="stage" value={value} onChange={(e) => setValue(e.target.value)} className={control}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || value === stage} className={`${primary} mt-1`}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Status result={result} ok="Stage saved." />
    </form>
  )
}

function AssignControl({
  leadId,
  assignedTo,
  assignees,
}: {
  leadId: string
  assignedTo: string | null
  assignees: Assignee[]
}) {
  const [value, setValue] = useState(assignedTo ?? '')
  const { result, pending, run } = useAction()
  const known = assignedTo === null || assignees.some((a) => a.id === assignedTo)

  return (
    <form
      className="rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => assignLeads([leadId], value))
      }}
    >
      <label htmlFor="assignee" className="block text-sm font-semibold text-slate-900">
        Assigned to
      </label>
      <div className="flex gap-2">
        <select id="assignee" value={value} onChange={(e) => setValue(e.target.value)} className={control}>
          <option value="">Nobody</option>
          {!known && <option value={assignedTo!}>Not a telecaller now</option>}
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || value === (assignedTo ?? '')} className={`${primary} mt-1`}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Status result={result} ok="Assignment saved." />
    </form>
  )
}

function NoteForm({ leadId }: { leadId: string }) {
  const [body, setBody] = useState('')
  const { result, pending, run } = useAction()

  return (
    <form
      className="rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => addNote(leadId, body), () => setBody(''))
      }}
    >
      <label htmlFor="note" className="block text-sm font-semibold text-slate-900">
        Add a comment
      </label>
      <textarea
        id="note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_NOTE}
        rows={3}
        placeholder="e.g. CNR, will try after 6 pm"
        className={control}
      />
      <button type="submit" disabled={pending || !body.trim()} className={`${primary} mt-2`}>
        {pending ? 'Saving…' : 'Add comment'}
      </button>
      <Status result={result} ok="Comment added." />
    </form>
  )
}

function EditLead({ lead }: { lead: LeadDetail['lead'] }) {
  const { result, pending, run } = useAction()

  return (
    <form
      className="rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        run(() => updateLead(lead.id, data))
      }}
    >
      <h2 className="text-sm font-semibold text-slate-900">Details</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium text-slate-700">
            Candidate name
          </label>
          <input id="edit-name" name="name" defaultValue={lead.name ?? ''} className={control} />
        </div>
        <ClassField id="edit-class" defaultValue={lead.class_level ? String(lead.class_level) : ''} />
        <div>
          <label htmlFor="edit-interest" className="block text-sm font-medium text-slate-700">
            Interest
          </label>
          <select id="edit-interest" name="interest" defaultValue={lead.interest ?? ''} className={control}>
            <option value="">Not known yet</option>
            {INTERESTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-school" className="block text-sm font-medium text-slate-700">
            School
          </label>
          <input id="edit-school" name="school" defaultValue={lead.school ?? ''} className={control} />
        </div>
        <div>
          <label htmlFor="edit-city" className="block text-sm font-medium text-slate-700">
            City
          </label>
          <input id="edit-city" name="city" defaultValue={lead.city ?? ''} className={control} />
        </div>
      </div>
      <button type="submit" disabled={pending} className={`${primary} mt-3`}>
        {pending ? 'Saving…' : 'Save details'}
      </button>
      <Status result={result} ok="Details saved." />
    </form>
  )
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function dateOnly(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
