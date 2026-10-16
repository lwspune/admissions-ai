import 'server-only'
import type { Db } from './supabase'
import { searchTerm, testStatus, testAction, type LeadFilters, type Stage, type Interest, type TestAction } from '../lib/leads'

// Reads for the lead pages. Always the session client: RLS decides which leads
// a staff member sees (migration 0012), so there is no role filter here, and a
// telecaller's list is theirs because the database says so.

export const PAGE_SIZE = 50

export interface LeadListRow {
  id: string
  name: string | null
  contact_mobile: string
  interest: Interest | null
  stage: Stage
  assigned_to: string | null
  class_level: number | null
  created_at: string
  sources: string[]
  test: string
  testAction: TestAction
  lastNote: { kind: string; body: string; author_name: string | null; created_at: string } | null
}

export interface LeadList {
  rows: LeadListRow[]
  total: number
}

export async function listLeads(db: Db, filters: LeadFilters, me: string): Promise<LeadList> {
  // Filtering by source needs the join to be an inner one; otherwise it is left
  // out, so a lead added by hand (no origin) still lists.
  const columns = 'id, name, contact_mobile, interest, stage, assigned_to, class_level, created_at'
  let query = db
    .from('leads')
    .select(filters.source ? `${columns}, lead_origins!inner(source_id)` : columns, { count: 'exact' })

  if (filters.source) query = query.eq('lead_origins.source_id', filters.source)
  if (filters.stage) query = query.eq('stage', filters.stage)
  if (filters.interest) query = query.eq('interest', filters.interest)
  if (filters.assignee === 'me') query = query.eq('assigned_to', me)
  else if (filters.assignee === 'none') query = query.is('assigned_to', null)
  else if (filters.assignee) query = query.eq('assigned_to', filters.assignee)

  const search = searchTerm(filters.q)
  if (search) query = query.ilike(search.column, search.pattern)

  const from = (filters.page - 1) * PAGE_SIZE
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(`could not load leads: ${error.message}`)
  const leads = (data ?? []) as unknown as Omit<LeadListRow, 'sources' | 'test' | 'testAction' | 'lastNote'>[]
  if (leads.length === 0) return { rows: [], total: count ?? 0 }

  const ids = leads.map((l) => l.id)
  const [origins, assessments, notes] = await Promise.all([
    db.from('lead_origins').select('lead_id, lead_sources(name)').in('lead_id', ids),
    db.from('assessments').select('lead_id, state, issue_seq, mode').in('lead_id', ids),
    db
      .from('lead_comments')
      .select('lead_id, kind, body, author_name, created_at')
      .in('lead_id', ids)
      .in('kind', ['note', 'import'])
      .order('id', { ascending: false }),
  ])
  for (const r of [origins, assessments, notes]) {
    if (r.error) throw new Error(`could not load lead details: ${r.error.message}`)
  }

  const group = <T extends { lead_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) map.set(row.lead_id, [...(map.get(row.lead_id) ?? []), row])
    return map
  }
  const originsBy = group((origins.data ?? []) as unknown as { lead_id: string; lead_sources: { name: string } | null }[])
  const assessmentsBy = group(
    (assessments.data ?? []) as { lead_id: string; state: string; issue_seq: number; mode: string }[],
  )
  const notesBy = group((notes.data ?? []) as (NonNullable<LeadListRow['lastNote']> & { lead_id: string })[])

  return {
    total: count ?? 0,
    rows: leads.map((lead) => {
      const note = notesBy.get(lead.id)?.[0]
      return {
        ...lead,
        sources: [...new Set((originsBy.get(lead.id) ?? []).map((o) => o.lead_sources?.name).filter(Boolean) as string[])],
        test: testStatus(assessmentsBy.get(lead.id) ?? []),
        testAction: testAction(assessmentsBy.get(lead.id) ?? []),
        lastNote: note
          ? { kind: note.kind, body: note.body, author_name: note.author_name, created_at: note.created_at }
          : null,
      }
    }),
  }
}

export async function listSources(db: Db): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from('lead_sources').select('id, name').order('name')
  if (error) throw new Error(`could not load sources: ${error.message}`)
  return data ?? []
}

export interface LeadDetail {
  lead: {
    id: string
    name: string | null
    contact_mobile: string
    interest: Interest | null
    stage: Stage
    assigned_to: string | null
    class_level: number | null
    school: string | null
    city: string | null
    created_at: string
  }
  origins: { source: string; source_date: string | null; imported_at: string }[]
  comments: { id: number; kind: string; body: string; author_name: string | null; created_at: string }[]
  assessments: {
    id: string
    issue_seq: number
    state: string
    created_at: string
    expires_at: string
    mode: string
    paper_no: number | null
  }[]
}

/** One lead and its history, or null when it does not exist or is not this person's to see. */
export async function loadLead(db: Db, id: string): Promise<LeadDetail | null> {
  const { data: lead, error } = await db
    .from('leads')
    .select('id, name, contact_mobile, interest, stage, assigned_to, class_level, school, city, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`could not load lead: ${error.message}`)
  if (!lead) return null

  const [origins, comments, assessments] = await Promise.all([
    db.from('lead_origins').select('source_date, imported_at, lead_sources(name)').eq('lead_id', id).order('imported_at'),
    db
      .from('lead_comments')
      .select('id, kind, body, author_name, created_at')
      .eq('lead_id', id)
      .order('id', { ascending: false }),
    db
      .from('assessments')
      .select('id, issue_seq, state, created_at, expires_at, mode, paper_no')
      .eq('lead_id', id)
      .order('issue_seq', { ascending: false }),
  ])
  for (const r of [origins, comments, assessments]) {
    if (r.error) throw new Error(`could not load lead details: ${r.error.message}`)
  }

  return {
    lead: lead as LeadDetail['lead'],
    origins: ((origins.data ?? []) as unknown as {
      source_date: string | null
      imported_at: string
      lead_sources: { name: string } | null
    }[]).map((o) => ({ source: o.lead_sources?.name ?? 'Unknown', source_date: o.source_date, imported_at: o.imported_at })),
    comments: (comments.data ?? []) as LeadDetail['comments'],
    assessments: (assessments.data ?? []) as LeadDetail['assessments'],
  }
}
