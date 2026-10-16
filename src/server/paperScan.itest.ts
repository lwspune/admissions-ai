import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { issueAssessment, type Assessment } from './assessments'
import { lookupPaperForScan, recordPaperScan, sheetPhotoPath, sheetPhotoUrl } from './paperScan'
import { loadLeadReport, loadParentReport } from './report'
import { gradeAttempt, type GradeItem } from '../lib/grade'
import type { ScanAnswer } from '../lib/scanResult'
import type { StaffUser } from './auth'
import type { Choice, Format } from '../lib/types'

// Scanning a paper test (2026-10-16), against the real database, signed in as
// real staff. The rules live in `record_paper_scan` and the storage policies
// (migration 0019): only a counsellor or superadmin files a scan, once, while
// the paper is open, with its photo already stored, and the score is computed
// in the database from the stored answers — never sent by the browser.
//
// Marker: leads on 97000030xx, logins prefixed PREFIX.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'scantest-'
const mobile = (n: number) => `97000030${String(n).padStart(2, '0')}`
// The smallest JPEG worth calling one: SOI, a comment, EOI.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x69, 0x74, 0xff, 0xd9])

interface Session {
  db: SupabaseClient
  actor: StaffUser
}

async function signIn(role: StaffUser['role'], tag: string): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const name = `Scan ${role}`
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

const issued: string[] = []
async function cleanup() {
  if (issued.length) await svc.storage.from('omr-sheets').remove(issued.splice(0).map(sheetPhotoPath))
  await svc.from('leads').delete().like('contact_mobile', '97000030%')
}
async function removeUsers() {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) await svc.auth.admin.deleteUser(u.id)
}

let telecaller: Session
let counsellor: Session

beforeAll(async () => {
  await cleanup()
  await removeUsers()
  telecaller = await signIn('telecaller', 't')
  counsellor = await signIn('counsellor', 'c')
})
beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await removeUsers()
})

async function paperTest(n: number): Promise<Assessment & { leadId: string }> {
  const { data, error } = await svc
    .from('leads')
    .insert({ name: `ScanTest ${n}`, contact_mobile: mobile(n), class_level: 9, assigned_to: telecaller.actor.id })
    .select('id')
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  const { assessment } = await issueAssessment(counsellor.db as never, {
    leadId: data.id as string,
    issuedBy: counsellor.actor.id,
    mode: 'paper',
  })
  issued.push(assessment.id)
  return { ...assessment, leadId: data.id as string }
}

async function upload(s: Session, assessmentId: string) {
  return s.db.storage.from('omr-sheets').upload(sheetPhotoPath(assessmentId), JPEG, { contentType: 'image/jpeg', upsert: true })
}

/** The paper's keys, read as service role — what the test grades against. */
async function keysOf(assessmentId: string): Promise<GradeItem[]> {
  const { data } = await svc
    .from('assessment_items')
    .select('position, test_items(subject, format, answer_key, numeric_answer, numeric_tolerance)')
    .eq('assessment_id', assessmentId)
    .order('position')
  return (data ?? []).map((r) => {
    const t = r.test_items as never as {
      subject: GradeItem['subject']
      format: Format
      answer_key: Choice | null
      numeric_answer: number | null
      numeric_tolerance: number | null
    }
    return {
      position: r.position as number,
      subject: t.subject,
      format: t.format,
      answerKey: t.answer_key,
      numericAnswer: t.numeric_answer === null ? null : Number(t.numeric_answer),
      numericTolerance: Number(t.numeric_tolerance ?? 0),
    }
  })
}

