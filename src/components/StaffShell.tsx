import Link from 'next/link'
import { ROLE_LABEL, type Role } from '@/lib/staff'
import { StaffNav, SignOutButton, type NavItem } from './StaffNav'
import { Avatar, Mark, cx } from './ui'

/**
 * The frame round every staff page: the mark, the pages this role may open,
 * who is signed in, and sign out. The links are cosmetic — each page refuses
 * the wrong role on its own, and the database refuses underneath (import_leads,
 * RLS on test_items, the gate in src/server/staff.ts).
 */
export function StaffShell({
  staff,
  width = 'default',
  children,
}: {
  staff: { name: string | null; email: string; role: Role | string }
  width?: 'narrow' | 'default' | 'wide'
  children: React.ReactNode
}) {
  const items: NavItem[] = [
    { href: '/leads', label: 'Leads', icon: 'users' },
    { href: '/downloads', label: 'Downloads', icon: 'download' },
  ]
  if (staff.role !== 'telecaller') items.push({ href: '/leads/import', label: 'Import', icon: 'upload' })
  if (staff.role === 'superadmin') {
    items.push({ href: '/items', label: 'Questions', icon: 'book' }, { href: '/staff', label: 'Staff', icon: 'shield' })
  }
  const role = ROLE_LABEL[staff.role as Role] ?? staff.role

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4">
          <Link href="/leads" aria-label="Aptitude Test — leads" className="min-h-tap flex items-center rounded-lg py-2">
            <Mark labelClassName="hidden sm:inline" />
          </Link>
          <div className="hidden flex-1 self-stretch md:flex md:items-end">
            <StaffNav items={items} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-slate-900">{staff.name ?? staff.email}</p>
              <p className="text-xs text-slate-600">{role}</p>
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
          width === 'narrow' ? 'max-w-3xl' : width === 'wide' ? 'max-w-6xl' : 'max-w-5xl',
        )}
      >
        {children}
      </main>
    </div>
  )
}
