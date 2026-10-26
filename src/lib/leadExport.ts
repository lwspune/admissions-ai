// "Download for Excel" on /leads (2026-10-26), after GoPost's (its
// src/lib/leads/export.ts). Two choices, both for the stage and filters on
// screen: everything, or only the leads that reached the app since your last
// download of that stage. A download moves your point for the stage, but only
// after the file is built; if saving the point fails you still get the file,
// and the next "new" download repeats these leads. Counsellors and superadmin
// only: a file of every number walks out easily (the lead-theft note in
// BRAINSTORM.md), and `record_lead_download` (migration 0028) refuses anyone else.
//
// Free of Next and Supabase, so it tests directly; the route passes the reads.

import { STAGE_LABEL, COLUMN_TITLE, isStage, type Stage } from './leads'

export type ExportKind = 'all' | 'new'

/** One lead as the file shows it. */
export interface ExportRow {
  name: string | null
  mobile: string
  interest: string | null
  classLevel: number | null
  stage: Stage
  sources: string[]
  enquiredOn: string
  assignedTo: string
  test: string
}

// A cell starting with = + - @ would run as a formula in Excel; a leading ' keeps it text.
const cell = (v: string | number | null): string => {
  const raw = v === null ? '' : String(v)
  const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// "98765 43210": the space keeps Excel from turning a mobile into 9.88E+09.
const csvMobile = (m: string) => (/^\d{10}$/.test(m) ? `${m.slice(0, 5)} ${m.slice(5)}` : m)

/** The byte-order mark, built from its code so no editor turns an escape into an invisible character. */
export const BOM = String.fromCharCode(0xfeff)

/** UTF-8 with a BOM, so Excel shows Hindi names correctly. */
export function leadsCsv(rows: ExportRow[]): string {
  const lines = [['Name', 'Mobile', 'Interest', 'Admission class', 'Stage', 'Source', 'Enquired', 'Assigned to', 'Test'].join(',')]
  for (const r of rows) {
    lines.push(
      [
        cell(r.name),
        cell(csvMobile(r.mobile)),
        cell(r.interest),
        cell(r.classLevel),
        cell(STAGE_LABEL[r.stage]),
        cell(r.sources.join(', ')),
        cell(r.enquiredOn),
        cell(r.assignedTo),
        cell(r.test),
      ].join(','),
    )
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function exportFilename(kind: ExportKind, stage: Stage, at: string): string {
  return `leads-${slug(COLUMN_TITLE[stage])}-${kind}-${istDay(at)}.csv`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "26 Oct, 6:10 pm" in India: the menu's "Last download". Built by hand, not
 * with Intl, whose spacing and case differ between Node and browsers and
 * would make the page's server and client text disagree.
 */
export function downloadStamp(iso: string): string {
  const t = new Date(Date.parse(iso) + 5.5 * 3600_000)
  const h = t.getUTCHours()
  const m = String(t.getUTCMinutes()).padStart(2, '0')
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}, ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

export interface ExportDeps {
  /** A counsellor or superadmin. */
  mayDownload: () => Promise<boolean>
  /** Your download point for the stage (ISO), or null before your first. */
  lastDownload: (stage: Stage) => Promise<string | null>
  /** The stage's leads under the form's filters, added after `since` (null: any time) and up to `until`. */
  load: (window: { since: string | null; until: string }, form: Record<string, string>) => Promise<ExportRow[]>
  record: (d: { kind: ExportKind; stage: Stage; count: number; since: string | null; at: string }) => Promise<void>
  now: () => Date
  logger?: { error: (...args: unknown[]) => void }
}

const sameSite = (req: Request) => {
  const origin = req.headers.get('origin')
  try {
    return !origin || new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

const refuse = (status: number, error: string) => Response.json({ ok: false, error }, { status })

export async function handleLeadExport(req: Request, deps: ExportDeps): Promise<Response> {
  const log = deps.logger ?? console
  if (!sameSite(req)) return refuse(403, 'Downloads start from the Leads page.')
  let form: Record<string, string> = {}
  try {
    form = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]))
  } catch {
    /* not a form */
  }
  const kind = form.kind
  if (kind !== 'all' && kind !== 'new') return refuse(400, 'Choose all leads or new leads.')
  if (!(await deps.mayDownload())) return refuse(403, 'Only a counsellor or superadmin can download leads.')
  const stage: Stage = isStage(form.stage) ? form.stage : 'new'

  const at = deps.now().toISOString()
  let rows: ExportRow[]
  let since: string | null = null
  try {
    since = kind === 'new' ? await deps.lastDownload(stage) : null
    rows = await deps.load({ since, until: at }, form)
  } catch (e) {
    log.error('leads: export failed', e)
    return refuse(500, 'Could not read the leads. Try again.')
  }
  const csv = leadsCsv(rows)
  try {
    await deps.record({ kind, stage, count: rows.length, since, at })
  } catch (e) {
    log.error('leads: saving the download point failed', e)
  }
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename(kind, stage, at)}"`,
      'cache-control': 'no-store',
    },
  })
}
