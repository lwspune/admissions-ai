'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { browserClient } from '@/lib/browserClient'
import { createLead, issueForLead, type ActionResult } from './actions'

export interface LeadRow {
  id: string
  name: string
  contact_mobile: string
  city: string | null
  school: string | null
  class_level: string | null
  created_at: string
  assessments: {
    id: string
    lead_id: string
    issue_seq: number
    state: string
    created_at: string
    expires_at: string
  }[]
}

const STATE_LABEL: Record<string, string> = {
  issued: 'Link sent',
  opened: 'Link opened',
  started: 'In progress',
  submitted: 'Completed',
  expired: 'Expired',
  voided: 'Replaced',
}

export function LeadsConsole({
  staff,
  leads,
}: {
  staff: { name: string | null; email: string; role: string }
  leads: LeadRow[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500">
            {staff.name ?? staff.email} · {staff.role}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Cosmetic only. /items and /staff 404 for anyone who is not a
              superadmin; RLS on test_items and the gate in src/server/staff.ts
              are the rules underneath. */}
          {staff.role === 'superadmin' && (
            <>
              <Link
                href="/items"
                className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm"
              >
                Questions
              </Link>
              <Link
                href="/staff"
                className="min-h-tap inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm"
              >
                Staff
              </Link>
            </>
          )}
          <button
            type="button"
            className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? 'Cancel' : 'Add candidate'}
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
        </div>
      </header>

      {adding && <AddLead onDone={() => setAdding(false)} />}

      {leads.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          No candidates yet. Add one to issue a test.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </main>
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
    <form
      className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
      action={(formData) => submit(formData)}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label="Candidate name" required />
        <Field name="contact_mobile" label="Parent's mobile" required type="tel" hint="The link is sent here" />
        <Field name="school" label="School" />
        <Field name="class_level" label="Class" />
        <Field name="city" label="City" />
        <Field name="board" label="Board" />
      </div>

      {result?.error && (
        <div role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="text-amber-900">{result.error}</p>
          {result.duplicates && (
            <>
              <ul className="mt-2 list-disc pl-5 text-amber-900">
                {result.duplicates.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
              <p className="mt-2 text-amber-900">
                If this is a brother or sister on the same number, add them anyway.
              </p>
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
        {pending ? 'Saving…' : 'Save candidate'}
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
        <p id={`${name}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  )
}

function LeadCard({ lead }: { lead: LeadRow }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const issues = lead.assessments.length
  const live = lead.assessments.find((a) => ['issued', 'opened', 'started'].includes(a.state))
  const done = lead.assessments.find((a) => a.state === 'submitted')

  function issue() {
    setError('')
    setLink('')
    start(async () => {
      const r = await issueForLead(lead.id)
      if (r.ok && r.url) setLink(r.url)
      else setError(r.error ?? 'Could not issue the test.')
      router.refresh()
    })
  }

  const message = `Hello, this is the aptitude test link for ${lead.name}. Please open it and hand the phone to them. The link works for 2 hours: ${link}`

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{lead.name}</p>
          <p className="text-sm text-slate-500">
            {lead.contact_mobile}
            {lead.school && ` · ${lead.school}`}
            {lead.class_level && ` · Class ${lead.class_level}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {issues === 0 ? 'No test issued' : `Issue ${issues} of 3`}
            {live && ` · ${STATE_LABEL[live.state]} · closes ${clock(live.expires_at)}`}
            {done && ' · Completed'}
          </p>
        </div>

        {done ? (
          <Link
            href={`/reports/${lead.id}`}
            className="min-h-tap inline-flex items-center rounded bg-green-700 px-4 py-2 text-sm font-medium text-white"
          >
            View report
          </Link>
        ) : (
          <button
            type="button"
            className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={issue}
            disabled={pending || issues >= 3}
          >
            {pending ? 'Issuing…' : issues === 0 ? 'Issue test' : 'Reissue'}
          </button>
        )}
      </div>

      {issues > 0 && !done && (
        <p className="mt-2 text-xs">
          <Link href={`/reports/${lead.id}`} className="text-slate-500 hover:underline">
            View report
          </Link>
          {issues >= 3 && <span className="text-slate-500"> · All 3 links used. Contact the office.</span>}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {link && (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">
            Send this to the parent on WhatsApp. Any earlier link has stopped working.
          </p>
          <p className="mt-2 break-all rounded bg-white px-2 py-2 font-mono text-xs text-slate-800">
            {link}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-tap rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(message)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy message'}
            </button>
            <a
              className="min-h-tap inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              href={`https://wa.me/91${lead.contact_mobile}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in WhatsApp
            </a>
          </div>
          <p aria-live="polite" className="sr-only">
            {copied ? 'Message copied to clipboard' : ''}
          </p>
        </div>
      )}
    </li>
  )
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
