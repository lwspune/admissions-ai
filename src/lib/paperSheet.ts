import type { Format } from './types'

/** Everything an answer sheet is drawn from. It crosses to the browser, where the PDF is made. */
export interface AnswerSheet {
  paperNo: number
  name: string
  classLevel: number
  issuedAt: string
  /** Each question's format, in position order. */
  formats: Format[]
}

/**
 * What a paper test's OMR sheet may know: who it is for, which paper, and
 * which positions take a number instead of A–D.
 *
 * An ALLOW-LIST, like `toCandidatePaper`. The sheet is generated client-side,
 * so anything returned here reaches the browser; a column added to
 * `test_items` later must not start travelling because this copied a row.
 */
export function toAnswerSheet({
  assessment,
  lead,
  paper,
}: {
  assessment: { paper_no: number | null; issued_at: string }
  lead: { name: string; class_level: number }
  paper: { position: number; item: { format: Format } }[]
}): AnswerSheet {
  if (assessment.paper_no == null) throw new Error('an answer sheet is for a paper test, and this is not one')
  return {
    paperNo: assessment.paper_no,
    name: lead.name,
    classLevel: lead.class_level,
    issuedAt: assessment.issued_at,
    formats: [...paper].sort((a, b) => a.position - b.position).map((r) => r.item.format),
  }
}
