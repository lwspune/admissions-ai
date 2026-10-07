'use client'

import { useState } from 'react'
import { parentPackPath, parentPackUrl, packMessage } from '@/lib/parentPack'

const action =
  'min-h-tap inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'

/** One class's PDF: open or save it, copy its link, or send it on WhatsApp. */
export function PackRow({ classLevel, site }: { classLevel: number; site: string }) {
  const [copied, setCopied] = useState(false)
  const label = `Class ${classLevel}`

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-medium text-slate-900">For admission to {label}</p>
        <p className="text-sm text-slate-600">Syllabus and sample paper · PDF</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={action} href={parentPackPath(classLevel)} download aria-label={`Download the ${label} PDF`}>
          Download
        </a>
        <button
          type="button"
          className={action}
          aria-label={`Copy link to the ${label} PDF`}
          onClick={async () => {
            await navigator.clipboard.writeText(parentPackUrl(site, classLevel))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          className={action}
          href={`https://wa.me/?text=${encodeURIComponent(packMessage(site, classLevel))}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp the ${label} PDF`}
        >
          WhatsApp
        </a>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? `Link to the ${label} PDF copied` : ''}
      </p>
    </li>
  )
}
