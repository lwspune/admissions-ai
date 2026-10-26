import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { issueAssessment } from './assessments'
import { importLeads, previewImport } from './leadImport'
import { listAssignees } from './staff'
import type { StaffUser } from './auth'
import type { ImportRow } from '../lib/leads'

// Lead management, against the real database, signed in as real staff.
//
// Every rule here is a policy or a trigger (migration 0012), and a service-role
// test proves nothing about a policy — it bypasses them. So each role gets a
// throwaway login and its own anon-key client, the same path a browser takes.
//
// Marker: every lead this file writes has a contact_mobile in 97000010xx, and
// the one source it creates is named SOURCE. Cleanup is by those, since an
// imported lead may have no name to mark.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'leadtest-'
const SOURCE = 'LeadTest source'
const mobile = (n: number) => `97000010${String(n).padStart(2, '0')}`

interface Session {
  id: string
  db: SupabaseClient
  actor: StaffUser
}

async function signIn(role: StaffUser['role'], tag: string, name: string): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role, name },
  })
  if (error) throw new Error(`could not create ${role}: ${error.message}`)

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`)

  return { id: data.user.id, db, actor: { id: data.user.id, name, email, role } }
}

async function cleanup() {
  await svc.from('leads').delete().like('contact_mobile', '97000010%')
  await svc.from('lead_sources').delete().eq('name', SOURCE)
}

async function removeUsers() {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) {
    await svc.auth.admin.deleteUser(u.id)
  }
}

let tcA: Session
let tcB: Session
let counsellor: Session

beforeAll(async () => {
  await cleanup()
  await removeUsers()
  tcA = await signIn('telecaller', 'a', 'Telecaller A')
  tcB = await signIn('telecaller', 'b', 'Telecaller B')
  counsellor = await signIn('counsellor', 'c', 'Counsellor C')
})
beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await removeUsers()
})

async function lead(n: number, fields: Record<string, unknown> = {}) {
  const { data, error } = await svc
    .from('leads')
    .insert({ contact_mobile: mobile(n), ...fields })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data as { id: string; [k: string]: unknown }
}

async function source() {
  const { data, error } = await svc.from('lead_sources').insert({ name: SOURCE }).select().single()
  if (error) throw new Error(`could not create source: ${error.message}`)
  return data.id as string
}

const row = (n: number, over: Partial<ImportRow> = {}): ImportRow => ({
  mobile: mobile(n),
  name: null,
  stage: null,
  interest: null,
  sourceDate: null,
  notes: [],
  sheetRows: [n],
  ...over,
})

describe('who sees which lead', () => {
  it('shows a telecaller only the leads assigned to them', async () => {
    const mine = await lead(1, { assigned_to: tcA.id })
    const theirs = await lead(2, { assigned_to: tcB.id })
    const unassigned = await lead(3)

    const { data } = await tcA.db.from('leads').select('id').like('contact_mobile', '97000010%')
    const ids = (data ?? []).map((r) => r.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
    expect(ids).not.toContain(unassigned.id)
  })

  it('shows a counsellor every lead', async () => {
    await lead(1, { assigned_to: tcA.id })
    await lead(2, { assigned_to: tcB.id })
    await lead(3)

    const { count } = await counsellor.db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .like('contact_mobile', '97000010%')
    expect(count).toBe(3)
  })

  it('hides another telecaller’s tests, not only the lead row', async () => {
    const theirs = await lead(4, { name: 'LeadTest Theirs', class_level: 11, assigned_to: tcB.id })
    const { assessment } = await issueAssessment(svc, { leadId: theirs.id })

    const { data: a } = await tcA.db.from('assessments').select('id').eq('id', assessment.id)
    expect(a).toEqual([])
    const { data: b } = await tcB.db.from('assessments').select('id').eq('id', assessment.id)
    expect(b).toHaveLength(1)
  })

  it('assigns a lead a telecaller creates to that telecaller', async () => {
    const { data, error } = await tcA.db
      .from('leads')
      .insert({ name: 'LeadTest Own', contact_mobile: mobile(5), class_level: 10 })
      .select('assigned_to, created_by')
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ assigned_to: tcA.id, created_by: tcA.id })
  })

  it('tells a telecaller a number is taken without showing whose lead it is', async () => {
    await lead(6, { name: 'LeadTest Hidden', assigned_to: tcB.id })
    const { data } = await tcA.db.rpc('leads_on_mobile', { p_mobile: mobile(6) })
    expect(data).toBe(1)
    const { data: none } = await tcA.db.rpc('leads_on_mobile', { p_mobile: mobile(7) })
    expect(none).toBe(0)
  })
})

describe('assignment', () => {
  it('lets a counsellor assign a lead to a telecaller', async () => {
    const l = await lead(10)
    const { error } = await counsellor.db.from('leads').update({ assigned_to: tcA.id }).eq('id', l.id)
    expect(error).toBeNull()
    const { data } = await svc.from('leads').select('assigned_to').eq('id', l.id).single()
    expect(data!.assigned_to).toBe(tcA.id)
  })

  it('refuses a telecaller reassigning their own lead', async () => {
    const l = await lead(11, { assigned_to: tcA.id })
    const { error } = await tcA.db.from('leads').update({ assigned_to: tcB.id }).eq('id', l.id)
    expect(error).not.toBeNull()
    const { data } = await svc.from('leads').select('assigned_to').eq('id', l.id).single()
    expect(data!.assigned_to).toBe(tcA.id)
  })

  it('refuses assigning a lead to anyone who is not a telecaller', async () => {
    const l = await lead(12)
    const { error } = await counsellor.db.from('leads').update({ assigned_to: counsellor.id }).eq('id', l.id)
    expect(error).not.toBeNull()
  })

  it('lists telecallers for a counsellor and refuses a telecaller the list', async () => {
    const people = await listAssignees(counsellor.actor)
    expect(people.map((p) => p.id)).toEqual(expect.arrayContaining([tcA.id, tcB.id]))
    expect(people.map((p) => p.id)).not.toContain(counsellor.id)
    await expect(listAssignees(tcA.actor)).rejects.toThrow()
  })
})

describe('comments', () => {
  it('stamps the author from the session, whatever the client sends', async () => {
    const l = await lead(20, { assigned_to: tcA.id })
    const { error } = await tcA.db
      .from('lead_comments')
      .insert({ lead_id: l.id, body: 'CNR twice', author: tcB.id, author_name: 'Someone else' })
    expect(error).toBeNull()

    const { data } = await svc.from('lead_comments').select('author, author_name, kind').eq('lead_id', l.id)
    expect(data).toEqual([{ author: tcA.id, author_name: 'Telecaller A', kind: 'note' }])
  })

  it('keeps history: a comment cannot be edited or deleted', async () => {
    const l = await lead(21, { assigned_to: tcA.id })
    await tcA.db.from('lead_comments').insert({ lead_id: l.id, body: 'original' })

    await tcA.db.from('lead_comments').update({ body: 'rewritten' }).eq('lead_id', l.id)
    await counsellor.db.from('lead_comments').delete().eq('lead_id', l.id)

    const { data } = await svc.from('lead_comments').select('body').eq('lead_id', l.id)
    expect(data).toEqual([{ body: 'original' }])
  })

  it('refuses a comment on a lead the telecaller cannot see', async () => {
    const l = await lead(22, { assigned_to: tcB.id })
    const { error } = await tcA.db.from('lead_comments').insert({ lead_id: l.id, body: 'sneaky' })
    expect(error).not.toBeNull()
  })

  it('refuses a forged stage-change entry', async () => {
    const l = await lead(23, { assigned_to: tcA.id })
    const { error } = await tcA.db.from('lead_comments').insert({ lead_id: l.id, kind: 'stage', body: 'new → in_eis' })
    expect(error).not.toBeNull()
  })

  it('records a stage change in the history, by who made it', async () => {
    const l = await lead(24, { assigned_to: tcA.id })
    const { error } = await tcA.db.from('leads').update({ stage: 'cnr' }).eq('id', l.id)
    expect(error).toBeNull()

    const { data } = await svc.from('lead_comments').select('kind, body, author').eq('lead_id', l.id)
    expect(data).toEqual([{ kind: 'stage', body: 'new → cnr', author: tcA.id }])
  })
})

// Issuing a test means someone has spoken to the family, so a New or CNR lead
// moves to Contacted on its own (migration 0024). It never moves a lead back.
describe('stage on issue', () => {
  const stageOf = async (id: string) =>
    (await svc.from('leads').select('stage').eq('id', id).single()).data!.stage
  const history = async (id: string) =>
    (await svc.from('lead_comments').select('kind, body, author').eq('lead_id', id).order('id')).data

  it('moves a new lead to contacted when a test is issued, by whoever issued it', async () => {
    const l = await lead(60, { name: 'LeadTest Issued', class_level: 11, assigned_to: tcA.id })
    await issueAssessment(tcA.db, { leadId: l.id, issuedBy: tcA.id })

    expect(await stageOf(l.id)).toBe('contacted')
    expect(await history(l.id)).toEqual([{ kind: 'stage', body: 'new → contacted', author: tcA.id }])
  })

  it('moves a CNR lead too', async () => {
    const l = await lead(61, { name: 'LeadTest CNR', class_level: 11, stage: 'cnr' })
    await issueAssessment(counsellor.db, { leadId: l.id, issuedBy: counsellor.id })
    expect(await stageOf(l.id)).toBe('contacted')
  })

  it('moves a lead when a paper test is issued', async () => {
    const l = await lead(62, { name: 'LeadTest Paper', class_level: 11 })
    await issueAssessment(counsellor.db, { leadId: l.id, issuedBy: counsellor.id, mode: 'paper' })
    expect(await stageOf(l.id)).toBe('contacted')
  })

  it('never moves a lead back', async () => {
    const l = await lead(63, { name: 'LeadTest In EIS', class_level: 11, stage: 'in_eis' })
    await issueAssessment(counsellor.db, { leadId: l.id, issuedBy: counsellor.id })
    expect(await stageOf(l.id)).toBe('in_eis')
    expect(await history(l.id)).toEqual([])
  })

  it('writes one history line however many times a test is reissued', async () => {
    const l = await lead(64, { name: 'LeadTest Reissued', class_level: 11 })
    await issueAssessment(counsellor.db, { leadId: l.id, issuedBy: counsellor.id })
    await issueAssessment(counsellor.db, { leadId: l.id, issuedBy: counsellor.id })
    expect(await history(l.id)).toHaveLength(1)
  })

  it('lets a lead added by hand start at contacted, with no history line', async () => {
    const { data, error } = await tcA.db
      .from('leads')
      .insert({ name: 'LeadTest By Hand', contact_mobile: mobile(65), stage: 'contacted' })
      .select('id, stage')
      .single()
    expect(error).toBeNull()
    expect(data!.stage).toBe('contacted')
    expect(await history(data!.id)).toEqual([])
  })
})

// The board (2026-10-26): five stages, and a lead moves between any two.
describe('the board’s stages', () => {
  it('refuses Qualified, which became In EIS (migration 0026)', async () => {
    const l = await lead(70, { name: 'LeadTest Board' })
    const { error } = await svc.from('leads').update({ stage: 'qualified' }).eq('id', l.id)
    expect(error).not.toBeNull()
  })

  it('moves a lead forward and back, a history line for each move by whoever made it', async () => {
    const l = await lead(71, { name: 'LeadTest Mover', assigned_to: tcA.id })
    for (const stage of ['cnr', 'not_interested', 'new']) {
      const { error } = await tcA.db.from('leads').update({ stage }).eq('id', l.id)
      expect(error).toBeNull()
    }
    const { error } = await counsellor.db.from('leads').update({ stage: 'in_eis' }).eq('id', l.id)
    expect(error).toBeNull()

    const { data } = await svc.from('lead_comments').select('body, author').eq('lead_id', l.id).order('id')
    expect(data).toEqual([
      { body: 'new → cnr', author: tcA.id },
      { body: 'cnr → not_interested', author: tcA.id },
      { body: 'not_interested → new', author: tcA.id },
      { body: 'new → in_eis', author: counsellor.id },
    ])
  })
})

describe('names', () => {
  it('refuses to issue a test to a lead with no name', async () => {
    const l = await lead(30, { class_level: 11 })
    await expect(issueAssessment(svc, { leadId: l.id })).rejects.toThrow(/name/i)
  })

  it('refuses the same at the database, past the application check', async () => {
    const l = await lead(31, { class_level: 11 })
    const { error } = await svc.rpc('issue_assessment', {
      p_lead_id: l.id,
      p_issued_by: null,
      p_token: 'x'.repeat(22),
      // Distinct placeholders: since 0014 a repeated id is refused before the
      // lead is even looked at, and this test is about the name check.
      p_item_ids: Array.from({ length: 15 }, () => crypto.randomUUID()),
    })
    expect(error?.message).toMatch(/name/i)
  })

  it('lets a name be corrected but not removed', async () => {
    const l = await lead(32, { name: 'LeadTest Named' })
    expect((await svc.from('leads').update({ name: 'LeadTest Renamed' }).eq('id', l.id)).error).toBeNull()
    expect((await svc.from('leads').update({ name: null }).eq('id', l.id)).error).not.toBeNull()
  })
})

describe('import', () => {
  it('refuses a telecaller', async () => {
    const src = await source()
    await expect(importLeads(tcA.db, src, [row(40)])).rejects.toThrow()
    const { count } = await svc.from('leads').select('id', { count: 'exact', head: true }).eq('contact_mobile', mobile(40))
    expect(count).toBe(0)
  })

  it('creates a lead with its source, date, stage and remark', async () => {
    const src = await source()
    const result = await importLeads(counsellor.db, src, [
      row(41, { name: 'Sanjay Adhe', stage: 'contacted', interest: 'NDA', sourceDate: '2025-01-03', notes: ['Will talk to his son'] }),
    ])
    expect(result).toEqual({ created: 1, merged: 0, ambiguous: [] })

    const { data: l } = await svc
      .from('leads')
      .select('id, name, stage, interest, assigned_to, created_at, lead_origins(source_id, source_date), lead_comments(kind, body, author)')
      .eq('contact_mobile', mobile(41))
      .single()
    expect(l).toMatchObject({
      name: 'Sanjay Adhe',
      stage: 'contacted',
      interest: 'NDA',
      assigned_to: null,
      lead_origins: [{ source_id: src, source_date: '2025-01-03' }],
      lead_comments: [{ kind: 'import', body: 'Will talk to his son', author: counsellor.id }],
    })
    // The retention clock runs from arrival here, not from the sheet's date —
    // otherwise a 2025 row would be purged the night it was imported.
    expect(Date.now() - Date.parse(l!.created_at as string)).toBeLessThan(60_000)
  })

  it('adds to an existing lead without overwriting its stage, assignment or name', async () => {
    const src = await source()
    const existing = await lead(42, { name: 'Kept Name', stage: 'in_eis', assigned_to: tcA.id })

    const result = await importLeads(counsellor.db, src, [
      row(42, { name: 'Other Name', stage: 'cnr', interest: 'SPI', notes: ['second source'] }),
    ])
    expect(result).toEqual({ created: 0, merged: 1, ambiguous: [] })

    const { data } = await svc
      .from('leads')
      .select('name, stage, assigned_to, interest, lead_origins(source_id), lead_comments(body)')
      .eq('id', existing.id)
      .single()
    expect(data).toMatchObject({
      name: 'Kept Name',
      stage: 'in_eis',
      assigned_to: tcA.id,
      interest: 'SPI', // blank before, so filled
      lead_origins: [{ source_id: src }],
      lead_comments: [{ body: 'second source' }],
    })
  })

  it('fills a blank name on an existing lead', async () => {
    const src = await source()
    const existing = await lead(43)
    await importLeads(counsellor.db, src, [row(43, { name: 'Now Named' })])
    const { data } = await svc.from('leads').select('name').eq('id', existing.id).single()
    expect(data!.name).toBe('Now Named')
  })

  it('leaves a number shared by siblings alone and reports it', async () => {
    const src = await source()
    await lead(44, { name: 'Sibling One' })
    await lead(44, { name: 'Sibling Two' })

    const result = await importLeads(counsellor.db, src, [row(44, { notes: ['which child?'] }), row(45)])
    expect(result).toEqual({ created: 1, merged: 0, ambiguous: [mobile(44)] })
    const { count } = await svc.from('lead_comments').select('id', { count: 'exact', head: true }).eq('body', 'which child?')
    expect(count).toBe(0)
  })

  it('is all or nothing: one bad row writes none of the file', async () => {
    const src = await source()
    await expect(
      importLeads(counsellor.db, src, [row(46), { ...row(47), mobile: '12345' }]),
    ).rejects.toThrow()
    const { count } = await svc
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('contact_mobile', [mobile(46), mobile(47)])
    expect(count).toBe(0)
  })

  it('previews what an import would do without writing anything', async () => {
    await lead(48, { name: 'Existing' })
    await lead(49, { name: 'Sib 1' })
    await lead(49, { name: 'Sib 2' })

    const preview = await previewImport(counsellor.db, [row(48), row(49), row(50)])
    expect(preview).toEqual({ create: 1, merge: 1, ambiguous: [mobile(49)] })
    const { count } = await svc.from('leads').select('id', { count: 'exact', head: true }).eq('contact_mobile', mobile(50))
    expect(count).toBe(0)
  })
})
