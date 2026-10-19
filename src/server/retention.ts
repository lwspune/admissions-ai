import 'server-only'
import type { Db } from './supabase'
import { retentionCutoff, lastActivity, isExpired } from '../lib/retention'

export interface PurgeReport {
  cutoff: string
  dryRun: boolean
  leads: number
  identifyAttempts: number
  /** Scanned sheet photos removed from storage with their leads. */
  sheetPhotos: number
  /** Teacher applicants (HIRING_TEST_SPEC.md), with their tests, attempts and answers. */
  hiringApplicants: number
  /** Refs of what would go, capped — for the log, never for a response body. */
  leadIds: string[]
}

/**
 * Deletes candidate data past the twelve months the parent consents to.
 *
 * Runs as service role: a cron has no session to act for, so there is no RLS
 * principal available. That is the one legitimate reason for a non-candidate
 * path to use it.
 *
 * Two separate deletions, and the second is the one easy to miss.
 * `identify_attempts` has NO foreign key to anything — it records a token, an
 * IP and a timestamp so the rate limiter can count across serverless
 * instances. Deleting a lead cascades through assessments, attempts, answers
 * and events, and leaves those IP rows untouched. A purge that only deleted
 * leads would quietly retain personal data forever while reporting success.
 *
 * Teacher applicants (2026-10-19) are kept on the same 12 months from their
 * last activity — added, or last issued a test — and deleting one cascades
 * through tests, papers, attempts and answers. Their number checks are in
 * identify_attempts with everyone else's.
 *
 * The third is in storage: a paper test's scanned sheet photo (2026-10-16).
 * Storage does not cascade either, so the photos of the expired leads' paper
 * tests are removed by name before the leads are deleted, while the rows that
 * name them still exist.
 */
export async function purgeExpired(
  db: Db,
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<PurgeReport> {
  const cutoff = retentionCutoff(now)
  const cutoffIso = cutoff.toISOString()

  // Candidates whose lead row is old enough to be a candidate for deletion.
  // The lead date alone does not decide it — a lead entered thirteen months
  // ago and reissued last week is active — so the assessments are checked too.
  const { data: oldLeads, error: leadsError } = await db
    .from('leads')
    .select('id, created_at, assessments(id, created_at, mode)')
    .lt('created_at', cutoffIso)

  if (leadsError) throw new Error(`could not read leads for purge: ${leadsError.message}`)

  const expired = (oldLeads ?? []).filter((lead) => {
    const assessments = (lead.assessments ?? []) as { created_at: string }[]
    return isExpired(
      lastActivity(lead.created_at as string, assessments.map((a) => a.created_at)),
      cutoff,
    )
  })
  const leadIds = expired.map((l) => l.id as string)
  const photos = expired.flatMap((lead) =>
    ((lead.assessments ?? []) as { id: string; mode: string }[])
      .filter((a) => a.mode === 'paper')
      .map((a) => `${a.id}.jpg`),
  )

  const { data: oldApplicants, error: applicantsError } = await db
    .from('hiring_applicants')
    .select('id, created_at, hiring_tests(created_at)')
    .lt('created_at', cutoffIso)

  if (applicantsError) throw new Error(`could not read applicants for purge: ${applicantsError.message}`)

  const applicantIds = (oldApplicants ?? [])
    .filter((a) =>
      isExpired(
        lastActivity(a.created_at as string, ((a.hiring_tests ?? []) as { created_at: string }[]).map((t) => t.created_at)),
        cutoff,
      ),
    )
    .map((a) => a.id as string)

  const { count: staleIdentify, error: countError } = await db
    .from('identify_attempts')
    .select('id', { count: 'exact', head: true })
    .lt('at', cutoffIso)

  if (countError) throw new Error(`could not count identify_attempts: ${countError.message}`)

  const report: PurgeReport = {
    cutoff: cutoffIso,
    dryRun,
    leads: leadIds.length,
    identifyAttempts: staleIdentify ?? 0,
    sheetPhotos: photos.length,
    hiringApplicants: applicantIds.length,
    leadIds,
  }

  if (dryRun) return report

  if (photos.length > 0) {
    // Removing a name that was never uploaded is not an error.
    const { error } = await db.storage.from('omr-sheets').remove(photos)
    if (error) throw new Error(`could not delete expired sheet photos: ${error.message}`)
  }

  if (leadIds.length > 0) {
    // Cascades to assessments, assessment_items, attempts, attempt_answers
    // and attempt_events.
    const { error } = await db.from('leads').delete().in('id', leadIds)
    if (error) throw new Error(`could not delete expired leads: ${error.message}`)
  }

  if (applicantIds.length > 0) {
    // Cascades to hiring_tests, hiring_test_items, hiring_attempts and hiring_answers.
    const { error } = await db.from('hiring_applicants').delete().in('id', applicantIds)
    if (error) throw new Error(`could not delete expired applicants: ${error.message}`)
  }

  if ((staleIdentify ?? 0) > 0) {
    const { error } = await db.from('identify_attempts').delete().lt('at', cutoffIso)
    if (error) throw new Error(`could not delete expired identify_attempts: ${error.message}`)
  }

  return report
}
