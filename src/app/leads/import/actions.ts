'use server'

import { revalidatePath } from 'next/cache'
import { canManageLeads } from '@/lib/staff'
import { orgFor } from '@/lib/orgs'
import { userClient, requireStaff, type StaffUser } from '@/server/auth'
import { listOrgs } from '@/server/orgs'
import type { Db } from '@/server/supabase'
import { previewImport, importLeads, type ImportPreview, type ImportResult } from '@/server/leadImport'
import { parseCsv, CsvError } from '@/lib/csv'
import {
  prepareImport,
  guessColumnMap,
  isUuid,
  IMPORT_FIELDS,
  ImportMapError,
  type ColumnMap,
  type PreparedImport,
  type SkippedRow,
} from '@/lib/leads'

// The import runs in three calls — read the headers, preview, commit — and
// each re-parses the file on the server. Nothing the browser says about the
// file is trusted, including an earlier preview: the commit decides again.
//
// Limits: server actions accept 1 MB by default, and the whole file is one
// database transaction, so a file is capped at MAX_ROWS rather than risking
// the statement timeout midway through admission season.

const MAX_CHARS = 900_000
const MAX_ROWS = 5000

type Fail = { ok: false; error: string }

export type InspectResult = { ok: true; headers: string[]; sample: string[][]; map: ColumnMap } | Fail
export type PreviewResult = { ok: true; leads: number; preview: ImportPreview; skipped: SkippedRow[] } | Fail
export type CommitResult = { ok: true; sourceId: string; result: ImportResult; skipped: SkippedRow[] } | Fail

async function importer() {
  const staff = await requireStaff()
  if (!canManageLeads(staff.role)) throw new Error('Only a counsellor or superadmin can import leads.')
  return { db: await userClient(), staff }
}

/** The org a file goes into: superadmin's choice, a counsellor's own (import_leads enforces it, migration 0031). */
async function importOrg(db: Db, staff: StaffUser, requested: string): Promise<string | null> {
  const orgs = staff.role === 'superadmin' ? await listOrgs(db) : []
  return orgFor(staff.role, requested, staff.orgId, orgs)
}

function records(csv: unknown): string[][] {
  if (typeof csv !== 'string' || csv.trim() === '') throw new ImportMapError('The file is empty.')
  if (csv.length > MAX_CHARS) throw new ImportMapError('The file is too large. Split it into smaller files.')
  const rows = parseCsv(csv)
  if (rows.length - 1 > MAX_ROWS) {
    throw new ImportMapError(`The file has ${rows.length - 1} rows. Split it into files of at most ${MAX_ROWS}.`)
  }
  return rows
}

function cleanMap(map: unknown): ColumnMap {
  const clean: ColumnMap = {}
  if (typeof map !== 'object' || map === null) return clean
  for (const field of IMPORT_FIELDS) {
    const header = (map as Record<string, unknown>)[field]
    if (typeof header === 'string' && header !== '') clean[field] = header
  }
  return clean
}

function prepare(csv: unknown, map: unknown): PreparedImport {
  return prepareImport(records(csv), cleanMap(map))
}

/** Problems with the file are the user's to fix; anything else is logged. */
function fail(action: string, e: unknown): Fail {
  if (e instanceof CsvError || e instanceof ImportMapError) return { ok: false, error: e.message }
  console.error(`import: ${action} failed:`, e)
  return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' }
}

export async function inspectCsv(input: { csv: string; sourceId: string }): Promise<InspectResult> {
  try {
    const { db } = await importer()
    const rows = records(input.csv)
    const headers = rows[0] ?? []
    if (headers.every((h) => h.trim() === '')) return { ok: false, error: 'The first row should hold the column names.' }

    // A source remembers its columns from the last import; use them if the
    // file still has every one, otherwise guess afresh.
    let map = guessColumnMap(headers)
    if (isUuid(input.sourceId)) {
      const { data } = await db.from('lead_sources').select('column_map').eq('id', input.sourceId).maybeSingle()
      const saved = cleanMap(data?.column_map)
      if (saved.mobile && Object.values(saved).every((h) => headers.includes(h!))) map = saved
    }

    return { ok: true, headers, sample: rows.slice(1, 4), map }
  } catch (e) {
    return fail('inspect', e)
  }
}

export async function previewCsv(input: { csv: string; map: ColumnMap; orgId: string }): Promise<PreviewResult> {
  try {
    const { db, staff } = await importer()
    const prepared = prepare(input.csv, input.map)
    const preview = await previewImport(db, prepared.rows, await importOrg(db, staff, input.orgId))
    return { ok: true, leads: prepared.rows.length, preview, skipped: prepared.skipped }
  } catch (e) {
    return fail('preview', e)
  }
}

export async function commitCsv(input: {
  csv: string
  map: ColumnMap
  sourceId: string
  newSourceName: string
  orgId: string
}): Promise<CommitResult> {
  try {
    const { db, staff } = await importer()
    const prepared = prepare(input.csv, input.map)
    if (prepared.rows.length === 0) return { ok: false, error: 'No row in this file has a usable mobile number.' }

    let sourceId = input.sourceId
    if (!isUuid(sourceId)) {
      const name = String(input.newSourceName ?? '').trim().replace(/\s+/g, ' ')
      if (!name) return { ok: false, error: 'Name the source these leads came from.' }
      if (name.length > 80) return { ok: false, error: 'Keep the source name under 80 characters.' }
      const { data, error } = await db.from('lead_sources').insert({ name }).select('id').single()
      if (error?.code === '23505') return { ok: false, error: `A source called "${name}" already exists. Choose it from the list.` }
      if (error) throw error
      sourceId = data.id as string
    }

    const result = await importLeads(db, sourceId, prepared.rows, await importOrg(db, staff, input.orgId))

    // Remembered for next time. Failing to save it costs a re-mapping, not
    // data, so it does not fail an import that has already been written.
    const { error: mapError } = await db.from('lead_sources').update({ column_map: cleanMap(input.map) }).eq('id', sourceId)
    if (mapError) console.error('import: could not save the column map:', mapError)

    revalidatePath('/leads')
    return { ok: true, sourceId, result, skipped: prepared.skipped }
  } catch (e) {
    return fail('commit', e)
  }
}
