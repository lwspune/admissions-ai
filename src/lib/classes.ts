// Class rules. Pure, because the one rule connecting a candidate to the items
// they may be shown has to be testable without a database and stated in
// exactly one place — here, and mirrored in `issue_assessment` (migration 0011).

/**
 * Every class the database can hold an admit for. Mirrors the CHECK on
 * leads.class_level and assessments.class_level (migration 0032).
 */
export type ClassLevel = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export const ADMITTABLE: readonly ClassLevel[] = [5, 6, 7, 8, 9, 10, 11, 12] as const

/**
 * The classes the app offers: the lead form, imports, coverage and the parent
 * pack. A class joins this list only once its questions are live, because a
 * lead the bank cannot draw a paper for is a dead end at the moment of issue.
 * Classes 5–7 join one at a time (2026-11-15), so this is not ADMITTABLE.
 */
export const CLASSES: readonly ClassLevel[] = [7, 8, 9, 10, 11, 12] as const

/**
 * The range an item's `taught_in` may take, for basics and syllabus alike.
 * Mirrors the CHECKs on test_items (migration 0032).
 *
 * The floor is the content ceiling of the lowest admittable class (an admit to
 * class 5 is tested on class 4). The ceiling is one below the highest, because
 * content taught in class 12 can never be fair to anyone this test is issued
 * to. The database default for an untagged item stays 6, which was "open to
 * everyone" while the lowest class was 8; the lint requires a tag in every
 * file, so nothing reaches the default by accident.
 */
export const TAUGHT_IN_MIN = 4
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

/** Whether every class the app offers can draw an item tagged `taughtIn`. */
export function openToAll(taughtIn: number): boolean {
  return CLASSES.every((c) => isDrawableFor(taughtIn, c))
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