/** Right, wrong, double-marked and blank answers, so every branch of the grader runs. */
function mixedAnswers(keys: GradeItem[]): ScanAnswer[] {
  let mcqSeen = 0
  let numericSeen = 0
  return keys.map((k) => {
    const base = { position: k.position, choice: null, numericValue: null, doubleMark: false, byHand: false }
    if (k.format === 'mcq') {
      const n = mcqSeen++ % 4
      if (n === 0) return { ...base, choice: k.answerKey }
      if (n === 1) return { ...base, choice: k.answerKey === 'A' ? 'B' : 'A' }
      if (n === 2) return { ...base, doubleMark: true, byHand: true }
      return base
    }
    const n = numericSeen++ % 3
    if (n === 0) return { ...base, numericValue: k.numericAnswer }
    if (n === 1) return { ...base, numericValue: (k.numericAnswer ?? 0) + 1 }
    return base
  })
}

describe('looking a paper up by its number', () => {
  it('gives a counsellor who it is for and its formats, and no question', async () => {
    const a = await paperTest(1)
    const paper = await lookupPaperForScan(counsellor.db as never, a.paper_no!, 'counsellor')
    expect(paper).toMatchObject({ assessmentId: a.id, name: 'ScanTest 1', paperNo: a.paper_no, state: 'issued' })
    expect(paper!.formats).toHaveLength(a.question_count)
    const bytes = JSON.stringify(paper)
    for (const leak of ['stem', 'answer_key', 'options', 'rationale', 'token']) expect(bytes).not.toContain(leak)
  })

  it('gives a telecaller nothing', async () => {
    const a = await paperTest(2)
    expect(await lookupPaperForScan(telecaller.db as never, a.paper_no!, 'telecaller')).toBeNull()
  })

  it('finds nothing for a number no paper carries', async () => {
    expect(await lookupPaperForScan(counsellor.db as never, 999_990, 'counsellor')).toBeNull()
  })
})

