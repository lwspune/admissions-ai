// Deciding, frame by frame, when a sheet under the lens has actually been read.
//
// Ported from nda-tracker (src/lib/omr/liveCapture.js, 2026-09). A pure
// reducer, so the rule is testable without a camera. It refuses to:
//   • file a sheet off ONE frame — a hand or a band of glare can change an
//     answer without changing anything a person would notice, so two
//     consecutive frames must agree exactly;
//   • file the same sheet again while it sits under the lens;
//   • file anything still needing a human — that goes to the review list.
// Identity here is the printed paper number, so "the same student twice"
// became "the same paper twice".

export interface LiveRead {
  ok: boolean
  reason?: string
  complete?: boolean
  reviewCount?: number
  paperNo?: number
  /** Position -> letter, number, or null for blank. */
  answers?: Record<number, string | number | null>
}

export interface LiveState {
  pending: string | null
  agree: number
  gone: number
  held: string | null
  accepted: number[]
}

export type LivePhase = 'hunting' | 'holding' | 'accepted' | 'done' | 'review' | 'duplicate'

/** Two reads of the same filled sheet give the same string; anything else differs. */
export function sheetSignature(result: LiveRead | null | undefined): string | null {
  if (!result?.ok) return null
  const answers = Object.keys(result.answers ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map((q) => `${q}:${result.answers![Number(q)] ?? '-'}`)
    .join(',')
  return `${result.paperNo ?? '-'}|${answers}`
}

export const liveInitial = (): LiveState => ({ pending: null, agree: 0, gone: 0, held: null, accepted: [] })

export function liveStep<R extends LiveRead>(
  state: LiveState | null,
  result: R,
  { minAgree = 2, clearFrames = 3 }: { minAgree?: number; clearFrames?: number } = {},
): { state: LiveState; accept: R | null; phase: LivePhase; message: string } {
  const s = state ?? liveInitial()

  // Nothing readable. One dropped frame is not the sheet going away.
  if (!result?.ok) {
    const gone = s.gone + 1
    const cleared = gone >= clearFrames
    return {
      state: {
        ...s,
        gone,
        pending: cleared ? null : s.pending,
        agree: cleared ? 0 : s.agree,
        held: cleared ? null : s.held,
      },
      accept: null,
      phase: 'hunting',
      message: result?.reason || 'Point the camera at a sheet.',
    }
  }

  const signature = sheetSignature(result)
  if (s.held && s.held === signature) {
    return { state: { ...s, gone: 0 }, accept: null, phase: 'done', message: 'Read — take the next sheet.' }
  }

  // Read, but not decided: offered for review, never filed.
  if (!result.complete) {
    const n = result.reviewCount ?? 0
    return {
      state: { ...s, gone: 0, pending: null, agree: 0 },
      accept: null,
      phase: 'review',
      message: `${n} question${n === 1 ? '' : 's'} to check`,
    }
  }

  if (result.paperNo != null && s.accepted.includes(result.paperNo)) {
    return {
      state: { ...s, gone: 0, pending: null, agree: 0 },
      accept: null,
      phase: 'duplicate',
      message: 'That paper is already read — is this the same sheet?',
    }
  }

  const agree = s.pending === signature ? s.agree + 1 : 1
  if (agree < minAgree) {
    return { state: { ...s, gone: 0, pending: signature, agree }, accept: null, phase: 'holding', message: 'Hold still…' }
  }
  return {
    state: {
      ...s,
      gone: 0,
      pending: null,
      agree: 0,
      held: signature,
      accepted: result.paperNo != null ? [...s.accepted, result.paperNo] : s.accepted,
    },
    accept: result,
    phase: 'accepted',
    message: 'Got it.',
  }
}
