'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { issueForLead } from './actions'
import { TEST_STATE_LABEL } from '@/lib/leads'
import { IssuedLink } from './IssuedLink'
import { Icon } from '@/components/icons'
import { Badge, Eyebrow, btn, card, cx } from '@/components/ui'

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
    <section aria-labelledby="test-heading" className={cx(card, 'p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow id="test-heading">Aptitude test</Eyebrow>
          <p className="mt-2 text-sm text-slate-700">
            {issues === 0 ? 'No test issued' : `Issue ${issues} of 3`}
            {live && ` · ${TEST_STATE_LABEL[live.state]} · closes ${clock(live.expires_at)}`}
          </p>
        </div>
        {done ? (
          <Badge tone="success" icon="check">
            Completed
          </Badge>
        ) : live ? (
          <Badge tone="info" icon="clock">
            {TEST_STATE_LABEL[live.state]}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {done ? (
          <Link href={`/reports/${lead.id}`} className={btn('success')}>
            <Icon name="chart" className="h-4 w-4" />
            View report
          </Link>
        ) : (
          <>
            <button
              type="button"
              className={btn(issues === 0 ? 'primary' : 'secondary')}
              onClick={issue}
              disabled={pending || issues >= 3 || missing.length > 0}
              aria-describedby={missing.length ? 'issue-missing' : undefined}
            >
              <Icon name={issues === 0 ? 'link' : 'refresh'} className="h-4 w-4" />
              {pending ? 'Issuing…' : issues === 0 ? 'Issue test' : 'Reissue'}
            </button>
            {issues > 0 && (
              <Link href={`/reports/${lead.id}`} className={btn('ghost')}>
                View report
              </Link>
            )}
          </>
        )}
      </div>

      {missing.length > 0 && !done && (
        <p id="issue-missing" className="mt-3 text-sm text-amber-800">
          Add {missing.join(' and ')} under Details before issuing a test.
        </p>
      )}
      {issues >= 3 && !done && <p className="mt-3 text-sm text-slate-600">All 3 links used. Contact the office.</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
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
