import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { importLeads, previewImport } from './leadImport'
import { listAssignees, listApplicantAdders } from './staff'
import { addApplicant, attachResume, issueHiringTest } from './hiring'
import type { StaffUser } from './auth'
import type { ImportRow } from '../lib/leads'

// Orgs (migration 0030): every lead and every applicant belongs to one org,
// and staff see only their own org's. Superadmin sees every org.
//
// Two throwaway orgs, so the real ones are never written to. Each role gets a
// throwaway login and its own anon-key client, the path a browser takes; a
// service-role check proves nothing about a policy.
//
// Marker: every lead and applicant here has a mobile in 97000030xx; the one
// source is SOURCE; the orgs' slugs start with ORG_PREFIX.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'orgtest-'
const SOURCE = 'OrgTest source'
const ORG_PREFIX = 'itest-org-'
const mobile = (n: number) => `97000030${String(n).padStart(2, '0')}`

interface Session {
  id: string
  db: SupabaseClient
  actor: StaffUser
}

async function signIn(role: StaffUser['role'], tag: string, orgId: string | null): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const name = `Org ${tag}`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: orgId ? { role, name, org_id: orgId } : { role, name },
  })
  if (error) throw new Error(`could not create ${role}: ${error.message}`)

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`)

  return { id: data.user.id, db, actor: { id: data.user.id, name, email, role, orgId } }
}

async function cleanup() {
  await svc.from('leads').delete().like('contact_mobile', '97000030%')
  await svc.from('hiring_applicants').delete().like('mobile', '97000030%')
  await svc.from('lead_sources').delete().eq('name', SOURCE)
}

async function removeUsers() {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) {
    await svc.auth.admin.deleteUser(u.id)
  }
}

async function makeOrg(tag: string): Promise<string> {
  const { data, error } = await svc
    .from('organizations')
    .insert({ slug: `${ORG_PREFIX}${tag}`, name: `ITest Org ${tag.toUpperCase()}` })
    .select('id')
    .single()
  if (error) throw new Error(`could not create org ${tag}: ${error.message}`)
  return data.id as string
}

let orgA: string
let orgB: string
let counsellorA: Session
let counsellorB: Session
let telecallerA: Session
let telecallerB: Session
let teacherA1: Session
let teacherA2: Session
let teacherB: Session
let superadmin: Session
let orgless: Session

beforeAll(async () => {
  await cleanup()
  await removeUsers()
  await svc.from('organizations').delete().like('slug', `${ORG_PREFIX}%`)
  orgA = await makeOrg('a')
  orgB = await makeOrg('b')
  counsellorA = await signIn('counsellor', 'ca', orgA)
  counsellorB = await signIn('counsellor', 'cb', orgB)
  telecallerA = await signIn('telecaller', 'ta', orgA)
  telecallerB = await signIn('telecaller', 'tb', orgB)
  teacherA1 = await signIn('teacher', 'a1', orgA)
  teacherA2 = await signIn('teacher', 'a2', orgA)
  teacherB = await signIn('teacher', 'b', orgB)
  superadmin = await signIn('superadmin', 's', orgA)
  orgless = await signIn('counsellor', 'none', null)
})
beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await removeUsers()
  await svc.from('organizations').delete().like('slug', `${ORG_PREFIX}%`)
})

async function lead(n: number, org: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await svc
    .from('leads')
    .insert({ contact_mobile: mobile(n), org_id: org, ...fields })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data as { id: string; org_id: string; [k: string]: unknown }
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

async function ids(s: Session, table: 'leads' | 'hiring_applicants', column: string) {
  const { data, error } = await s.db.from(table).select('id').like(column, '97000030%')
  if (error) throw new Error(`could not read ${table}: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

