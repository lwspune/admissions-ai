'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons'

/** The Navigation API's previous entry; absent where the browser lacks it (older Safari). */
type Nav = { currentEntry: { index: number } | null; entries(): { url: string | null }[] }

/**
 * Back to the list the sheet was opened from. A list row opens the sheet
 * carrying its filters, so `href` is that list. When the page before this one
 * in the tab is that same list, the browser's own back is used instead, which
 * also keeps the list's scroll position; anything else follows the link, so
 * Back never leaves the app.
 */
export function BackToLeads({ href }: { href: string }) {
  const router = useRouter()
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        if (!cameFrom(href)) return
        e.preventDefault()
        router.back()
      }}
      className="inline-flex min-h-tap items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <Icon name="chevronLeft" className="h-4 w-4" />
      Back to leads
    </Link>
  )
}

function cameFrom(href: string): boolean {
  const nav = (window as unknown as { navigation?: Nav }).navigation
  const index = nav?.currentEntry?.index ?? 0
  const previous = index > 0 ? nav?.entries()[index - 1]?.url : null
  if (!previous) return false
  const url = new URL(previous)
  return url.origin === location.origin && url.pathname + url.search === href
}
