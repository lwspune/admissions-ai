import 'server-only'
import type { Db } from './supabase'
import { filtered } from './leads'
import { testStatus, type LeadFilters, type Stage, type Interest } from '../lib/leads'
import type { ExportRow } from '../lib/leadExport'

// Reads for "Download for Excel" (src/lib/leadExport.ts, migration 0028). The
// session client throughout, so RLS decides what a download can hold, and
// the same filters as the list on screen.

// Supabase returns at most 1,000 rows a request; the detail lookups go 100
// leads at a time, since an `in` filter rides in the URL.
const READ_PAGE = 1000
const DETAIL_CHUNK = 100

/** Your download point for a stage: your latest download of it, or null. RLS shows only your own. */
export async function lastDownload(db: Db, stage: Stage): Promise<string | null> {
  const { data, error } = await db
    .from('lead_downloads')
    .select('downloaded_at')
    .eq('stage', stage)
    .order('downloaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`could not read your last download: ${error.message}`)
  return (data?.downloaded_at as string | undefined) ?? null
}

/** How many leads of the stage on screen reached the app after `since`: the "new" choice's number. */
export async function countSince(db: Db, filters: LeadFilters, me: string, since: string): Promise<number> {
  const { count, error } = await filtered(db, filters, me, 'id', { count: 'exact', head: true })
    .eq('stage', filters.stage)
    .gt('created_at', since)
  if (error) throw new Error(`could not count new leads: ${error.message}`)
  return count ?? 0
}

type Lead = {
  id: string
  name: string | null
  contact_mobile: string
  interest: Interest | null
  stage: Stage
  assigned_to: string | null
  class_level: number | null
  enquired_on: string
}

/**
 * The stage on screen under its filters, as the file's rows: those that reached
 * the app after `since` (null: any time) and up to `until`, newest enquiry
 * first as on screen. `assignee` names a telecaller from their id.
 */
export async function loadExport(
  db: Db,
  filters: LeadFilters,
  me: string,
  { since, until }: { since: string | null; until: string },
  assignee: (id: string | null) => string,
): Promise<ExportRow[]> {
  const leads: Lead[] = []
  for (let from = 0; ; from += READ_PAGE) {
    let query = filtered(db, filters, me, 'id, name, contact_mobile, interest, stage, assigned_to, class_level, enquired_on')
      .eq('stage', filters.stage)
      .lte('created_at', until)
    if (since) query = query.gt('created_at', since)
    const { data, error } = await query
      .order('enquired_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + READ_PAGE - 1)
    if (error) throw new Error(`could not read leads for the download: ${error.message}`)
    leads.push(...((data ?? []) as unknown as Lead[]))
    if ((data ?? []).length < READ_PAGE) break
  }

  const sources = new Map<string, Set<string>>()
  const papers = new Map<string, { state: string; issue_seq: number; mode: string }[]>()
  for (let i = 0; i < leads.length; i += DETAIL_CHUNK) {
    const ids = leads.slice(i, i + DETAIL_CHUNK).map((l) => l.id)
    const [o, a] = await Promise.all([
      db.from('lead_origins').select('lead_id, lead_sources(name)').in('lead_id', ids),
      db.from('assessments').select('lead_id, state, issue_seq, mode').in('lead_id', ids),
    ])
    for (const r of [o, a]) {
      if (r.error) throw new Error(`could not read lead details for the download: ${r.error.message}`)
    }
    for (const row of (o.data ?? []) as unknown as { lead_id: string; lead_sources: { name: string } | null }[]) {
      if (row.lead_sources) sources.set(row.lead_id, (sources.get(row.lead_id) ?? new Set()).add(row.lead_sources.name))
    }
    for (const row of (a.data ?? []) as { lead_id: string; state: string; issue_seq: number; mode: string }[]) {
      papers.set(row.lead_id, [...(papers.get(row.lead_id) ?? []), row])
    }
  }

  return leads.map((l) => ({
    name: l.name,
    mobile: l.contact_mobile,
    interest: l.interest,
    classLevel: l.class_level,
    stage: l.stage,
    sources: [...(sources.get(l.id) ?? [])],
    enquiredOn: l.enquired_on,
    assignedTo: assignee(l.assigned_to),
    test: testStatus(papers.get(l.id) ?? []),
  }))
}
