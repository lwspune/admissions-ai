import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { loadApplicants } from '@/server/hiring'
import { listApplicantAdders } from '@/server/staff'
import { canHire } from '@/lib/staff'
import { StaffShell } from '@/components/StaffShell'
import { Icon } from '@/components/icons'
import { PageHeader, btn } from '@/components/ui'
import { HiringConsole } from './HiringConsole'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Hiring', robots: { index: false, follow: false } }

/**
 * The teacher screening test, staff side (HIRING_TEST_SPEC.md): add an
 * applicant, send the link, read the score. A teacher sees every applicant in
 * their org, superadmin every org's, each with who added them. RLS decides the list.
 */
export default async function HiringPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/hiring')
  if (!canHire(staff.role)) notFound()

  const applicants = await loadApplicants(await userClient())

  // Names live in the auth admin API; listApplicantAdders opens only names, and
  // only the org's (migration 0030).
  const addedBy = await listApplicantAdders(staff).catch(() => null)

  return (
    <StaffShell staff={staff}>
      <PageHeader
        title="Hiring"
        description="Screen teaching applicants with 15 real exam questions before you call them. Each gets their own set."
        actions={
          staff.role === 'superadmin' ? (
            <Link href="/hiring/questions" className={btn('secondary', 'md')}>
              <Icon name="book" className="h-4 w-4" />
              Questions
            </Link>
          ) : undefined
        }
      />
      <HiringConsole
        applicants={applicants}
        addedBy={addedBy}
        role={staff.role}
        now={new Date().toISOString()}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
      />
    </StaffShell>
  )
}
