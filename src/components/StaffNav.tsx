'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { browserClient } from '@/lib/browserClient'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

export interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Shown as a pill when above zero: unread messages. */
  count?: number
}

/** The staff pages' links, with the current one marked. */
export function StaffNav({ items }: { items: NavItem[] }) {
  const path = usePathname()
  // /leads/import is its own tab; every other /leads/… page belongs to Leads.
  const active = (href: string) =>
    href === '/leads'
      ? path === '/leads' || (path.startsWith('/leads/') && !path.startsWith('/leads/import')) || path.startsWith('/reports')
      : path.startsWith(href)

  return (
    <nav aria-label="Staff pages" className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const on = active(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cx(
              // Narrower on a phone so a counsellor's four tabs fit 390px without scrolling.
              'min-h-tap inline-flex shrink-0 items-center gap-2 border-b-2 px-2 text-sm font-medium transition-colors sm:px-3',
              on ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
            {item.count ? (
              <span className="rounded-full bg-brand-700 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums">
                {item.count}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      className="min-h-tap min-w-tap inline-flex items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      onClick={async () => {
        await browserClient().auth.signOut()
        router.push('/login')
        router.refresh()
      }}
    >
      <Icon name="logOut" className="h-[18px] w-[18px]" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  )
}
