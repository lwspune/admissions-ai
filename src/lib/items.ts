// Item-bank seeding rules. Pure, so the one decision that can take the bank
// offline is testable without a database.

/** Mirrors the CHECK on test_items.status (migration 0001). */
export type ItemStatus = 'review' | 'live' | 'retired'

/**
 * What status a seeded row should carry.
 *
 * The rule is one-directional: **seeding never demotes.** An upsert re-writes
 * every column it supplies, so a plain re-seed that names `status` will quietly
 * pull live items out of circulation — and nothing surfaces that, because the
 * failure appears later as "could not fill a paper" in front of staff.
 * Promotion is the answer-key sign-off and must be an explicit act.
 */
export function resolveSeedStatus(opts: {
  /** The status already in the database, or null when the row is new. */
  current: ItemStatus | null
  /** True only when the operator asked to promote, and this item is in scope. */
  promote: boolean
}): ItemStatus {
  if (opts.promote) return 'live'
  return opts.current ?? 'review'
}

/**
 * Whether an item file is covered by a promotion.
 *
 * `--live` on its own promotes the whole bank, which was safe when the bank was
 * one batch and is not safe now: it would sign off items nobody has reviewed.
 * `--live --file <batch>` scopes the promotion to the batch under review.
 */
export function inPromotionScope(file: string, only: string | undefined): boolean {
  if (!only) return true
  const strip = (s: string) => s.replace(/\.json$/i, '')
  return strip(file) === strip(only)
}
