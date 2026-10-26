import type { Metadata } from 'next'
import { canManageLeads } from '@/lib/staff'
import { redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { listPipeline, listSources, gopostFeedStatus } from '@/server/leads'
import { countSince, lastDownload } from '@/server/leadExport'
import { listAssignees } from '@/server/staff'
import { parseLeadFilters } from '@/lib/leads'
import { feedWarning } from '@/lib/gopostLeads'
import { downloadStamp } from '@/lib/leadExport'
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
  // this person can see — a telecaller's pipeline is theirs because the database
  // says so, not because of a filter written here.
  const [pipeline, sources, assignees, feed, since] = await Promise.all([
    listPipeline(db, filters, staff.id),
    listSources(db),
    canAssign ? listAssignees(staff) : Promise.resolve([]),
    canAssign ? gopostFeedStatus(db) : Promise.resolve(null),
    // "Download for Excel" is a counsellor's and superadmin's (migration 0028).
    canAssign ? lastDownload(db, filters.stage) : Promise.resolve(null),
  ])
  const fresh = since ? await countSince(db, filters, staff.id, since) : null

  return (
    <StaffShell staff={staff} width="full">
      <LeadsConsole
        staff={staff}
        pipeline={pipeline}
        filters={filters}
        sources={sources}
        assignees={assignees}
        feedWarning={feedWarning(feed, Date.now())}
        download={canAssign ? { lastAt: since ? downloadStamp(since) : null, fresh } : null}
      />
    </StaffShell>
  )
}
