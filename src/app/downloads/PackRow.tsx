'use client'

import { useState } from 'react'
import { parentPackPath, parentPackUrl, packMessage } from '@/lib/parentPack'
import type { Lang } from '@/lib/hindi'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'

// Full-width in a column on a phone, side by side from sm up.
const action = `${btn('secondary', 'sm')} w-full justify-center sm:w-auto`

/**
 * One class's PDFs: the English sheet and its Hindi edition (2026-10-11), each
 * to open or save, copy a link to, or send on WhatsApp.
 */
export function PackRow({ classLevel, site }: { classLevel: number; site: string }) {
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
      {/* A phone gets the two languages as two columns; wider screens, two rows. */}
      <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-col sm:items-end sm:gap-2">
        <Actions classLevel={classLevel} site={site} lang="en" />
        <Actions classLevel={classLevel} site={site} lang="hi" />
      </div>
    </li>
  )
}

function Actions({ classLevel, site, lang }: { classLevel: number; site: string; lang: Lang }) {
  const [copied, setCopied] = useState(false)
  const pdf = `Class ${classLevel} ${lang === 'hi' ? 'Hindi' : 'English'} PDF`

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <span lang={lang} className="text-sm font-medium text-slate-700 sm:w-14">
        {lang === 'hi' ? 'हिंदी' : 'English'}
      </span>
      <a className={action} href={parentPackPath(classLevel, lang)} download aria-label={`Download the ${pdf}`}>
        <Icon name="download" className="h-4 w-4" />
        Download
      </a>
      <button
        type="button"
        className={action}
        aria-label={`Copy link to the ${pdf}`}
        onClick={async () => {
          await navigator.clipboard.writeText(parentPackUrl(site, classLevel, lang))
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        <Icon name={copied ? 'check' : 'link'} className="h-4 w-4" />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <a
        className={action}
        href={`https://wa.me/?text=${encodeURIComponent(packMessage(site, classLevel, lang))}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`WhatsApp the ${pdf}`}
      >
        <Icon name="message" className="h-4 w-4" />
        WhatsApp
      </a>
      <span aria-live="polite" className="sr-only">
        {copied ? `Link to the ${pdf} copied` : ''}
      </span>
    </div>
  )
}
