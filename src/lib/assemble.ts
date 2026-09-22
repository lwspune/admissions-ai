import { SUBJECTS, DIFFICULTIES, PAPER_MIX, type Subject, type Difficulty } from './types'

export interface PoolItem {
  id: string
  subject: Subject
  difficulty: Difficulty
}

export interface AssembleInput {
  pool: PoolItem[]
  /**
   * Items this lead has already seen on a previous issue. A strong preference,
   * not a hard rule: see assemblePaper.
   */
  excludeItemIds?: readonly string[]
  /** Injectable for deterministic tests; production passes nothing. */
  rng?: () => number
}

/**
 * Thrown when a (subject, difficulty) stratum cannot fill its quota.
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
  ) {
    super(
      `Cannot draw a paper: ${subject}/${difficulty} needs ${needed} live item(s) but only ` +
        `${available} are available. Author more items or widen the exclusions.`,
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
 * Draws one frozen paper: 3 easy + 1 moderate + 1 difficult per subject,
 * interleaved into mixed order.
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
  const { pool, excludeItemIds = [], rng = Math.random } = input
  const excluded = new Set(excludeItemIds)

  const picked: PoolItem[] = []
  for (const subject of SUBJECTS) {
    for (const difficulty of DIFFICULTIES) {
      const needed = PAPER_MIX[difficulty]
      const stratum = pool.filter(
        (item) => item.subject === subject && item.difficulty === difficulty,
      )

      if (stratum.length < needed) {
        throw new StratumExhaustedError(subject, difficulty, needed, stratum.length)
      }

      const unseen = shuffle(stratum.filter((item) => !excluded.has(item.id)), rng)
      const seen = shuffle(stratum.filter((item) => excluded.has(item.id)), rng)
      picked.push(...[...unseen, ...seen].slice(0, needed))
    }
  }

  // Interleave. Drawing subject-by-subject would otherwise present three blocks,
  // which is the sectioned paper we decided against.
  return shuffle(picked, rng)
}
