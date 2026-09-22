import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { LeadsConsole, type LeadRow } from './LeadsConsole'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Leads', robots: { index: false, follow: false } }

export default async function LeadsPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/leads')

  const db = await userClient()

  // Every read here goes through the session-bound client, so RLS decides what
  // this person can see rather than a filter written in application code.
  const { data: leads } = await db
    .from('leads')
    .select('id, name, contact_mobile, city, school, class_level, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: assessments } = await db
    .from('assessments')
    .select('id, lead_id, issue_seq, state, created_at, expires_at')
    .order('created_at', { ascending: false })

  const byLead = new Map<string, LeadRow['assessments']>()
  for (const a of assessments ?? []) {
    const list = byLead.get(a.lead_id) ?? []
    list.push(a)
    byLead.set(a.lead_id, list)
  }

  const rows: LeadRow[] = (leads ?? []).map((lead) => ({
    ...lead,
    assessments: byLead.get(lead.id) ?? [],
  }))

  return <LeadsConsole staff={staff} leads={rows} />
}
