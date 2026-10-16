import { SHAPE_15, SHAPE_30, type Subject, type Difficulty, type Part, type PaperShape, type Format } from './types'
import type { ClassLevel } from './classes'

export interface PoolItem {
  id: string
  subject: Subject
  difficulty: Difficulty
  part: Part
  /** From `live_pool()` since migration 0018; a paper test's draw needs it. */
  format?: Format
}

export interface AssembleInput {
  pool: PoolItem[]
  /** Which paper to draw. The 15-question paper when not given. */
  shape?: PaperShape
  /**
   * Items this lead has already seen on a previous issue. A strong preference,
   * not a hard rule: see assemblePaper.
   */
  excludeItemIds?: readonly string[]
  /** Injectable for deterministic tests; production passes nothing. */
  rng?: () => number
  /**
   * The class the pool was filtered for, when it was. Used only to name the
   * class in a failure: the filtering itself happens in `live_pool()`, so a
   * starved stratum here is starved *for this class*, and an error that says
   * "english/difficult has 0" sends the reader to a bank total that looks fine.
   */
  forClass?: ClassLevel
}

/**
 * Thrown when a (subject, part, difficulty) stratum cannot fill its quota.
 *
 * This fails loudly on purpose. Silently returning a short paper would produce
 * scores out of 13 that look like scores out of 15, and nobody would notice
 * until the bank had been quietly wrong for weeks.
 */
export class StratumExhaustedError extends Error {
  constructor(
    readonly subject: Subject,
    readonly difficulty: Difficulty,
    readonly needed: number,
    readonly available: number,
    readonly forClass?: ClassLevel,
    readonly part: Part = 'basics',
  ) {
    super(
      `Cannot draw a paper${forClass ? ` for a class ${forClass} admit` : ''}: ${subject}/${difficulty}${part === 'syllabus' ? ' (syllabus)' : ''} ` +
        `needs ${needed} live item(s) but only ${available} are available` +
        `${forClass ? ` at or below class ${forClass - 1} content` : ''}. ` +
        'Author more items or widen the exclusions.',
    )
    this.name = 'StratumExhaustedError'
  }
}

/** Fisher-Yates over a copy. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Draws one frozen paper to the given shape — per subject and part, so many
 * easy, moderate and difficult — interleaved into mixed order.
 *
 * Selection is plain uniform random. With 100 items per subject and 5 drawn,
 * overlap between two candidates is already negligible, so exposure-weighted
 * selection would add machinery for no measurable gain (spec §12).
 *
 * `excludeItemIds` is a strong preference rather than a hard rule. Unseen items
 * are always taken first, and a stratum only falls back to already-seen ones
 * when it cannot otherwise be filled. A hard rule reads better but fails in the
 * wrong direction: a lead on their third issue, or a bank thinned by
 * retirements, would make reissue impossible and put a 500 in front of staff.
 * A reissue that repeats a question or two beats no reissue at all.
 *
 * It still throws when the stratum cannot be filled even WITH repeats, because
 * a short paper scored out of 15 is worse than a visible failure.
 */
export function assemblePaper(input: AssembleInput): PoolItem[] {
  const { pool, shape = SHAPE_15, excludeItemIds = [], rng = Math.random, forClass } = input
  const excluded = new Set(excludeItemIds)

  const picked: PoolItem[] = []
  for (const { subject, part, difficulty, count: needed } of shape.quotas) {
    const stratum = stratumOf(pool, subject, part, difficulty)

    if (stratum.length < needed) {
      throw new StratumExhaustedError(subject, difficulty, needed, stratum.length, forClass, part)
    }

    const unseen = shuffle(stratum.filter((item) => !excluded.has(item.id)), rng)
    const seen = shuffle(stratum.filter((item) => excluded.has(item.id)), rng)
    picked.push(...[...unseen, ...seen].slice(0, needed))
  }

  // Interleave. Drawing subject-by-subject would otherwise present blocks,
  // which is the sectioned paper we decided against — for parts as well as
  // subjects (2026-10-06: every question labelled, all mixed).
  return shuffle(picked, rng)
}

/**
 * A paper test's draw (2026-10-16): the same draw, repeated until its numeric
 * questions fit the OMR sheet's fixed boxes. Across 20,000 simulated class 12
 * draws one in about 1,300 came to more than 12 and none to more than 15, so
 * with 18 boxes this almost never draws twice; the cap exists so the rare
 * paper that would not fit is never issued. `issue_assessment` checks it too.
 */
export function assembleForAnswerSheet(input: AssembleInput & { maxNumeric: number; tries?: number }): PoolItem[] {
  const { maxNumeric, tries = 200, ...draw } = input
  if (draw.pool.some((item) => item.format === undefined)) {
    throw new Error('the pool does not give each item’s format, so the numeric questions cannot be counted')
  }
  for (let n = 0; n < tries; n++) {
    const paper = assemblePaper(draw)
    if (paper.filter((item) => item.format === 'numeric').length <= maxNumeric) return paper
  }
  throw new Error(`no paper with at most ${maxNumeric} numeric questions in ${tries} draws`)
}

/**
 * The paper a class gets: 30 questions once every quota of the longer paper
 * can be filled from its pool, otherwise the 15-question paper. A class's
 * syllabus items go live as one signed-off batch, so this flips once per
 * class rather than paper by paper.
 */
export function choosePaperShape(pool: readonly PoolItem[]): PaperShape {
  const fits = SHAPE_30.quotas.every(
    ({ subject, part, difficulty, count }) => stratumOf(pool, subject, part, difficulty).length >= count,
  )
  return fits ? SHAPE_30 : SHAPE_15
}

function stratumOf(pool: readonly PoolItem[], subject: Subject, part: Part, difficulty: Difficulty): PoolItem[] {
  return pool.filter((item) => item.subject === subject && item.part === part && item.difficulty === difficulty)
}
