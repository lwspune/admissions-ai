import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { serviceClient } from './supabase'
import { issueAssessment } from './assessments'
import { identify, startAttempt, submitAttempt } from './attempt'
import { loadLeadReport } from './report'

// Question text must never reach a telecaller. Staff who see the same items
// repeatedly can coach them, and a telecaller's incentives push exactly that
// way — they are measured on candidates reaching the counsellor.
//
// Until now nothing rendered the stem, so `loadPaper`'s stripping was inert and
// untested. The report's detail table displays it, which makes this the thing
// standing between a telecaller and the whole live bank. Hence a test against
// the real database rather than a mock.

const db = serviceClient()
const MOBILE = '9812345679'
let leadId: string

beforeAll(async () => {
  await db.from('leads').delete().like('name', 'RptTest%')
  const { data, error } = await db
    .from('leads')
    .insert({ name: 'RptTest Candidate', contact_mobile: MOBILE })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  leadId = data.id as string

  const { assessment } = await issueAssessment(db, { leadId })
  await identify(db, { token: assessment.token, mobile: MOBILE })
  const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
  await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
})

afterAll(async () => {
  await db.from('leads').delete().like('name', 'RptTest%')
})

describe('loadLeadReport question visibility', () => {
  it('gives a telecaller no question text at all', async () => {
    const report = await loadLeadReport(db, leadId, 'telecaller')
    expect(report?.report?.questions).toHaveLength(15)
    for (const question of report!.report!.questions) {
      expect(question.stem).toBe('')
    }
  })

  it('gives a counsellor the question text', async () => {
    const report = await loadLeadReport(db, leadId, 'counsellor')
    expect(report?.report?.questions).toHaveLength(15)
    for (const question of report!.report!.questions) {
      expect(question.stem.length).toBeGreaterThan(0)
    }
  })

  it('gives a superadmin the question text', async () => {
    const report = await loadLeadReport(db, leadId, 'superadmin')
    for (const question of report!.report!.questions) {
      expect(question.stem.length).toBeGreaterThan(0)
    }
  })

  it('withholds the options from a telecaller too, not just the stem', async () => {
    // The stem alone is not the secret. An MCQ's options identify the item just
    // as well, and `correctDisplay` renders "C. <option text>" — so leaving
    // options in place would leak the answer in full while appearing stripped.
    const telecaller = await loadLeadReport(db, leadId, 'telecaller')
    const counsellor = await loadLeadReport(db, leadId, 'counsellor')

    const mcqFor = (r: Awaited<ReturnType<typeof loadLeadReport>>) =>
      r!.report!.questions.filter((q) => q.format === 'mcq')

    expect(mcqFor(counsellor).length).toBeGreaterThan(0)
    for (const question of mcqFor(telecaller)) {
      // "C" is acceptable; "C. thirty seven" is not.
      expect(question.correctDisplay).not.toMatch(/\.\s\S/)
    }
  })
})
