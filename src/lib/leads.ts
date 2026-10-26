// Lead rules. Pure, so the decisions an import makes about a stranger's
// spreadsheet — what counts as the same family, what a status word means,
// which rows are dropped and why — test without a database.
//
// The database re-checks every value that reaches it (migration 0012): the
// stage and interest CHECKs, the mobile pattern, the note length. This file
// decides; the constraints refuse.

import { normalizeMobile } from './mobile'

/**
 * Mirrors the CHECK on leads.stage, in the order of the board's columns: the
 * owner's pipeline (2026-10-26). Qualified was folded into In EIS (0026).
 */
export const STAGES = ['new', 'cnr', 'contacted', 'in_eis', 'not_interested'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'New',
  cnr: 'CNR',
  contacted: 'Contacted',
  in_eis: 'In EIS',
  not_interested: 'Not interested',
}

/** A stage's name on the pipeline bar. */
export const COLUMN_TITLE: Record<Stage, string> = { ...STAGE_LABEL, new: 'New leads' }

/**
 * The one-click move on a lead's row: the owner's usual next step (2026-10-26).
 * CNR and Not interested, and moving back, are in the row's menu instead.
 */
export const NEXT_STAGE: Record<Stage, Stage | null> = {
  new: 'contacted',
  cnr: 'contacted',
  contacted: 'in_eis',
  in_eis: null,
  not_interested: null,
}

export type Tone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger'

/** The colour of a stage's badge, by meaning; the classes live with the Badge. */
export const STAGE_TONE: Record<Stage, Tone> = {
  new: 'neutral',
  cnr: 'warning',
  contacted: 'info',
  in_eis: 'success',
  not_interested: 'danger',
}

/** Mirrors the CHECK on leads.interest. */
export const INTERESTS = ['NDA', 'SPI'] as const
export type Interest = (typeof INTERESTS)[number]

/** Mirrors the CHECK on lead_comments.body. */
export const MAX_NOTE = 2000

export function isStage(value: unknown): value is Stage {
  return STAGES.includes(value as Stage)
}

export function isInterest(value: unknown): value is Interest {
  return INTERESTS.includes(value as Interest)
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')
const key = (s: string) => squash(s).toLowerCase()

// Exact matches only. "not connected" contains "connected", so a substring
// test would file every unanswered call as a conversation.
const STATUS_WORDS: Record<string, Stage> = {
  connected: 'contacted',
  contacted: 'contacted',
  'not connected': 'cnr',
  cnr: 'cnr',
  'call not received': 'cnr',
  'not received': 'cnr',
  'switched off': 'cnr',
  'not reachable': 'cnr',
  'no answer': 'cnr',
  'not interested': 'not_interested',
  // The stage it became (2026-10-26); a sheet exported before then still says it.
  qualified: 'in_eis',
  ...Object.fromEntries(STAGES.map((s) => [STAGE_LABEL[s].toLowerCase(), s])),
}

/** A source's status word as a stage, or null when it is blank or unknown. */
export function stageFromStatus(raw: string): Stage | null {
  return STATUS_WORDS[key(raw)] ?? null
}

export function parseInterest(raw: string): Interest | null {
  const value = squash(raw).toUpperCase()
  return isInterest(value) ? value : null
}

/**
 * A date as a source wrote it, to ISO. Day first — these are Indian sheets,
 * and "03/01/25" there is the 3rd of January. A date that does not exist is
 * null rather than rolled into the next month.
 */
export function parseSourceDate(raw: string): string | null {
  const text = raw.trim()
  let y: number, m: number, d: number

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text)
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (dmy) {
    ;[d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])]
    if (dmy[3]!.length === 2) y += 2000
  } else {
    return null
  }

  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

export const IMPORT_FIELDS = ['name', 'mobile', 'status', 'interest', 'remark', 'date'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: 'Name',
  mobile: 'Mobile',
  status: 'Status',
  interest: 'Interest (NDA / SPI)',
  remark: 'Remark',
  date: 'Date',
}

/** Which header in the file holds each field. Header text, not position, so it survives a reordered export. */
export type ColumnMap = Partial<Record<ImportField, string>>

const HEADER_PATTERNS: [ImportField, RegExp][] = [
  ['mobile', /mobile|contact|phone|whatsapp|number/],
  ['name', /name/],
  ['status', /status/],
  ['interest', /choice|interest|course/],
  ['remark', /remark|comment|note/],
  ['date', /date/],
]

