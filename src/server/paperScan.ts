import 'server-only'
import type { Db } from './supabase'
import type { Role } from './auth'
import { validateScanAnswers, type ScanAnswer } from '../lib/scanResult'
import type { Format } from '../lib/types'

/** What the scanner may know about a paper, found by the number printed on its sheet. */
export interface ScanPaper {
  assessmentId: string
  leadId: string
  name: string
  classLevel: number
  paperNo: number
  /** 'issued' is the only state a sheet can be filed against. */
  state: string
  expiresAt: string
  /** Each question's format, in position order — what the reader lays the sheet out from. */
  formats: Format[]
}

export interface ScanResult {
  attemptId: string
  score: number
  correct: number
  incorrect: number
  skipped: number
}

const BUCKET = 'omr-sheets'

/** Where a paper test's sheet photo is stored; the database expects exactly this name. */
export const sheetPhotoPath = (assessmentId: string) => `${assessmentId}.jpg`

const canScan = (role: Role) => role === 'counsellor' || role === 'superadmin'

/**
 * A paper by its printed number, for the scanner. Formats and who it is for,
 * and nothing that identifies a question — the browser lays the sheet out from
 * this. Null for a telecaller, for a number no paper carries, and for a paper
 * RLS hides.
 */
export async function lookupPaperForScan(db: Db, paperNo: number, role: Role): Promise<ScanPaper | null> {
  if (!canScan(role) || !Number.isInteger(paperNo)) return null
  const { data, error } = await db
    .from('assessments')
    .select('id, lead_id, paper_no, state, expires_at, class_level, leads(name), assessment_items(position, test_items(format))')
    .eq('mode', 'paper')
    .eq('paper_no', paperNo)
    .maybeSingle()
  if (error) throw new Error(`could not look up paper ${paperNo}: ${error.message}`)
  if (!data) return null

  const items = (data.assessment_items as never as { position: number; test_items: { format: Format } }[]) ?? []
  return {
    assessmentId: data.id as string,
    leadId: data.lead_id as string,
    name: (data.leads as never as { name: string }).name,
    classLevel: data.class_level as number,
    paperNo: data.paper_no as number,
    state: data.state as string,
    expiresAt: data.expires_at as string,
    formats: [...items].sort((a, b) => a.position - b.position).map((i) => i.test_items.format),
  }
}

/**
 * Files a scanned sheet. The answers are checked here before anything is sent,
 * and again by `record_paper_scan`, which also refuses anyone but a counsellor
 * or superadmin, a second scan, a closed window and a missing photo — and
 * computes the score itself.
 */
export async function recordPaperScan(
  db: Db,
  { assessmentId, answers }: { assessmentId: string; answers: ScanAnswer[] },
  role: Role,
): Promise<ScanResult> {
  if (!canScan(role)) throw new Error('Only a counsellor or superadmin can file a scanned sheet.')

  const { data: items, error: itemsError } = await db
    .from('assessment_items')
    .select('position, test_items(format)')
    .eq('assessment_id', assessmentId)
    .order('position')
  if (itemsError) throw new Error(`could not load the paper: ${itemsError.message}`)
  const formats = (items ?? []).map((i) => (i.test_items as never as { format: Format }).format)
  if (formats.length === 0) throw new Error('That paper test was not found.')

  const problem = validateScanAnswers(formats, answers)
  if (problem) throw new Error(`The scan does not fit this paper: ${problem}`)

  const { data, error } = await db.rpc('record_paper_scan', { p_assessment_id: assessmentId, p_answers: answers })
  if (error) throw new Error(error.message)
  const r = data as { attemptId: string; score: number; correct: number; incorrect: number; skipped: number }
  return { attemptId: r.attemptId, score: Number(r.score), correct: r.correct, incorrect: r.incorrect, skipped: r.skipped }
}

/** A short-lived link to a filed sheet's photo, for counsellors and superadmin. */
export async function sheetPhotoUrl(db: Db, assessmentId: string, role: Role): Promise<string | null> {
  if (!canScan(role)) return null
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(sheetPhotoPath(assessmentId), 600)
  if (error || !data) return null
  return data.signedUrl
}
