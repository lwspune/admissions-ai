'use client'

import { useState } from 'react'
import { issueMessage, parentPackUrl } from '@/lib/parentPack'

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
    <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-700">
        Send this to the parent on WhatsApp. Any earlier link has stopped working.
      </p>
      <p className="mt-2 break-all rounded bg-white px-2 py-2 font-mono text-xs text-slate-800">{url}</p>
      {classLevel !== null && (
        <p className="mt-2 text-xs text-slate-700">
          The message also links the{' '}
          <a className="underline" href={parentPackUrl(url, classLevel)} target="_blank" rel="noopener noreferrer">
            Class {classLevel} syllabus and sample paper
          </a>
          .
        </p>
      )}
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
          href={`https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`}
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
  )
}