export function guessColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<string>()
  for (const [field, pattern] of HEADER_PATTERNS) {
    const header = headers.find((h) => !used.has(h) && pattern.test(key(h)))
    if (header !== undefined) {
      map[field] = header
      used.add(header)
    }
  }
  return map
}

/** One lead as the import will write it. Rows sharing a number are already merged. */
export interface ImportRow {
  mobile: string
  name: string | null
  stage: Stage | null
  interest: Interest | null
  sourceDate: string | null
  notes: string[]
  /** Spreadsheet rows (header = 1) this lead came from. */
  sheetRows: number[]
}

export interface SkippedRow {
  sheetRow: number
  name: string
  mobile: string
  reason: 'no_mobile' | 'invalid_mobile'
}

export interface PreparedImport {
  rows: ImportRow[]
  skipped: SkippedRow[]
}

export class ImportMapError extends Error {}

/**
 * Turns parsed CSV records into leads.
 *
 * One number is one lead (the user's rule, 2026-09-28), so rows repeating a
 * number merge here: first non-blank name, interest and date win, the furthest
 * stage wins, and every remark is kept in sheet order. Whatever the source
 * said that has no column here — an unknown status, an interest that is not
 * NDA or SPI — rides along in the note rather than being dropped.
 */
export function prepareImport(records: string[][], map: ColumnMap): PreparedImport {
  if (records.length === 0) throw new ImportMapError('The file is empty.')
  const headers = records[0]!
  if (!map.mobile) throw new ImportMapError('Choose the column that holds the mobile number.')

  const index: Partial<Record<ImportField, number>> = {}
  for (const field of IMPORT_FIELDS) {
    const header = map[field]
    if (header === undefined) continue
    const at = headers.indexOf(header)
    if (at === -1) throw new ImportMapError(`The file has no column called "${header}".`)
    index[field] = at
  }

  const byMobile = new Map<string, ImportRow>()
  const skipped: SkippedRow[] = []

  records.slice(1).forEach((record, i) => {
    const sheetRow = i + 2
    if (record.every((cell) => cell.trim() === '')) return

    const cell = (field: ImportField) => {
      const at = index[field]
      return at === undefined ? '' : (record[at] ?? '')
    }

    const name = squash(cell('name'))
    const rawMobile = cell('mobile').trim()
    if (!rawMobile) {
      skipped.push({ sheetRow, name, mobile: '', reason: 'no_mobile' })
      return
    }
    const mobile = normalizeMobile(rawMobile)
    if (!mobile) {
      skipped.push({ sheetRow, name, mobile: rawMobile, reason: 'invalid_mobile' })
      return
    }

    const rawStatus = squash(cell('status'))
    const rawInterest = squash(cell('interest'))
    const stage = stageFromStatus(rawStatus)
    const interest = parseInterest(rawInterest)

    const parts = [squash(cell('remark'))]
    if (rawStatus && !stage) parts.push(`Status in source: ${rawStatus}`)
    if (rawInterest && !interest) parts.push(`Choice in source: ${rawInterest}`)
    const note = parts.filter(Boolean).join(' · ').slice(0, MAX_NOTE)

    const row: ImportRow = {
      mobile,
      name: name || null,
      stage,
      interest,
      sourceDate: parseSourceDate(cell('date')),
      notes: note ? [note] : [],
      sheetRows: [sheetRow],
    }

    const seen = byMobile.get(mobile)
    if (!seen) {
      byMobile.set(mobile, row)
      return
    }
    seen.name ??= row.name
    seen.interest ??= row.interest
    seen.sourceDate ??= row.sourceDate
    if (row.stage && (!seen.stage || STAGES.indexOf(row.stage) > STAGES.indexOf(seen.stage))) {
      seen.stage = row.stage
    }
    seen.notes.push(...row.notes)
    seen.sheetRows.push(sheetRow)
  })

  return { rows: [...byMobile.values()], skipped }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Rows a page of one stage shows. */
export const PAGE_SIZE = 50

/**
 * The pipeline's state (2026-10-26): the stage the bar shows, its page, and
 * the filters, which narrow every stage and so every count on the bar.
 */
export interface LeadFilters {
  q: string
  interest: Interest | null
  /** A lead_sources id. */
  source: string | null
  /** 'me', 'none' (unassigned), or a telecaller's id. */
  assignee: string | null
  stage: Stage
  /** 1-based. */
  page: number
}

type Params = Record<string, string | string[] | undefined>

/**
 * The pipeline's state, read from the URL. Anything unrecognised is dropped
 * here, so no raw query-string text reaches a database filter.
 */
export function parseLeadFilters(params: Params): LeadFilters {
  const one = (k: string) => {
    const v = params[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const assignee = one('assignee')
  const page = Number.parseInt(one('page'), 10)

  return {
    q: one('q').trim(),
    interest: isInterest(one('interest')) ? (one('interest') as Interest) : null,
    source: isUuid(one('source')) ? one('source') : null,
    assignee: assignee === 'me' || assignee === 'none' || isUuid(assignee) ? assignee : null,
    stage: isStage(one('stage')) ? (one('stage') as Stage) : 'new',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  }
}

/**
 * The pipeline's address: what `parseLeadFilters` reads back. `stage` is a
 * click on the bar, which starts that stage at page one; `page` turns the
 * page within the stage shown.
 */
export function leadsHref(filters: LeadFilters, { stage, page }: { stage?: Stage; page?: number } = {}): string {
  const shown = stage ?? filters.stage
  const at = stage ? 1 : (page ?? filters.page)

  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.interest) params.set('interest', filters.interest)
  if (filters.source) params.set('source', filters.source)
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (shown !== 'new') params.set('stage', shown)
  if (at > 1) params.set('page', String(at))
  const query = params.toString()
  return query ? `/leads?${query}` : '/leads'
}

/**
 * The score sheet, opened from a list row, carrying that list's filters so
 * its back link returns to the same list rather than to the lead.
 */
export function summaryHref(leadId: string, filters: LeadFilters): string {
  const query = leadsHref(filters).split('?')[1]
  const base = `/reports/${leadId}/summary`
  return query ? `${base}?back=${encodeURIComponent(query)}` : base
}

/**
 * Where the score sheet's back link goes. `back` is read as list filters, never
 * as an address, so whatever the URL says the link can only lead to the list.
 */
export function summaryBackHref(back: string | null | undefined): string {
  return leadsHref(parseLeadFilters(Object.fromEntries(new URLSearchParams(back ?? ''))))
}

/**
 * What the search box searches. Digits search the number, anything else the
 * name. LIKE's own wildcards are escaped, so "50%" finds "50%", not everything.
 */
export function searchTerm(q: string): { column: 'contact_mobile' | 'name'; pattern: string } | null {
  const text = q.trim()
  if (!text) return null
  if (/^[\d\s+-]+$/.test(text)) {
    return { column: 'contact_mobile', pattern: `%${text.replace(/\D/g, '')}%` }
  }
  return { column: 'name', pattern: `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` }
}

export const TEST_STATE_LABEL: Record<string, string> = {
  issued: 'Link sent',
  opened: 'Link opened',
  started: 'In progress',
  submitted: 'Completed',
  expired: 'Expired',
  voided: 'Replaced',
}

const LIVE_STATES = ['issued', 'opened', 'started']

/** One line on where a lead's test stands. */
export function testStatus(assessments: { state: string; issue_seq: number; mode?: string }[]): string {
  if (assessments.length === 0) return 'No test'
  if (assessments.some((a) => a.state === 'submitted')) return 'Test completed'
  const latest = [...assessments].sort((a, b) => b.issue_seq - a.issue_seq)[0]!
  const current = assessments.find((a) => LIVE_STATES.includes(a.state)) ?? latest
  // A paper test is never sent, so "Link sent" would be wrong (2026-10-16).
  const label =
    current.mode === 'paper' && current.state === 'issued'
      ? 'Paper test issued'
      : (TEST_STATE_LABEL[current.state] ?? current.state)
  return `${label} · issue ${current.issue_seq} of 3`
}

export type TestAction = 'issue' | 'reissue' | 'report' | null

/**
 * The one test button a lead's row offers. The database enforces the same
 * rules (`issue_assessment`); this only decides what is worth showing.
 */
export function testAction(assessments: { state: string; issue_seq: number }[]): TestAction {
  if (assessments.some((a) => a.state === 'submitted')) return 'report'
  if (assessments.length === 0) return 'issue'
  return Math.max(...assessments.map((a) => a.issue_seq)) < 3 ? 'reissue' : null
}

/**
 * The database writes a stage change as "old → new" in stage codes (the
 * `leads_stage_history` trigger), so the labels live in one place — here.
 */
export function formatStageChange(body: string): string {
  const [from, to] = body.split(' → ')
  if (isStage(from) && isStage(to)) return `Stage: ${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}`
  return `Stage: ${body}`
}
