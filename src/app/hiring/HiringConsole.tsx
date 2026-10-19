'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { HiringApplicantRow } from '@/server/hiring'
import {
  HIRING_SHAPE,
  HIRING_SUBJECTS,
  HIRING_SUBJECT_LABEL,
  applicantStatus,
  hiringIssueMessage,
  istDay,
  timeUsedMs,
  type ApplicantStage,
} from '@/lib/hiring'
import { Icon } from '@/components/icons'
import { useConfirm } from '@/components/ConfirmDialog'
import { Alert, Badge, EmptyState, btn, card, cx, input, label } from '@/components/ui'
import { addApplicantAction, issueTestAction } from './actions'

const STAGE_TONE: Record<ApplicantStage, 'neutral' | 'brand' | 'warning' | 'success'> = {
  none: 'neutral',
  sent: 'brand',
  opened: 'brand',
  in_progress: 'warning',
  expired: 'neutral',
  submitted: 'success',
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`
const date = istDay

export function HiringConsole({
  applicants,
  addedBy,
  now,
  appUrl,
}: {
  applicants: HiringApplicantRow[]
  /** Login id → name, for superadmin; null for a teacher, who sees only their own. */
  addedBy: Record<string, string> | null
  now: string
  appUrl: string
}) {
  return (
    <>
      <AddApplicant />
      {applicants.length === 0 ? (
        <div className={cx(card, 'mt-6')}>
          <EmptyState icon="user" title="No applicants yet">
            Add one above, then send them the test link on WhatsApp.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {applicants.map((a) => (
            <ApplicantCard key={a.id} applicant={a} addedBy={addedBy} now={new Date(now)} appUrl={appUrl} />
          ))}
        </ul>
      )}
    </>
  )
}

function AddApplicant() {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  function submit(formData: FormData) {
    setError('')
    start(async () => {
      const r = await addApplicantAction(formData)
      if (!r.ok) {
        setError(r.error)
        return
      }
      form.current?.reset()
      router.refresh()
    })
  }

  return (
    <form ref={form} action={submit} className={cx(card, 'mt-6 p-4 sm:p-6')} aria-labelledby="add-heading">
      <h2 id="add-heading" className="text-base font-semibold text-slate-900">
        Add an applicant
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="name" className={label}>
            Name
          </label>
          <input id="name" name="name" type="text" required maxLength={100} autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="mobile" className={label}>
            Mobile number
          </label>
          <input id="mobile" name="mobile" type="tel" inputMode="numeric" required autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="subject" className={label}>
            Subject
          </label>
          <select id="subject" name="subject" required defaultValue="" className={input}>
            <option value="" disabled>
              Choose…
            </option>
            {HIRING_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {HIRING_SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btn('primary', 'md')} disabled={pending}>
          <Icon name="plus" className="h-4 w-4" />
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </form>
  )
}

function ApplicantCard({
  applicant: a,
  addedBy,
  now,
  appUrl,
}: {
  applicant: HiringApplicantRow
  addedBy: Record<string, string> | null
  now: Date
  appUrl: string
}) {
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [shown, setShown] = useState<{ url: string; fresh: boolean } | null>(null)

  const latest = a.latest
  const status = applicantStatus(
    latest ? { state: latest.state, issue_seq: latest.issueSeq, expires_at: latest.expiresAt } : null,
    a.attempt ? { deadline_at: a.attempt.deadlineAt, submitted_at: a.attempt.submittedAt, submit_reason: a.attempt.submitReason } : null,
    now,
  )
  const liveUrl = latest && (status.kind === 'sent' || status.kind === 'opened') ? `${appUrl}/h/${latest.token}` : null
  const used = a.attempt && latest ? timeUsedMs({ started_at: a.attempt.startedAt, submitted_at: a.attempt.submittedAt }, latest.limitMinutes) : null
  const total = HIRING_SHAPE[a.subject].mcq + HIRING_SHAPE[a.subject].numeric

  async function issue() {
    if (latest && status.kind !== 'expired') {
      const ok = await confirm({
        title: 'Send a new link?',
        body: `${a.name}'s current link stops working, and the new one has different questions. They can have three links in all.`,
        confirm: 'Send a new link',
      })
      if (!ok) return
    }
    setError('')
    start(async () => {
      const r = await issueTestAction(a.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setShown({ url: r.url, fresh: true })
      router.refresh()
    })
  }

  return (
    <li className={cx(card, 'p-4 sm:p-5')}>
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{a.name}</span>
            <Badge tone="neutral">{HIRING_SUBJECT_LABEL[a.subject]}</Badge>
            <Badge tone={STAGE_TONE[status.kind]}>{status.label}</Badge>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {a.mobile} · added {date(a.createdAt)}
            {addedBy && <> by {a.createdBy ? (addedBy[a.createdBy] ?? 'a removed account') : 'a removed account'}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.kind === 'submitted' && (
            <Link href={`/hiring/${a.id}`} className={btn('secondary', 'sm')}>
              See answers
            </Link>
          )}
          {liveUrl && !shown && (
            <button type="button" className={btn('secondary', 'sm')} onClick={() => setShown({ url: liveUrl, fresh: false })}>
              <Icon name="message" className="h-4 w-4" />
              Send again
            </button>
          )}
          {status.canIssue && (
            <button type="button" className={btn(latest ? 'secondary' : 'primary', 'sm')} onClick={() => void issue()} disabled={pending}>
              <Icon name={latest ? 'refresh' : 'link'} className="h-4 w-4" />
              {pending ? 'Issuing…' : latest ? 'New link' : 'Send test link'}
            </button>
          )}
        </div>
      </div>

      {status.kind === 'submitted' && a.attempt?.score !== null && a.attempt && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="text-lg font-semibold tabular-nums text-slate-900">{a.attempt.score}</span>
          <span className="text-slate-600"> / {total}</span>
          <span className="ml-2">
            {a.attempt.correct} right · {a.attempt.incorrect} wrong · {a.attempt.skipped} skipped
            {used !== null && <> · {clock(used)} used</>}
          </span>
        </p>
      )}

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
      {shown && <LinkToSend name={a.name} mobile={a.mobile} subject={a.subject} url={shown.url} fresh={shown.fresh} />}
    </li>
  )
}

/** The link, ready for WhatsApp: the applicant's own number, the message filled in. */
function LinkToSend({
  name,
  mobile,
  subject,
  url,
  fresh,
}: {
  name: string
  mobile: string
  subject: HiringApplicantRow['subject']
  url: string
  /** Just issued: any earlier link has stopped. False when resending the live one. */
  fresh: boolean
}) {
  const [copied, setCopied] = useState(false)
  const message = hiringIssueMessage({ name, subject, url })
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
        <Icon name="checkCircle" className="h-4 w-4" />
        Send this to {name} on WhatsApp.{fresh ? ' Any earlier link has stopped working.' : ''}
      </p>
      <p className="mt-3 whitespace-pre-line rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 ring-1 ring-inset ring-emerald-200">
        {message}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn('secondary', 'sm')}
          onClick={async () => {
            await navigator.clipboard.writeText(message)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
          {copied ? 'Copied' : 'Copy message'}
        </button>
        <a
          className={btn('success', 'sm')}
          href={`https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="message" className="h-4 w-4" />
          Open in WhatsApp
        </a>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? 'Message copied to clipboard' : ''}
      </p>
    </div>
  )
}