describe('leads stay inside their org', () => {
  it('shows a counsellor their own org’s leads and none of another’s', async () => {
    const a = await lead(1, orgA)
    const b = await lead(2, orgB)

    expect(await ids(counsellorA, 'leads', 'contact_mobile')).toEqual([a.id])
    expect(await ids(counsellorB, 'leads', 'contact_mobile')).toEqual([b.id])
  })

  it('hides another org’s comments and origins, not only the lead row', async () => {
    const a = await lead(3, orgA)
    await svc.from('lead_comments').insert({ lead_id: a.id, kind: 'note', body: 'OrgTest note' })

    const { data: comments } = await counsellorB.db.from('lead_comments').select('id').eq('lead_id', a.id)
    expect(comments).toEqual([])
    const { data: own } = await counsellorA.db.from('lead_comments').select('id').eq('lead_id', a.id)
    expect(own).toHaveLength(1)

    const { data: source } = await svc.from('lead_sources').insert({ name: SOURCE }).select('id').single()
    const { error } = await counsellorB.db.from('lead_origins').insert({ lead_id: a.id, source_id: source!.id })
    expect(error).not.toBeNull()
  })

  it('shows superadmin every org’s leads', async () => {
    const a = await lead(4, orgA)
    const b = await lead(5, orgB)
    expect((await ids(superadmin, 'leads', 'contact_mobile')).sort()).toEqual([a.id, b.id].sort())
  })

  it('shows an account with no org nothing', async () => {
    await lead(6, orgA)
    expect(await ids(orgless, 'leads', 'contact_mobile')).toEqual([])
  })

  it('puts a lead typed in by a counsellor in their org, whatever the browser sends', async () => {
    const { data, error } = await counsellorB.db
      .from('leads')
      .insert({ name: 'OrgTest Typed', contact_mobile: mobile(7), org_id: orgA })
      .select('org_id')
      .single()
    expect(error).toBeNull()
    expect(data!.org_id).toBe(orgB)
  })

  it('never moves a lead to another org', async () => {
    const a = await lead(8, orgA)
    const { error } = await counsellorA.db.from('leads').update({ org_id: orgB }).eq('id', a.id)
    expect(error).not.toBeNull()
    const { data } = await svc.from('leads').select('org_id').eq('id', a.id).single()
    expect(data!.org_id).toBe(orgA)
  })

  it('refuses a lead written without a session and without an org', async () => {
    const { error } = await svc.from('leads').insert({ contact_mobile: mobile(9) })
    expect(error).not.toBeNull()
  })

  it('assigns a lead only to a telecaller of its own org', async () => {
    const a = await lead(10, orgA)
    const { error: across } = await counsellorA.db.from('leads').update({ assigned_to: telecallerB.id }).eq('id', a.id)
    expect(across).not.toBeNull()
    const { error: own } = await counsellorA.db.from('leads').update({ assigned_to: telecallerA.id }).eq('id', a.id)
    expect(own).toBeNull()
  })

  it('offers a counsellor only their own org’s telecallers', async () => {
    const labels = (await listAssignees(counsellorA.actor)).map((a) => a.id)
    expect(labels).toContain(telecallerA.id)
    expect(labels).not.toContain(telecallerB.id)
  })

  it('counts a number as taken only within the org', async () => {
    await lead(11, orgA)
    const { data: inA } = await counsellorA.db.rpc('leads_on_mobile', { p_mobile: mobile(11) })
    const { data: inB } = await counsellorB.db.rpc('leads_on_mobile', { p_mobile: mobile(11) })
    expect(inA).toBe(1)
    expect(inB).toBe(0)
  })

  it('imports a number another org holds as a new lead, leaving theirs alone', async () => {
    const a = await lead(12, orgA, { name: 'OrgTest Theirs' })
    const { data: source } = await svc.from('lead_sources').insert({ name: SOURCE }).select('id').single()

    const result = await importLeads(counsellorB.db as never, source!.id, [row(12, { name: 'OrgTest Ours' })])
    expect(result).toEqual({ created: 1, merged: 0, ambiguous: [] })

    const { data: rows } = await svc.from('leads').select('id, org_id, name').eq('contact_mobile', mobile(12))
    expect(rows).toHaveLength(2)
    expect(rows!.find((r) => r.org_id === orgB)!.name).toBe('OrgTest Ours')
    const { count } = await svc.from('lead_origins').select('id', { count: 'exact', head: true }).eq('lead_id', a.id)
    expect(count).toBe(0)
  })

  it('previews a superadmin’s import against their own org only', async () => {
    await lead(13, orgB)
    // superadmin sees org B's lead, but imports into org A, so it is a new lead.
    expect(await previewImport(superadmin.db as never, [row(13)], superadmin.actor.orgId)).toEqual({
      create: 1,
      merge: 0,
      ambiguous: [],
    })
  })
})

describe('teacher applicants stay inside their org', () => {
  async function applicant(s: Session, n: number) {
    const added = await addApplicant(s.db as never, { name: `OrgTest ${n}`, mobile: mobile(n), subject: 'maths' })
    if (!added.ok) throw new Error(`could not add applicant: ${added.error}`)
    return added.id
  }

  it('shows a teacher every applicant in their org, including another teacher’s', async () => {
    const id = await applicant(teacherA1, 20)
    expect(await ids(teacherA2, 'hiring_applicants', 'mobile')).toEqual([id])
  })

  it('hides an applicant from a teacher of another org', async () => {
    await applicant(teacherA1, 21)
    expect(await ids(teacherB, 'hiring_applicants', 'mobile')).toEqual([])
  })

  it('stamps an applicant with the teacher’s org', async () => {
    const id = await applicant(teacherB, 22)
    const { data } = await svc.from('hiring_applicants').select('org_id').eq('id', id).single()
    expect(data!.org_id).toBe(orgB)
  })

  it('refuses another org’s teacher a test or a resume for the applicant', async () => {
    const id = await applicant(teacherA1, 23)
    // The refusal, not a missing file or an empty bank: the same "no such
    // applicant" a teacher gets for an id that does not exist.
    expect(await issueHiringTest(teacherB.db as never, id)).toEqual({ ok: false, error: 'You cannot issue a test to this applicant.' })
    expect(await attachResume(teacherB.db as never, id, 'cv.pdf')).toEqual({ ok: false, error: 'You cannot add a resume for this applicant.' })
  })

  it('names who added an applicant to a teacher of the same org, and nobody from another', async () => {
    const names = await listApplicantAdders(teacherA2.actor)
    expect(names[teacherA1.id]).toBe('Org a1')
    expect(names[teacherB.id]).toBeUndefined()
    expect(names[counsellorB.id]).toBeUndefined()
    await expect(listApplicantAdders(counsellorA.actor)).rejects.toThrow()
  })

  it('shows superadmin every org’s applicants', async () => {
    const a = await applicant(teacherA1, 24)
    const b = await applicant(teacherB, 25)
    expect((await ids(superadmin, 'hiring_applicants', 'mobile')).sort()).toEqual([a, b].sort())
  })
})
