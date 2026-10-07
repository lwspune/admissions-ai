'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { issueForLead } from './actions'
import { TEST_STATE_LABEL } from '@/lib/leads'
import { IssuedLink } from './IssuedLink'

export interface IssueAssessment {
  id: string
  issue_seq: number
  state: string
  created_at: string
  expires_at: string
}

/** Issuing the test for one lead, and the link to send once it is issued. */
export function IssuePanel({
  lead,
  assessments,
}: {
  lead: { id: string; name: string | null; contact_mobile: string; class_level: number | null }
  assessments: IssueAssessment[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const issues = assessments.length
  const live = assessments.find((a) => ['issued', 'opened', 'started'].includes(a.state))
  const done = assessments.find((a) => a.state === 'submitted')
  const missing = [!lead.name && 'the candidate’s name', !lead.class_level && 'the class'].filter(Boolean)

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

  return (
    <section aria-labelledby="test-heading" className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 id="test-heading" className="text-sm font-semibold text-slate-900">
        Aptitude test
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {issues === 0 ? 'No test issued' : `Issue ${issues} of 3`}
        {live && ` · ${TEST_STATE_LABEL[live.state]} · closes ${clock(live.expires_at)}`}
        {done && ' · Completed'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done ? (
          <Link
            href={`/reports/${lead.id}`}
            className="min-h-tap inline-flex items-center rounded bg-green-700 px-4 py-2 text-sm font-medium text-white"
          >
            View report
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={issue}
              disabled={pending || issues >= 3 || missing.length > 0}
              aria-describedby={missing.length ? 'issue-missing' : undefined}
            >
              {pending ? 'Issuing…' : issues === 0 ? 'Issue test' : 'Reissue'}
            </button>
            {issues > 0 && (
              <Link href={`/reports/${lead.id}`} className="text-sm text-slate-600 hover:underline">
                View report
              </Link>
            )}
          </>
        )}
      </div>

      {missing.length > 0 && !done && (
        <p id="issue-missing" className="mt-2 text-sm text-amber-800">
          Add {missing.join(' and ')} above before issuing a test.
        </p>
      )}
      {issues >= 3 && !done && <p className="mt-2 text-sm text-slate-600">All 3 links used. Contact the office.</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {link && <IssuedLink name={lead.name} mobile={lead.contact_mobile} url={link} classLevel={lead.class_level} />}
    </section>
  )
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
