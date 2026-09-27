// Item-bank rules. Pure, so the one decision that can take the bank offline is
// testable without a database, and so the bank browser's shape is too.

import { SUBJECTS, DIFFICULTIES, PAPER_MIX, type Subject, type Difficulty } from './types'
import { CLASSES, isDrawableFor, type ClassLevel } from './classes'

/** Mirrors the CHECK on test_items.status (migration 0001). */
export type ItemStatus = 'review' | 'live' | 'retired'

export interface BankGroup<T> {
  subject: Subject
  difficulty: Difficulty
  items: T[]
}

/**
 * Arranges the bank into the nine subject-difficulty buckets a paper is drawn
 * from, in the order a reader expects them.
 *
 * Empty groups are kept. "science / difficult: 0" is the single most useful
 * thing this page can tell whoever is deciding what to author next, and a
 * bucket that disappears when empty tells them nothing. Items with no ref sort
 * last rather than being dropped — an unreferenced row is a data problem worth
 * seeing, not hiding.
 */
export function groupBank<T extends { ref?: string | null; subject: Subject; difficulty: Difficulty }>(
  items: readonly T[],
): BankGroup<T>[] {
  const groups: BankGroup<T>[] = []
  for (const subject of SUBJECTS) {
    for (const difficulty of DIFFICULTIES) {
      const inGroup = items
        .filter((i) => i.subject === subject && i.difficulty === difficulty)
        .sort((a, b) => {
          if (!a.ref && !b.ref) return 0
          if (!a.ref) return 1
          if (!b.ref) return -1
          return a.ref.localeCompare(b.ref)
        })
      groups.push({ subject, difficulty, items: inGroup })
    }
  }
  return groups
}

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

/** One class × subject × difficulty cell of the coverage table. */
export interface CoverageCell {
  classLevel: ClassLevel
  subject: Subject
  difficulty: Difficulty
  /** Items this class may be shown in this stratum. */
  count: number
  /** What one paper draws from it (PAPER_MIX). */
  needed: number
  /**
   * `short`: a paper cannot be filled — issuing fails for this class.
   * `thin`: it can, but with fewer than twice the need, so every paper for
   * this class shows much the same items. `ok`: neither.
   */
  status: 'short' | 'thin' | 'ok'
}

/**
 * How well the bank serves each class.
 *
 * Filtering the draw by class splits every stratum, and the class that loses
 * is the one whose candidate sees a 500 in front of staff. The lint reads this
 * to refuse a bank that strands a class; the bank page reads it to say what to
 * author next. Both have to agree, so the rule lives here once.
 *
 * "Thin" exists because of the 2026-09-23 exposure finding: a stratum holding
 * exactly what a paper needs puts the same items on every paper, and a healthy
 * bank total hides it. Exposure is a per-stratum property, and now a per-class
 * one too.
 */
export function coverageByClass<T extends { subject: Subject; difficulty: Difficulty; taught_in: number }>(
  items: readonly T[],
): CoverageCell[] {
  const cells: CoverageCell[] = []
  for (const classLevel of CLASSES) {
    for (const subject of SUBJECTS) {
      for (const difficulty of DIFFICULTIES) {
        const needed = PAPER_MIX[difficulty]
        const count = items.filter(
          (i) => i.subject === subject && i.difficulty === difficulty && isDrawableFor(i.taught_in, classLevel),
        ).length
        const status = count < needed ? 'short' : count < needed * 2 ? 'thin' : 'ok'
        cells.push({ classLevel, subject, difficulty, count, needed, status })
      }
    }
  }
  return cells
}
