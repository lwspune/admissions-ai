import Link from 'next/link'
import { ROLE_LABEL, canHire, canManageLeads, homeFor, isAdmissionsStaff, isRole, type Role } from '@/lib/staff'
import { userClient } from '@/server/auth'
import { unreadContactCount } from '@/server/contact'
import { listOrgs } from '@/server/orgs'
import { orgName } from '@/lib/orgs'
import { StaffNav, SignOutButton, type NavItem } from './StaffNav'
import { Avatar, Mark, cx } from './ui'

/**
 * The frame round every staff page: the mark, the pages this role may open,
 * who is signed in, and sign out. The links are cosmetic — each page refuses
 * the wrong role on its own, and the database refuses underneath (import_leads,
 * RLS on test_items, the gate in src/server/staff.ts).
 */
export async function StaffShell({
  staff,
  width = 'default',
  children,
}: {
  staff: { name: string | null; email: string; role: Role | string; orgId?: string | null }
  /** `full` is the leads board's five columns (2026-10-26); every other page reads at a page width. */
  width?: 'narrow' | 'default' | 'wide' | 'full'
  children: React.ReactNode
}) {
  const items: NavItem[] = []
  if (isAdmissionsStaff(staff.role)) {
    items.push({ href: '/leads', label: 'Leads', icon: 'users' }, { href: '/downloads', label: 'Downloads', icon: 'download' })
  }
  if (canManageLeads(staff.role)) {
    items.push({ href: '/leads/import', label: 'Import', icon: 'upload' }, { href: '/scan', label: 'Scan', icon: 'camera' })
  }
  if (canHire(staff.role)) items.push({ href: '/hiring', label: 'Hiring', icon: 'user' })
  if (staff.role === 'superadmin') {
    // The unread count is read through RLS, so it is only ever asked for here.
    const unread = await unreadContactCount(await userClient())
    items.push(
      { href: '/items', label: 'Questions', icon: 'book' },
      { href: '/staff', label: 'Staff', icon: 'shield' },
      { href: '/messages', label: 'Messages', icon: 'inbox', count: unread },
    )
  }
  const home = isRole(staff.role) ? homeFor(staff.role) : '/leads'
  const role = ROLE_LABEL[staff.role as Role] ?? staff.role
  // Which branch you are working in (migration 0030); read through RLS like the count above.
  // Not for superadmin, who works across every org.
  const org = staff.orgId && staff.role !== 'superadmin' ? orgName(await listOrgs(await userClient()), staff.orgId) : null

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className={cx('mx-auto flex items-center gap-4 px-4', width === 'full' ? 'max-w-screen-2xl' : 'max-w-6xl')}>
          <Link href={home} aria-label={`Aptitude Test — ${home === '/hiring' ? 'hiring' : 'leads'}`} className="min-h-tap flex items-center rounded-lg py-2">
            <Mark labelClassName="hidden sm:inline" />
          </Link>
          <div className="hidden flex-1 self-stretch md:flex md:items-end">
            <StaffNav items={items} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-slate-900">{staff.name ?? staff.email}</p>
              <p className="whitespace-nowrap text-xs text-slate-600">{org ? `${role} · ${org}` : role}</p>
            </div>
            <Avatar name={staff.name ?? staff.email} className="hidden sm:grid" />
            <SignOutButton />
          </div>
        </div>
        <div className="border-t border-slate-100 px-2 md:hidden">
          <StaffNav items={items} />
        </div>
      </header>
      <main
        className={cx(
          'mx-auto px-4 pb-16 pt-6 sm:pt-8',
          width === 'narrow' ? 'max-w-3xl' : width === 'wide' ? 'max-w-6xl' : width === 'full' ? 'max-w-screen-2xl' : 'max-w-5xl',
        )}
      >
        {children}
      </main>
    </div>
  )
}
