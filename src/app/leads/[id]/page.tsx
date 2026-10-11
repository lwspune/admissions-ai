import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { loadLead } from '@/server/leads'
import { listAssignees } from '@/server/staff'
import { isUuid } from '@/lib/leads'
import { StaffShell } from '@/components/StaffShell'
import { LeadDetailView } from './LeadDetailView'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Lead', robots: { index: false, follow: false } }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staff = await currentStaff()
  if (!staff) redirect(`/login?next=/leads/${id}`)
  if (!isUuid(id)) notFound()

  const db = await userClient()
  const canAssign = staff.role !== 'telecaller'
  const [detail, assignees] = await Promise.all([
    loadLead(db, id),
    canAssign ? listAssignees(staff) : Promise.resolve([]),
  ])

  // Absent and not-yours look the same: RLS returns no row for either.
  if (!detail) notFound()

  return (
    <StaffShell staff={staff} width="wide">
      <LeadDetailView detail={detail} me={staff.id} canAssign={canAssign} assignees={assignees} />
    </StaffShell>
  )
}
