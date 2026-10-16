import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { issueAssessment } from './assessments'
import { openByToken, identify, startAttempt } from './attempt'
import { loadPaperTest } from './paperTest'
import { loadLeadReport } from './report'
import type { StaffUser } from './auth'

// Paper tests (2026-10-16), against the real database, signed in as real staff.
//
// The rules are a trigger and the issue function (migration 0018): only a
// counsellor or superadmin makes a paper test, its mode and number never
// change, and its link opens nothing. A service-role test would prove none of
// the role rules, so each role gets a throwaway login and its own client.
//
// Marker: leads on 97000020xx, logins prefixed PREFIX.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'papertest-'
const mobile = (n: number) => `97000020${String(n).padStart(2, '0')}`
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

interface Session {
  db: SupabaseClient
  actor: StaffUser
}

async function signIn(role: StaffUser['role'], tag: string): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const name = `Paper ${role}`
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
  return { db, actor: { id: data.user.id, name, email, role } }
}

async function cleanup() {
  await svc.from('leads').delete().like('contact_mobile', '97000020%')
}

async function removeUsers() {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) await svc.auth.admin.deleteUser(u.id)
}

let telecaller: Session
let counsellor: Session
let superadmin: Session

beforeAll(async () => {
  await cleanup()
  await removeUsers()
  telecaller = await signIn('telecaller', 't')
  counsellor = await signIn('counsellor', 'c')
  superadmin = await signIn('superadmin', 's')
})
beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await removeUsers()
})

/** A class 9 admit, assigned to the telecaller so every role can see it. */
async function lead(n: number): Promise<string> {
  const { data, error } = await svc
    .from('leads')
    .insert({ name: `PaperTest ${n}`, contact_mobile: mobile(n), class_level: 9, assigned_to: telecaller.actor.id })
    .select('id')
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data.id as string
}

const issuePaper = (s: Session, leadId: string) =>
  issueAssessment(s.db as never, { leadId, issuedBy: s.actor.id, mode: 'paper' })

describe('issuing a paper test', () => {
  it('lets a counsellor issue one: numbered, three days to scan, the same paper as online', async () => {
    const { assessment } = await issuePaper(counsellor, await lead(1))
    expect(assessment.mode).toBe('paper')
    expect(assessment.paper_no).toBeGreaterThanOrEqual(100_000)
    expect(assessment.paper_no).toBeLessThanOrEqual(999_999)
    expect(assessment.question_count).toBe(30)
    expect(assessment.state).toBe('issued')
    const window = Date.parse(assessment.expires_at) - Date.parse(assessment.created_at)
    expect(Math.abs(window - 3 * DAY)).toBeLessThan(60_000)
  })

  it('lets a superadmin issue one', async () => {
    const { assessment } = await issuePaper(superadmin, await lead(2))
    expect(assessment.mode).toBe('paper')
  })

  it('refuses a telecaller, and writes nothing', async () => {
    const leadId = await lead(3)
    await expect(issuePaper(telecaller, leadId)).rejects.toThrow(/counsellor/i)
    const { count } = await svc.from('assessments').select('id', { count: 'exact', head: true }).eq('lead_id', leadId)
    expect(count).toBe(0)
  })

  it('refuses a telecaller who writes the row directly, past the issue function', async () => {
    const leadId = await lead(4)
    const { error } = await telecaller.db.from('assessments').insert({
      lead_id: leadId,
      token: `paperdirect${Date.now()}`.padEnd(22, 'x'),
      issue_seq: 1,
      question_count: 30,
      limit_minutes: 30,
      class_level: 9,
      mode: 'paper',
      paper_no: 999_998,
    })
    expect(error?.message).toMatch(/counsellor/i)
  })

  it('still lets a telecaller issue an online link, with no paper number and three hours', async () => {
    const { assessment } = await issueAssessment(telecaller.db as never, {
      leadId: await lead(5),
      issuedBy: telecaller.actor.id,
    })
    expect(assessment.mode).toBe('online')
    expect(assessment.paper_no).toBeNull()
    const window = Date.parse(assessment.expires_at) - Date.parse(assessment.created_at)
    expect(Math.abs(window - 3 * HOUR)).toBeLessThan(60_000)
  })

  it('gives every paper test its own number', async () => {
    const a = await issuePaper(counsellor, await lead(6))
    const b = await issuePaper(counsellor, await lead(7))
    expect(a.assessment.paper_no).not.toBe(b.assessment.paper_no)
  })

  it('never changes a test’s mode or number once issued', async () => {
    const paper = (await issuePaper(counsellor, await lead(8))).assessment
    const online = (await issueAssessment(counsellor.db as never, { leadId: await lead(9), issuedBy: null })).assessment

    for (const [id, change] of [
      [paper.id, { mode: 'online', paper_no: null }],
      [paper.id, { paper_no: 999_997 }],
      [online.id, { mode: 'paper', paper_no: 999_996 }],
    ] as const) {
      const { error } = await counsellor.db.from('assessments').update(change).eq('id', id)
      expect(error?.message, JSON.stringify(change)).toMatch(/mode|paper number/i)
    }
  })
})

describe('a paper test has no working link', () => {
  it('will not open, identify or start online', async () => {
    const { assessment } = await issuePaper(counsellor, await lead(10))
    expect(await openByToken(svc, assessment.token)).toEqual({ status: 'not_found' })
    expect((await identify(svc, { token: assessment.token, mobile: mobile(10) })).ok).toBe(false)
    await expect(startAttempt(svc, { token: assessment.token, context: {} })).rejects.toThrow()
  })
})

describe('the question paper', () => {
  it('gives a counsellor the questions and the sheet, and no answer', async () => {
    const leadId = await lead(11)
    const { assessment } = await issuePaper(counsellor, leadId)
    const paper = await loadPaperTest(counsellor.db as never, assessment.id, 'counsellor')
    expect(paper).not.toBeNull()
    expect(paper!.questions.map((q) => q.position)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(paper!.questions.every((q) => q.stem.length > 0)).toBe(true)
    expect(paper!.sheet.paperNo).toBe(assessment.paper_no)
    expect(paper!.sheet.formats).toEqual(paper!.questions.map((q) => q.format))
    expect(paper!.leadId).toBe(leadId)

    const bytes = JSON.stringify(paper)
    for (const field of ['answer_key', 'answerKey', 'numeric_answer', 'numericAnswer', 'rationale', 'token']) {
      expect(bytes).not.toContain(field)
    }
    const { data: keys } = await svc
      .from('assessment_items')
      .select('test_items(rationale)')
      .eq('assessment_id', assessment.id)
    for (const k of keys ?? []) {
      expect(bytes).not.toContain((k.test_items as never as { rationale: string }).rationale)
    }
  })

  it('gives a telecaller nothing, even on a lead assigned to them', async () => {
    const { assessment } = await issuePaper(counsellor, await lead(12))
    expect(await loadPaperTest(telecaller.db as never, assessment.id, 'telecaller')).toBeNull()
  })

  it('is only for a paper test', async () => {
    const { assessment } = await issueAssessment(counsellor.db as never, { leadId: await lead(13), issuedBy: null })
    expect(await loadPaperTest(counsellor.db as never, assessment.id, 'counsellor')).toBeNull()
  })
})

describe('the report', () => {
  it('says the current test is on paper, and its number', async () => {
    const leadId = await lead(14)
    const { assessment } = await issuePaper(counsellor, leadId)
    const report = await loadLeadReport(counsellor.db as never, leadId, 'counsellor')
    expect(report!.issue.mode).toBe('paper')
    expect(report!.issue.paperNo).toBe(assessment.paper_no)
  })
})
