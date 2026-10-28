import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { listStaff } from '@/server/staff'
import { listOrgs } from '@/server/orgs'
import { StaffShell } from '@/components/StaffShell'
import { StaffConsole } from './StaffConsole'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Staff', robots: { index: false, follow: false } }

export default async function StaffPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/staff')

  // 404, as /items does: no reason to confirm the page exists to someone who
  // may not use it. listStaff refuses a non-superadmin regardless.
  if (staff.role !== 'superadmin') notFound()

  const [accounts, orgs] = await Promise.all([listStaff(staff), listOrgs(await userClient())])
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`

  return (
    <StaffShell staff={staff}>
      <StaffConsole selfId={staff.id} accounts={accounts} orgs={orgs} defaultOrg={staff.orgId} signInUrl={signInUrl} />
    </StaffShell>
  )
}