describe('filing a scan', () => {
  it('files the answers, completes the test, and scores it in the database as the app grades it', async () => {
    const a = await paperTest(3)
    expect((await upload(counsellor, a.id)).error).toBeNull()
    const keys = await keysOf(a.id)
    const answers = mixedAnswers(keys)

    const result = await recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')
    const expected = gradeAttempt(keys, answers)
    expect(result).toMatchObject({ score: expected.score, correct: expected.correct, incorrect: expected.incorrect })

    const { data: row } = await svc.from('assessments').select('state').eq('id', a.id).single()
    expect(row!.state).toBe('submitted')
    const { data: attempt } = await svc.from('attempts').select('*').eq('assessment_id', a.id).single()
    expect(attempt).toMatchObject({
      submit_reason: 'paper',
      scanned_by: counsellor.actor.id,
      scanned_by_name: 'Scan counsellor',
      sheet_photo: sheetPhotoPath(a.id),
      correct: expected.correct,
      incorrect: expected.incorrect,
      skipped: expected.skipped,
    })
    expect(Number(attempt!.score)).toBe(expected.score)
    expect(Number(attempt!.maths_score)).toBe(expected.sections.maths)
    expect(Number(attempt!.english_score)).toBe(expected.sections.english)
    expect(Number(attempt!.science_score)).toBe(expected.sections.science)
  })

  it('shows on the report and the parent sheet as a paper test', async () => {
    const a = await paperTest(4)
    await upload(counsellor, a.id)
    const answers = mixedAnswers(await keysOf(a.id))
    await recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')

    const report = await loadLeadReport(counsellor.db as never, a.leadId, 'counsellor')
    expect(report!.attempt?.submitReason).toBe('paper')
    expect(report!.report!.facts.decidedByHand).toEqual(answers.filter((x) => x.byHand).map((x) => x.position))
    expect(report!.report!.questions.some((q) => q.givenDisplay === 'Two marks')).toBe(true)

    const parent = await loadParentReport(counsellor.db as never, a.leadId, 'counsellor')
    expect(parent!.onPaper).toBe(true)
    expect(parent!.timeUsedMs).toBeNull()
  })

  it('files a sheet once, and only once', async () => {
    const a = await paperTest(5)
    await upload(counsellor, a.id)
    const answers = mixedAnswers(await keysOf(a.id))
    await recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')
    await expect(recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')).rejects.toThrow(
      /already/i,
    )
  })

  it('refuses a scan whose photo is not stored', async () => {
    const a = await paperTest(6)
    const answers = mixedAnswers(await keysOf(a.id))
    await expect(recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')).rejects.toThrow(
      /photo/i,
    )
  })

  it('refuses a telecaller, in the app and in the database', async () => {
    const a = await paperTest(7)
    await upload(counsellor, a.id)
    const answers = mixedAnswers(await keysOf(a.id))
    await expect(recordPaperScan(telecaller.db as never, { assessmentId: a.id, answers }, 'telecaller')).rejects.toThrow()
    const { error } = await telecaller.db.rpc('record_paper_scan', {
      p_assessment_id: a.id,
      p_answers: answers,
    })
    expect(error?.message).toMatch(/counsellor/i)
  })

  it('refuses an online test', async () => {
    const { data } = await svc
      .from('leads')
      .insert({ name: 'ScanTest 8', contact_mobile: mobile(8), class_level: 9 })
      .select('id')
      .single()
    const { assessment } = await issueAssessment(counsellor.db as never, { leadId: data!.id as string, issuedBy: null })
    const { error } = await counsellor.db.rpc('record_paper_scan', { p_assessment_id: assessment.id, p_answers: [] })
    expect(error?.message).toMatch(/paper test/i)
  })

  it('refuses a scan once the paper’s window has closed', async () => {
    const a = await paperTest(9)
    await upload(counsellor, a.id)
    const answers = mixedAnswers(await keysOf(a.id))
    await svc
      .from('assessments')
      .update({
        created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', a.id)
    await expect(recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers }, 'counsellor')).rejects.toThrow(
      /closed/i,
    )
  })

  it('refuses answers that do not fit the paper, in the app and in the database', async () => {
    const a = await paperTest(10)
    await upload(counsellor, a.id)
    const keys = await keysOf(a.id)
    const answers = mixedAnswers(keys)
    const numericAt = keys.findIndex((k) => k.format === 'numeric')
    const bad = answers.map((x, i) => (i === numericAt ? { ...x, choice: 'A' as const, numericValue: null } : x))

    await expect(recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers: bad }, 'counsellor')).rejects.toThrow(
      /numeric/i,
    )
    for (const p_answers of [bad, answers.slice(1)]) {
      const { error } = await counsellor.db.rpc('record_paper_scan', { p_assessment_id: a.id, p_answers })
      expect(error, JSON.stringify(p_answers).slice(0, 80)).not.toBeNull()
    }
    const { count } = await svc.from('attempts').select('id', { count: 'exact', head: true }).eq('assessment_id', a.id)
    expect(count).toBe(0)
  })
})

describe('the sheet photo', () => {
  it('is stored and opened by a counsellor, never by a telecaller', async () => {
    const a = await paperTest(11)
    expect((await upload(telecaller, a.id)).error).not.toBeNull()
    expect((await upload(counsellor, a.id)).error).toBeNull()
    expect(await sheetPhotoUrl(counsellor.db as never, a.id, 'counsellor')).toMatch(/^https:/)
    expect(await sheetPhotoUrl(telecaller.db as never, a.id, 'telecaller')).toBeNull()
    const { data } = await telecaller.db.storage.from('omr-sheets').download(sheetPhotoPath(a.id))
    expect(data).toBeNull()
  })

  it('cannot be replaced once the scan is filed — it is the record', async () => {
    const a = await paperTest(12)
    await upload(counsellor, a.id)
    await recordPaperScan(counsellor.db as never, { assessmentId: a.id, answers: mixedAnswers(await keysOf(a.id)) }, 'counsellor')
    expect((await upload(counsellor, a.id)).error).not.toBeNull()
  })

  it('is refused under any name but a paper test’s', async () => {
    const { error } = await counsellor.db.storage
      .from('omr-sheets')
      .upload('anything.jpg', JPEG, { contentType: 'image/jpeg' })
    expect(error).not.toBeNull()
  })
})
