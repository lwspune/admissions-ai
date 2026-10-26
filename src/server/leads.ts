import 'server-only'
import type { Db } from './supabase'
import { STAGES, PAGE_SIZE, searchTerm, testStatus, testAction, type LeadFilters, type Stage, type Interest, type TestAction } from '../lib/leads'

// Reads for the lead pages. Always the session client: RLS decides which leads
// a staff member sees (migration 0012), so there is no role filter here, and a
// telecaller's list is theirs because the database says so.

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

export interface Pipeline {
  /** Every stage's count under the filters: the numbers on the pipeline bar. */
  counts: Record<Stage, number>
  /** One page of the stage the bar shows. */
  list: LeadList
}

/** The pipeline (2026-10-26): every stage's count, and a page of the one shown. */
export async function listPipeline(db: Db, filters: LeadFilters, me: string): Promise<Pipeline> {
  const [counts, list] = await Promise.all([
    Promise.all(
      STAGES.map(async (stage) => {
        const { count, error } = await filtered(db, filters, me, 'id', { count: 'exact', head: true }).eq('stage', stage)
        if (error) throw new Error(`could not count leads: ${error.message}`)
        return count ?? 0
      }),
    ),
    listStage(db, filters, me),
  ])
  return { counts: Object.fromEntries(STAGES.map((s, i) => [s, counts[i]!])) as Record<Stage, number>, list }
}

/**
 * Leads under the filters, which narrow every stage alike. Filtering by source
 * needs the join to be an inner one; otherwise it is left out, so a lead added
 * by hand (no origin) still lists.
 */
function filtered(db: Db, filters: LeadFilters, me: string, columns: string, opts: { count: 'exact'; head?: boolean }) {
  let query = db.from('leads').select(filters.source ? `${columns}, lead_origins!inner(source_id)` : columns, opts)
  if (filters.source) query = query.eq('lead_origins.source_id', filters.source)
  if (filters.interest) query = query.eq('interest', filters.interest)
  if (filters.assignee === 'me') query = query.eq('assigned_to', me)
  else if (filters.assignee === 'none') query = query.is('assigned_to', null)
  else if (filters.assignee) query = query.eq('assigned_to', filters.assignee)
  const search = searchTerm(filters.q)
  if (search) query = query.ilike(search.column, search.pattern)
  return query
}

// The detail lookups go 100 leads at a time: an `in` filter rides in the URL,
// and many leads' notes could pass Supabase's 1,000-row cap in one read.
const DETAIL_CHUNK = 100

async function listStage(db: Db, filters: LeadFilters, me: string): Promise<LeadList> {
  const from = (filters.page - 1) * PAGE_SIZE
  const { data, count, error } = await filtered(
    db,
    filters,
    me,
    'id, name, contact_mobile, interest, stage, assigned_to, class_level, created_at',
    { count: 'exact' },
  )
    .eq('stage', filters.stage)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(`could not load leads: ${error.message}`)
  const leads = (data ?? []) as unknown as Omit<LeadListRow, 'sources' | 'test' | 'testAction' | 'lastNote'>[]
  if (leads.length === 0) return { rows: [], total: count ?? 0 }

  type Origin = { lead_id: string; lead_sources: { name: string } | null }
  type Paper = { lead_id: string; state: string; issue_seq: number; mode: string }
  type Note = NonNullable<LeadListRow['lastNote']> & { lead_id: string }
  const origins: Origin[] = []
  const assessments: Paper[] = []
  const notes: Note[] = []
  const ids = leads.map((l) => l.id)
  for (let i = 0; i < ids.length; i += DETAIL_CHUNK) {
    const chunk = ids.slice(i, i + DETAIL_CHUNK)
    const [o, a, n] = await Promise.all([
      db.from('lead_origins').select('lead_id, lead_sources(name)').in('lead_id', chunk),
      db.from('assessments').select('lead_id, state, issue_seq, mode').in('lead_id', chunk),
      db
        .from('lead_comments')
        .select('lead_id, kind, body, author_name, created_at')
        .in('lead_id', chunk)
        .in('kind', ['note', 'import'])
        .order('id', { ascending: false }),
    ])
    for (const r of [o, a, n]) {
      if (r.error) throw new Error(`could not load lead details: ${r.error.message}`)
    }
    origins.push(...((o.data ?? []) as unknown as Origin[]))
    assessments.push(...((a.data ?? []) as Paper[]))
    notes.push(...((n.data ?? []) as Note[]))
  }

  const group = <T extends { lead_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) map.set(row.lead_id, [...(map.get(row.lead_id) ?? []), row])
    return map
  }
  const originsBy = group(origins)
  const assessmentsBy = group(assessments)
  const notesBy = group(notes)

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

/** How GoPost's feed last went (migration 0025). RLS shows it to counsellors and superadmin only. */
export async function gopostFeedStatus(db: Db): Promise<{ last_synced_at: string | null; last_error: string | null } | null> {
  const { data, error } = await db.from('lead_feeds').select('last_synced_at, last_error').eq('name', 'gopost').maybeSingle()
  if (error) throw new Error(`could not load the GoPost feed: ${error.message}`)
  return data
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
