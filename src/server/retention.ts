import 'server-only'
import type { Db } from './supabase'
import { retentionCutoff, lastActivity, isExpired } from '../lib/retention'

/** Supabase's cap on rows per request. */
const READ_PAGE = 1000
/** 100 uuids is about 3.7 KB of URL, near what leadImport's preview sends (200 numbers, ~2.6 KB). */
const DELETE_CHUNK = 100
const PHOTO_CHUNK = 100

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

export interface PurgeReport {
  cutoff: string
  dryRun: boolean
  leads: number
  identifyAttempts: number
  /** Scanned sheet photos removed from storage with their leads. */
  sheetPhotos: number
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
 * Teacher applicants (HIRING_TEST_SPEC.md) are not purged at all: the owner
 * keeps them so past applicants inform future hiring (2026-10-24). Only their
 * number checks go, in identify_attempts with everyone else's.
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
  // Read a page at a time: Supabase returns at most 1,000 rows per request,
  // whatever the query asks, and a day's import can exceed that (2026-10-26).
  const oldLeads: { id: string; created_at: string; assessments: unknown }[] = []
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await db
      .from('leads')
      .select('id, created_at, assessments(id, created_at, mode)')
      .lt('created_at', cutoffIso)
      .order('created_at')
      .order('id')
      .range(from, from + READ_PAGE - 1)
    if (error) throw new Error(`could not read leads for purge: ${error.message}`)
    oldLeads.push(...(data ?? []))
    if ((data ?? []).length < READ_PAGE) break
  }

  const expired = oldLeads.filter((lead) => {
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
    leadIds,
  }

  if (dryRun) return report

  for (const names of chunks(photos, PHOTO_CHUNK)) {
    // Removing a name that was never uploaded is not an error.
    const { error } = await db.storage.from('omr-sheets').remove(names)
    if (error) throw new Error(`could not delete expired sheet photos: ${error.message}`)
  }

  // An `in` filter rides in the URL, which PostgREST refuses past a few
  // kilobytes: a thousand ids was a 400. Cascades to assessments,
  // assessment_items, attempts, attempt_answers and attempt_events.
  for (const ids of chunks(leadIds, DELETE_CHUNK)) {
    const { error } = await db.from('leads').delete().in('id', ids)
    if (error) throw new Error(`could not delete expired leads: ${error.message}`)
  }

  if ((staleIdentify ?? 0) > 0) {
    const { error } = await db.from('identify_attempts').delete().lt('at', cutoffIso)
    if (error) throw new Error(`could not delete expired identify_attempts: ${error.message}`)
  }

  return report
}
