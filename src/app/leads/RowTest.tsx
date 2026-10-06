'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TestAction } from '@/lib/leads'
import { issueForLead } from './actions'
import { IssuedLink } from './IssuedLink'

const button =
  'min-h-tap inline-flex shrink-0 items-center rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900'

/**
 * A lead row's one test button, so issuing or reading the result does not
 * need a click into the lead first. The database still decides whether an
 * issue is allowed; this only offers it.
 */
export function RowTest({
  lead,
  action,
  children,
}: {
  lead: { id: string; name: string | null; contact_mobile: string; class_level: number | null }
  action: TestAction
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const missing = !lead.name || !lead.class_level
  const who = lead.name ?? lead.contact_mobile

  function issue() {
    if (action === 'reissue' && !window.confirm(`Send ${who} a new link? The current link will stop working.`)) return
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
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {children}
        {action === 'report' && (
          <Link
            href={`/reports/${lead.id}/summary`}
            aria-label={`Score report for ${who}`}
            className={`${button} ml-auto bg-green-700 text-white`}
          >
            Report
          </Link>
        )}
        {(action === 'issue' || action === 'reissue') && (
          <span className="ml-auto flex items-center gap-2">
            {missing && (
              <span id={`missing-${lead.id}`} className="text-xs text-amber-800">
                Add name and class first
              </span>
            )}
            <button
              type="button"
              onClick={issue}
              disabled={pending || missing}
              aria-label={`${action === 'issue' ? 'Issue a test link' : 'Reissue the test link'} for ${who}`}
              aria-describedby={missing ? `missing-${lead.id}` : undefined}
              className={`${button} bg-slate-900 text-white`}
            >
              {pending ? 'Issuing…' : action === 'issue' ? 'Issue link' : 'Reissue'}
            </button>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {link && <IssuedLink name={lead.name} mobile={lead.contact_mobile} url={link} />}
    </>
  )
}
