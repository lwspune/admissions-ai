'use client'

import { useState } from 'react'
import { issueMessage, parentPackUrl } from '@/lib/parentPack'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'

/** A freshly issued link, ready to send to the parent. */
export function IssuedLink({
  name,
  mobile,
  url,
  classLevel,
}: {
  name: string | null
  mobile: string
  url: string
  classLevel: number | null
}) {
  const [copied, setCopied] = useState(false)
  const message = issueMessage({ name, testUrl: url, classLevel })

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
        <Icon name="checkCircle" className="h-4 w-4" />
        Send this to the parent on WhatsApp. Any earlier link has stopped working.
      </p>
      <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-inset ring-emerald-200">
        {url}
      </p>
      {classLevel !== null && (
        <p className="mt-2 text-xs text-slate-700">
          The message also links the{' '}
          <a className="font-medium text-brand-700 underline" href={parentPackUrl(url, classLevel)} target="_blank" rel="noopener noreferrer">
            Class {classLevel} syllabus and sample paper
          </a>
          .
        </p>
      )}
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
