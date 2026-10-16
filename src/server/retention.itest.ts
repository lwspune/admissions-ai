import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { serviceClient } from './supabase'
import { issueAssessment } from './assessments'
import { identify } from './attempt'
import { purgeExpired } from './retention'
import { retentionCutoff } from '../lib/retention'

// The 12-month purge, against the real database.
//
// Mocks would prove nothing here. Two of the three things that can go wrong
// are properties of the schema, not of this code: whether deleting a lead
// really cascades through five tables, and whether identify_attempts — which
// has no foreign key to anything — is left behind holding IP addresses.

const db = serviceClient()
const MARKER = 'PurgeTest'
const MOBILE = '9812345680'

/** Backdates a row so the purge has something genuinely expired to find. */
async function backdate(table: string, column: string, id: string, iso: string) {
  const { error } = await db.from(table).update({ [column]: iso }).eq('id', id)
  if (error) throw new Error(`could not backdate ${table}.${column}: ${error.message}`)
}

async function makeLead(name: string) {
  const { data, error } = await db
    .from('leads')
    .insert({ name: `${MARKER} ${name}`, contact_mobile: MOBILE, class_level: 11 })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data.id as string
}

async function cleanup() {
  await db.from('leads').delete().like('name', `${MARKER}%`)
  await db.from('identify_attempts').delete().eq('token', `${MARKER}-token`)
}

beforeEach(cleanup)
afterAll(cleanup)

const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString() // ~13 months
const recently = new Date(Date.now() - 10 * 86_400_000).toISOString()

describe('purgeExpired', () => {
  it('deletes a lead past the retention period, and everything hanging off it', async () => {
    const leadId = await makeLead('Expired')
    const { assessment } = await issueAssessment(db, { leadId })
    await backdate('leads', 'created_at', leadId, longAgo)
    await backdate('assessments', 'created_at', assessment.id, longAgo)

    const report = await purgeExpired(db)
    expect(report.leadIds).toContain(leadId)

    const { count: leads } = await db
      .from('leads').select('id', { count: 'exact', head: true }).eq('id', leadId)
    expect(leads).toBe(0)

    // The cascade is a property of the schema, so assert it rather than assume.
    const { count: assessments } = await db
      .from('assessments').select('id', { count: 'exact', head: true }).eq('id', assessment.id)
    expect(assessments).toBe(0)

    const { count: items } = await db
      .from('assessment_items')
      .select('assessment_id', { count: 'exact', head: true })
      .eq('assessment_id', assessment.id)
    expect(items).toBe(0)
  })

  // A sheet photo is in storage, which no cascade reaches (2026-10-16): the
  // purge has to delete it by hand, like identify_attempts.
  it('deletes an expired paper test’s sheet photo, which no cascade would reach', async () => {
    const leadId = await makeLead('Paper')
    const { assessment } = await issueAssessment(db, { leadId, mode: 'paper' })
    const path = `${assessment.id}.jpg`
    const { error: upErr } = await db.storage
      .from('omr-sheets')
      .upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' })
    expect(upErr).toBeNull()
    await backdate('leads', 'created_at', leadId, longAgo)
    await backdate('assessments', 'created_at', assessment.id, longAgo)

    const report = await purgeExpired(db)
    expect(report.leadIds).toContain(leadId)
    expect(report.sheetPhotos).toBeGreaterThanOrEqual(1)
    const { data } = await db.storage.from('omr-sheets').list('', { search: assessment.id })
    expect(data ?? []).toEqual([])
  })

  it('keeps a recent lead', async () => {
    const leadId = await makeLead('Recent')
    await purgeExpired(db)
    const { count } = await db
      .from('leads').select('id', { count: 'exact', head: true }).eq('id', leadId)
    expect(count).toBe(1)
  })

  // The failure this prevents: a candidate entered over a year ago who was
  // reissued a test last week is live in the funnel, and anchoring on the lead
  // row alone would delete them mid-process.
  it('keeps an old lead whose test was issued recently', async () => {
    const leadId = await makeLead('OldButActive')
    const { assessment } = await issueAssessment(db, { leadId })
    await backdate('leads', 'created_at', leadId, longAgo)
    await backdate('assessments', 'created_at', assessment.id, recently)

    const report = await purgeExpired(db)
    expect(report.leadIds).not.toContain(leadId)

    const { count } = await db
      .from('leads').select('id', { count: 'exact', head: true }).eq('id', leadId)
    expect(count).toBe(1)
  })

  // identify_attempts has no foreign key, so the cascade never reaches it.
  // It stores an IP against a token; leaving it is a silent retention breach.
  it('deletes expired identify_attempts, which no cascade would reach', async () => {
    const { data: row, error } = await db
      .from('identify_attempts')
      .insert({ token: `${MARKER}-token`, ip: '203.0.113.7', ok: false })
      .select()
      .single()
    if (error) throw new Error(error.message)
    await backdate('identify_attempts', 'at', String(row.id), longAgo)

    const report = await purgeExpired(db)
    expect(report.identifyAttempts).toBeGreaterThanOrEqual(1)

    const { count } = await db
      .from('identify_attempts').select('id', { count: 'exact', head: true }).eq('id', row.id)
    expect(count).toBe(0)
  })

  it('keeps recent identify_attempts, which the rate limiter still needs', async () => {
    const { data: row } = await db
      .from('identify_attempts')
      .insert({ token: `${MARKER}-token`, ip: '203.0.113.8', ok: false })
      .select()
      .single()

    await purgeExpired(db)
    const { count } = await db
      .from('identify_attempts').select('id', { count: 'exact', head: true }).eq('id', row!.id)
    expect(count).toBe(1)
  })

  it('deletes nothing on a dry run, but reports what it would take', async () => {
    const leadId = await makeLead('DryRun')
    await backdate('leads', 'created_at', leadId, longAgo)

    const report = await purgeExpired(db, { dryRun: true })
    expect(report.dryRun).toBe(true)
    expect(report.leadIds).toContain(leadId)

    const { count } = await db
      .from('leads').select('id', { count: 'exact', head: true }).eq('id', leadId)
    expect(count).toBe(1)
  })

  it('reports the cutoff it used, so a log line can be audited later', async () => {
    const now = new Date('2026-09-23T00:00:00Z')
    const report = await purgeExpired(db, { now, dryRun: true })
    expect(report.cutoff).toBe(retentionCutoff(now).toISOString())
    expect(report.cutoff).toBe('2025-09-23T00:00:00.000Z')
  })
})

// Nothing above should ever touch a real candidate. This asserts it directly.
describe('purge safety', () => {
  it('leaves leads that are not expired alone, whatever else is in the table', async () => {
    const { count: before } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('name', 'like', `${MARKER}%`)

    await purgeExpired(db)

    const { count: after } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('name', 'like', `${MARKER}%`)

    expect(after).toBe(before)
  })
})

// Referenced so the unused-import lint does not fire if a test is removed.
void identify
