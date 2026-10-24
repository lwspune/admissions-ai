'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  HIRING_DECISION_LABEL,
  MAX_HIRING_NOTE,
  checkResume,
  decisionChoices,
  formatDecisionChange,
  istTime,
  type HiringDecision,
  type ResumeKind,
} from '@/lib/hiring'
import type { HiringNote, HiringResult } from '@/server/hiring'
import { browserClient } from '@/lib/browserClient'
import { Icon, type IconName } from '@/components/icons'
import { Alert, Eyebrow, btn, card, control, cx, hint, input, label } from '@/components/ui'
import { addNoteAction, attachResumeAction, setDecisionAction } from './actions'

// The after-the-test controls (migration 0023), on /hiring/[id] and inside each
// /hiring card. The database decides every rule; these only offer what will
// save and say why when not.

const HISTORY_ICON: Record<HiringNote['kind'], IconName> = {
  note: 'message',
  decision: 'refresh',
  resume: 'fileText',
}

/** Notes, decision changes and resumes, newest first; nothing in it is ever edited. */
export function History({ notes, empty = 'Nothing yet.' }: { notes: HiringNote[]; empty?: string }) {
  if (notes.length === 0) return <p className="mt-3 text-sm text-slate-600">{empty}</p>
  return (
    <ol className="relative mt-4 space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
      {notes.map((n) => (
        <li key={n.id} className="relative flex gap-3">
          <span
            className={cx(
              'relative grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white',
              n.kind === 'decision' ? 'bg-brand-50 text-brand-700' : n.kind === 'resume' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600',
            )}
          >
            <Icon name={HISTORY_ICON[n.kind]} className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <p className={n.kind === 'note' ? 'whitespace-pre-wrap break-words text-sm text-slate-900' : 'text-sm font-medium text-slate-700'}>
              {n.kind === 'decision' ? formatDecisionChange(n.body) : n.body}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {n.authorName ?? 'System'} · {istTime(n.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const run = (fn: () => Promise<HiringResult>, ok: string, onOk?: () => void) => {
    setResult(null)
    start(async () => {
      const r = await fn()
      setResult(r.ok ? { ok: true, message: ok } : { ok: false, message: r.error })
      if (r.ok) {
        onOk?.()
        router.refresh()
      }
    })
  }
  return { pending, result, setResult, run, start, router }
}

function Status({ result }: { result: { ok: boolean; message: string } | null }) {
  return (
    <p aria-live="polite" className={cx('mt-2 text-sm', result?.ok ? 'text-emerald-800' : 'text-rose-800')}>
      {result?.message ?? ''}
    </p>
  )
}

const eyebrow = 'block text-xs font-semibold uppercase tracking-wider text-slate-600'

export function DecisionControl({
  applicantId,
  decision,
  role,
  framed = true,
}: {
  applicantId: string
  decision: HiringDecision
  role: string
  /** Its own card on the applicant's page; bare inside a list card. */
  framed?: boolean
}) {
  const id = useId()
  const [value, setValue] = useState<HiringDecision>(decision)
  const { pending, result, run } = useAction()
  const choices = decisionChoices(role, decision)
  const locked = choices.length === 1

  return (
    <form
      className={framed ? cx(card, 'p-5') : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setDecisionAction(applicantId, value), 'Decision saved.')
      }}
    >
      {locked ? (
        <>
          <p className={eyebrow}>Decision</p>
          <p className="mt-2 text-sm text-slate-900">
            {HIRING_DECISION_LABEL[decision]}
            <span className="block text-xs text-slate-600">Set by superadmin.</span>
          </p>
        </>
      ) : (
        <>
          <label htmlFor={id} className={eyebrow}>
            Decision
          </label>
          <div className="mt-2 flex gap-2">
            <select
              id={id}
              value={value}
              onChange={(e) => setValue(e.target.value as HiringDecision)}
              className={cx(control, 'min-w-0 flex-1')}
            >
              {choices.map((d) => (
                <option key={d} value={d}>
                  {HIRING_DECISION_LABEL[d]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending || value === decision} className={btn('primary', 'md')}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {role !== 'superadmin' && <p className={hint}>Hired and rejected are superadmin’s to set.</p>}
        </>
      )}
      <Status result={result} />
    </form>
  )
}

export function ResumeControl({
  applicantId,
  resume,
}: {
  applicantId: string
  resume: { name: string; type: ResumeKind; at: string } | null
}) {
  const file = useRef<HTMLInputElement>(null)
  const { pending, result, setResult, start, router } = useAction()

  function upload(f: File) {
    setResult(null)
    start(async () => {
      try {
        const checked = checkResume(f, new Uint8Array(await f.slice(0, 8).arrayBuffer()))
        if (!checked.ok) {
          setResult({ ok: false, message: checked.error })
          return
        }
        const { error } = await browserClient()
          .storage.from('hiring-resumes')
          .upload(applicantId, f, { contentType: checked.contentType, upsert: true })
        if (error) {
          console.error('hiring: resume upload failed', error)
          setResult({ ok: false, message: 'The file could not be uploaded. Try again.' })
          return
        }
        const r = await attachResumeAction(applicantId, f.name)
        setResult(r.ok ? { ok: true, message: resume ? 'Resume replaced.' : 'Resume added.' } : { ok: false, message: r.error })
        if (r.ok) router.refresh()
      } finally {
        if (file.current) file.current.value = ''
      }
    })
  }

  return (
    <section aria-labelledby="resume-heading" className={cx(card, 'p-5')}>
      <Eyebrow id="resume-heading">Resume</Eyebrow>
      {resume ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-sm text-slate-900">
            <span className="block truncate font-medium">{resume.name}</span>
            <span className="text-xs text-slate-600">Added {istTime(resume.at)}</span>
          </p>
          <a
            href={`/hiring/${applicantId}/resume`}
            target="_blank"
            rel="noopener noreferrer"
            className={btn('secondary', 'sm')}
          >
            <Icon name={resume.type === 'pdf' ? 'fileText' : 'download'} className="h-4 w-4" />
            {resume.type === 'pdf' ? 'Open' : 'Download'}
          </a>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">None yet.</p>
      )}
      <label htmlFor="resume-file" className={cx(label, 'mt-4')}>
        {resume ? 'Replace with another file' : 'Upload a resume'}
      </label>
      <input
        ref={file}
        id="resume-file"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={pending}
        aria-describedby="resume-hint"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
        className="mt-1 block w-full rounded-lg text-sm text-slate-700 file:mr-3 file:min-h-tap file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      />
      <p id="resume-hint" className={hint}>
        {pending ? 'Uploading…' : 'PDF or Word (.docx), up to 5 MB.'}
      </p>
      <Status result={result} />
    </section>
  )
}

export function NoteForm({ applicantId }: { applicantId: string }) {
  // One per card on /hiring, so the id is per instance.
  const id = useId()
  const [body, setBody] = useState('')
  const { pending, result, run } = useAction()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(() => addNoteAction(applicantId, body), 'Note added.', () => setBody(''))
      }}
    >
      <label htmlFor={id} className={eyebrow}>
        Add a note
      </label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_HIRING_NOTE}
        rows={3}
        placeholder="e.g. Strong on calculus; call for a demo class"
        className={cx(input, 'resize-y')}
      />
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending || !body.trim()} className={btn('primary', 'md')}>
          {pending ? 'Saving…' : 'Add note'}
        </button>
      </div>
      {result && !result.ok && (
        <Alert tone="danger" className="mt-3">
          {result.message}
        </Alert>
      )}
      <p aria-live="polite" className="sr-only">
        {result?.ok ? result.message : ''}
      </p>
    </form>
  )
}
