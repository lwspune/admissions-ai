// Class rules. Pure, because the one rule connecting a candidate to the items
// they may be shown has to be testable without a database and stated in
// exactly one place — here, and mirrored in `issue_assessment` (migration 0011).

/** The classes the institute admits to. Mirrors the CHECK on leads.class_level. */
export type ClassLevel = 8 | 9 | 10 | 11 | 12
export const CLASSES: readonly ClassLevel[] = [8, 9, 10, 11, 12] as const

/**
 * The range an item's `taught_in` may take. Mirrors the CHECK on
 * test_items.taught_in.
 *
 * The floor is the class by which everything a reasoning test relies on has
 * been met, and it is also what an untagged item carries: an item at the floor
 * is drawable for every admit, so a bank that nobody has tagged yet behaves
 * exactly as it did before classes existed. The ceiling is one below the
 * highest admitted class, because content taught in class 12 can never be
 * fair to anyone this test is issued to.
 */
export const TAUGHT_IN_MIN = 6
export const TAUGHT_IN_MAX = 11

/**
 * Reads a class off a form field or a database row. Anything that is not one
 * of the five admitted classes is null: "9th" and "IX" are what the old free
 * text column held, and a filter cannot act on a guess.
 */
export function parseClassLevel(raw: unknown): ClassLevel | null {
  const text = String(raw ?? '').trim()
  if (!/^\d{1,2}$/.test(text)) return null
  const n = Number(text)
  return (CLASSES as readonly number[]).includes(n) ? (n as ClassLevel) : null
}

/**
 * The highest class whose content an admit may be tested on.
 *
 * An admit to class N has finished class N−1 and, in the admission season, is
 * in nobody's class yet. Testing on N−1 is fair whether they sit the paper in
 * April or in November.
 */
export function contentCeiling(admittingTo: ClassLevel): number {
  return admittingTo - 1
}

/** Whether an item tagged `taughtIn` may appear on a paper for this admit. */
export function isDrawableFor(taughtIn: number, admittingTo: ClassLevel): boolean {
  return taughtIn <= contentCeiling(admittingTo)
}

/**
 * Whether a syllabus item may appear on a paper for this admit (2026-10-06).
 *
 * Syllabus questions are class N−1's own content, so exactly that class — not
 * "up to", which is the basics rule — and only first-term chapters, because a
 * candidate tested in October is still partway through class N−1. Mirrored in
 * `live_pool()`.
 */
export function isSyllabusFor(taughtIn: number, term: number | null, admittingTo: ClassLevel): boolean {
  return taughtIn === contentCeiling(admittingTo) && term === 1
}
