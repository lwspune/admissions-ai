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

/**
 * A comparable identity for one MCQ option, or null when it is not a bare
 * quantity.
 *
 * Two options that read differently but mean the same number — 2/3 and 4/6 —
 * are a defect: they are eliminated together, and if one is the key the item
 * has two right answers. Comparing the strings cannot see it.
 *
 * Deliberately refuses anything containing words. "4% less" and "4% more" both
 * carry the number 4 and are a legitimate pair, so a looser parser would report
 * them and train the reader to ignore the check. A unit is part of the identity
 * for the same reason: 80 m is not 80 kg.
 */
export function parseOptionValue(raw: string): string | null {
  const text = raw.replace(/,/g, '').trim()

  const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    if (denominator === 0) return null
    return `${numerator / denominator}:`
  }

  // A number, optionally followed by a percent sign or a short unit.
  const quantity = /^(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]{1,3})?$/.exec(text)
  if (!quantity) return null
  return `${Number(quantity[1])}:${(quantity[2] ?? '').toLowerCase()}`
}
