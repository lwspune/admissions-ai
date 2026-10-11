'use client'

import { useState } from 'react'
import { parentPackPath, parentPackUrl, packMessage } from '@/lib/parentPack'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'

const action = btn('secondary', 'sm')

/** One class's PDF: open or save it, copy its link, or send it on WhatsApp. */
export function PackRow({ classLevel, site }: { classLevel: number; site: string }) {
  const [copied, setCopied] = useState(false)
  const label = `Class ${classLevel}`

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100">
          <Icon name="fileText" className="h-5 w-5" />
        </span>
        <div>
          <p className="font-medium text-slate-900">For admission to {label}</p>
          <p className="text-sm text-slate-600">Syllabus and sample paper · PDF</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={action} href={parentPackPath(classLevel)} download aria-label={`Download the ${label} PDF`}>
          <Icon name="download" className="h-4 w-4" />
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
          <Icon name={copied ? 'check' : 'link'} className="h-4 w-4" />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          className={action}
          href={`https://wa.me/?text=${encodeURIComponent(packMessage(site, classLevel))}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp the ${label} PDF`}
        >
          <Icon name="message" className="h-4 w-4" />
          WhatsApp
        </a>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? `Link to the ${label} PDF copied` : ''}
      </p>
    </li>
  )
}
