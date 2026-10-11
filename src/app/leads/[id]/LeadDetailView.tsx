'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { STAGES, STAGE_LABEL, STAGE_TONE, INTERESTS, MAX_NOTE, formatStageChange } from '@/lib/leads'
import type { LeadDetail } from '@/server/leads'
import type { Assignee } from '@/server/staff'
import { Icon, type IconName } from '@/components/icons'
import { Avatar, Badge, Eyebrow, btn, card, cx, input, label } from '@/components/ui'
import { addNote, setStage, assignLeads, updateLead, type ActionResult } from '../actions'
import { IssuePanel } from '../IssuePanel'
import { ClassField } from '../LeadsConsole'

const control = input
const primary = btn('primary')

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
    <>
      <Link href="/leads" className="inline-flex min-h-tap items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="chevronLeft" className="h-4 w-4" />
        All leads
      </Link>

      <header className={cx(card, 'mt-2 flex flex-wrap items-start gap-4 p-5 sm:p-6')}>
        <Avatar name={lead.name} className="h-14 w-14 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {lead.name ?? <span className="font-normal italic text-slate-600">No name</span>}
            </h1>
            <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <a
              href={`tel:+91${lead.contact_mobile}`}
              className="inline-flex items-center gap-1.5 rounded font-medium tabular-nums text-brand-700 hover:text-brand-800"
            >
              <Icon name="phone" className="h-4 w-4" />
              {lead.contact_mobile}
            </a>
            {lead.interest && <span>{lead.interest}</span>}
            {lead.class_level && <span>Admission to class {lead.class_level}</span>}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {origins.length === 0
              ? 'Added by hand'
              : origins
                  .map((o) => `${o.source}${o.source_date ? ` (${dateOnly(o.source_date)})` : ''}`)
                  .join(' · ')}
          </p>
        </div>
      </header>

      {/* On a phone the test and stage come first; on a wide screen they sit beside the history. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="space-y-4 lg:order-2">
          <IssuePanel lead={lead} assessments={assessments} />
          <StageControl leadId={lead.id} stage={lead.stage} />
          {canAssign ? (
            <AssignControl leadId={lead.id} assignedTo={lead.assigned_to} assignees={assignees} />
          ) : (
            <div className={cx(card, 'p-5')}>
              <Eyebrow>Assigned to</Eyebrow>
              <p className="mt-2 text-sm text-slate-900">{lead.assigned_to === me ? 'You' : 'Someone else'}</p>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6 lg:order-1">
          <NoteForm leadId={lead.id} />

          <section aria-labelledby="history-heading" className={cx(card, 'p-5 sm:p-6')}>
            <Eyebrow id="history-heading">History</Eyebrow>
            {comments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Nothing yet.</p>
            ) : (
              <ol className="relative mt-4 space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
                {comments.map((c) => (
                  <li key={c.id} className="relative flex gap-3">
                    <span
                      className={cx(
                        'relative grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white',
                        c.kind === 'stage' ? 'bg-brand-50 text-brand-700' : c.kind === 'import' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      <Icon name={HISTORY_ICON[c.kind] ?? 'message'} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className={c.kind === 'stage' ? 'text-sm font-medium text-slate-700' : 'whitespace-pre-wrap text-sm text-slate-900'}>
                        {c.kind === 'stage' ? formatStageChange(c.body) : c.body}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {c.author_name ?? 'System'}
                        {c.kind === 'import' && ' · imported'} · {when(c.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <EditLead lead={lead} />
        </div>
      </div>
    </>
  )
}

const HISTORY_ICON: Record<string, IconName> = {
  stage: 'refresh',
  import: 'upload',
  note: 'message',
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
      <p role="alert" className="mt-2 text-sm text-rose-700">
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
      className={cx(card, 'p-5')}
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setStage(leadId, value))
      }}
    >
      <label htmlFor="stage" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
        Stage
      </label>
      <div className="mt-1 flex gap-2">
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
      className={cx(card, 'p-5')}
      onSubmit={(e) => {
        e.preventDefault()
        run(() => assignLeads([leadId], value))
      }}
    >
      <label htmlFor="assignee" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
        Assigned to
      </label>
      <div className="mt-1 flex gap-2">
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
      className={cx(card, 'p-5 sm:p-6')}
      onSubmit={(e) => {
        e.preventDefault()
        run(() => addNote(leadId, body), () => setBody(''))
      }}
    >
      <label htmlFor="note" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
        Add a comment
      </label>
      <textarea
        id="note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_NOTE}
        rows={3}
        placeholder="e.g. CNR, will try after 6 pm"
        className={cx(control, 'mt-2 resize-y')}
      />
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending || !body.trim()} className={primary}>
          {pending ? 'Saving…' : 'Add comment'}
        </button>
      </div>
      <Status result={result} ok="Comment added." />
    </form>
  )
}

function EditLead({ lead }: { lead: LeadDetail['lead'] }) {
  const { result, pending, run } = useAction()

  return (
    <form
      className={cx(card, 'p-5 sm:p-6')}
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        run(() => updateLead(lead.id, data))
      }}
    >
      <Eyebrow>Details</Eyebrow>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-name" className={label}>
            Candidate name
          </label>
          <input id="edit-name" name="name" defaultValue={lead.name ?? ''} className={control} />
        </div>
        <ClassField id="edit-class" defaultValue={lead.class_level ? String(lead.class_level) : ''} />
        <div>
          <label htmlFor="edit-interest" className={label}>
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
          <label htmlFor="edit-school" className={label}>
            School
          </label>
          <input id="edit-school" name="school" defaultValue={lead.school ?? ''} className={control} />
        </div>
        <div>
          <label htmlFor="edit-city" className={label}>
            City
          </label>
          <input id="edit-city" name="city" defaultValue={lead.city ?? ''} className={control} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Saving…' : 'Save details'}
        </button>
      </div>
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
