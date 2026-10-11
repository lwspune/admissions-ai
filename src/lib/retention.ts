// Data retention. Pure, so the rule that decides what gets deleted can be
// tested without a database — and so it can be read in one place by anyone
// checking the app against what the parent consents to.

/**
 * What the parent is told: "kept for 12 months". Consent is taken on the
 * recorded call; until 2026-10-11 a consent screen on the test link said so too.
 *
 * Changing this number changes a promise already made to people who have
 * agreed to it. The call's consent script must move with it.
 */
export const RETENTION_MONTHS = 12

/**
 * The date before which records are no longer kept.
 *
 * Calendar months, not 365 days, because that is what the consent says. The
 * day is clamped to the end of a shorter target month rather than allowed to
 * overflow forward: `setMonth` on the 31st of a short month lands in the NEXT
 * month, which pushes the cutoff later and purges records before the promised
 * period has actually elapsed. Erring earlier keeps the promise.
 */
export function retentionCutoff(now: Date, months: number = RETENTION_MONTHS): Date {
  const cutoff = new Date(now.getTime())
  const day = cutoff.getUTCDate()

  // Move to the 1st first, so changing the month cannot overflow on its own.
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)

  const daysInTargetMonth = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate()
  cutoff.setUTCDate(Math.min(day, daysInTargetMonth))

  return cutoff
}

/**
 * When a candidate last had anything to do with us.
 *
 * Anchoring on the lead row alone is wrong: a lead entered thirteen months ago
 * and reissued a test last week is active, and deleting them would destroy a
 * live candidate's record mid-funnel.
 */
export function lastActivity(leadCreatedAt: string, assessmentCreatedAt: readonly string[]): Date {
  const times = [Date.parse(leadCreatedAt), ...assessmentCreatedAt.map((a) => Date.parse(a))]
  return new Date(Math.max(...times.filter((t) => Number.isFinite(t))))
}

/**
 * Whether a record has passed the retention period.
 *
 * The boundary is inclusive-of-keeping: a record dated exactly on the cutoff
 * survives. Deleting it would take the data a fraction before the promised
 * period was up, and nothing is gained by being a day early.
 */
export function isExpired(lastActivityAt: Date, cutoff: Date): boolean {
  return lastActivityAt.getTime() < cutoff.getTime()
}
