'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TestAction } from '@/lib/leads'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'
import { useConfirm } from '@/components/ConfirmDialog'
import { issueForLead, issuePaperForLead } from './actions'
import { IssuedLink } from './IssuedLink'

/**
 * A lead row's one test button, so issuing or reading the result does not
 * need a click into the lead first. The database still decides whether an
 * issue is allowed; this only offers it.
 */
export function RowTest({
  lead,
  action,
  canPaper,
  reportHref,
  children,
}: {
  lead: { id: string; name: string | null; contact_mobile: string; class_level: number | null }
  action: TestAction
  /** Counsellors and superadmin may issue the test on paper (2026-10-16). */
  canPaper: boolean
  /** The score sheet, carrying this list's filters so its back link returns here. */
  reportHref: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const { confirm, dialog } = useConfirm()
  const missing = !lead.name || !lead.class_level
  const who = lead.name ?? lead.contact_mobile

  async function issue() {
    if (
      action === 'reissue' &&
      !(await confirm({
        title: 'Send a new link?',
        body: `Send ${who} a new link? The current link will stop working.`,
        confirm: 'Send new link',
      }))
    ) {
      return
    }
    setError('')
    setLink('')
    start(async () => {
      const r = await issueForLead(lead.id)
      if (r.ok && r.url) setLink(r.url)
      else setError(r.error ?? 'Could not issue the test.')
      router.refresh()
    })
  }

  async function issuePaper() {
    if (
      action === 'reissue' &&
      !(await confirm({
        title: 'Issue a paper test?',
        body: `Issue ${who} a paper test? The current test will stop working.`,
        confirm: 'Issue paper test',
      }))
    ) {
      return
    }
    setError('')
    setLink('')
    start(async () => {
      const r = await issuePaperForLead(lead.id)
      if (r.ok && r.paperUrl) router.push(r.paperUrl)
      else {
        setError(r.error ?? 'Could not issue the paper test.')
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {children}
        {action === 'report' && (
          <Link href={reportHref} aria-label={`Score report for ${who}`} className={btn('success', 'sm')}>
            <Icon name="chart" className="h-4 w-4" />
            Report
          </Link>
        )}
        {(action === 'issue' || action === 'reissue') && (
          <span className="flex items-center gap-2">
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
              className={btn(action === 'issue' ? 'primary' : 'secondary', 'sm')}
            >
              <Icon name={action === 'issue' ? 'link' : 'refresh'} className="h-4 w-4" />
              {pending ? 'Issuing…' : action === 'issue' ? 'Issue link' : 'Reissue'}
            </button>
            {canPaper && (
              <button
                type="button"
                onClick={issuePaper}
                disabled={pending || missing}
                aria-label={`Issue a paper test for ${who}`}
                aria-describedby={missing ? `missing-${lead.id}` : undefined}
                className={btn('secondary', 'sm')}
              >
                <Icon name="fileText" className="h-4 w-4" />
                Paper
              </button>
            )}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {link && <IssuedLink name={lead.name} mobile={lead.contact_mobile} url={link} classLevel={lead.class_level} />}
      {dialog}
    </>
  )
}
