import type { Metadata } from 'next'
import { canManageLeads } from '@/lib/staff'
import { redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { listLeads, listSources, PAGE_SIZE } from '@/server/leads'
import { listAssignees } from '@/server/staff'
import { parseLeadFilters } from '@/lib/leads'
import { StaffShell } from '@/components/StaffShell'
import { LeadsConsole } from './LeadsConsole'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Leads', robots: { index: false, follow: false } }

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/leads')

  const filters = parseLeadFilters(await searchParams)
  const db = await userClient()
  const canAssign = canManageLeads(staff.role)

  // Every read here goes through the session-bound client, so RLS decides what
  // this person can see — a telecaller's list is theirs because the database
  // says so, not because of a filter written here.
  const [list, sources, assignees] = await Promise.all([
    listLeads(db, filters, staff.id),
    listSources(db),
    canAssign ? listAssignees(staff) : Promise.resolve([]),
  ])

  return (
    <StaffShell staff={staff} width="wide">
      <LeadsConsole
        staff={staff}
        list={list}
        filters={filters}
        sources={sources}
        assignees={assignees}
        pageSize={PAGE_SIZE}
      />
    </StaffShell>
  )
}
