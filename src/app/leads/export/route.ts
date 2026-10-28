import { currentStaff, userClient } from '@/server/auth'
import { listAssignees } from '@/server/staff'
import { lastDownload, loadExport, loadSelected } from '@/server/leadExport'
import { handleLeadExport } from '@/lib/leadExport'
import { canManageLeads } from '@/lib/staff'
import { parseLeadFilters } from '@/lib/leads'

// "Download for Excel" on /leads: the stage on screen, every lead or only those
// new since your last download of it, or the leads ticked on screen (the rules
// are in src/lib/leadExport.ts).
// A POST from the page's form, because each download moves your download point.
// Behind the middleware like every staff path; the session client throughout.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const staff = await currentStaff()
  const db = await userClient()
  const assignee = async () => {
    const names = new Map((await listAssignees(staff!)).map((a) => [a.id, a.label]))
    return (id: string | null) =>
      id === null ? 'Unassigned' : id === staff!.id ? (staff!.name ?? 'You') : (names.get(id) ?? 'Not a telecaller now')
  }
  return handleLeadExport(req, {
    mayDownload: async () => !!staff && canManageLeads(staff.role),
    lastDownload: (stage) => lastDownload(db, stage),
    load: async (window, form) => loadExport(db, parseLeadFilters(form), staff!.id, window, await assignee()),
    loadSelected: async (ids) => loadSelected(db, ids, await assignee()),
    record: async ({ kind, stage, count, since, at }) => {
      const { error } = await db.rpc('record_lead_download', { p_kind: kind, p_stage: stage, p_count: count, p_since: since, p_at: at })
      if (error) throw new Error(`record_lead_download: ${error.message}`)
    },
    now: () => new Date(),
  })
}
