import 'server-only'
import type { Db } from './supabase'
import type { ImportRow } from '../lib/leads'

// Lead import against the database. The decisions about the file are made in
// src/lib/leads.ts; the write happens in `import_leads` (migration 0012), which
// is one transaction and re-checks every value. Both take the session client,
// so the caller's own policies decide — a telecaller is refused in the
// function itself.

export interface ImportResult {
  created: number
  merged: number
  /** Numbers already on more than one lead (siblings). Not written. */
  ambiguous: string[]
}

export interface ImportPreview {
  create: number
  merge: number
  ambiguous: string[]
}

// PostgREST puts `in` filters in the URL; 200 ten-digit numbers is ~2.6 KB.
const CHUNK = 200

/**
 * What an import would do, without writing. The same matching rule as
 * `import_leads`: one existing lead on the number merges, several is left for a
 * person to decide. Advisory only — the commit re-decides inside its
 * transaction, since a lead can be added between the two. Matched within the
 * importer's org, as the commit is: superadmin sees every org's leads but
 * imports into their own (migration 0030).
 */
export async function previewImport(db: Db, rows: ImportRow[], orgId: string | null): Promise<ImportPreview> {
  const counts = new Map<string, number>()
  const mobiles = rows.map((r) => r.mobile)

  for (let i = 0; i < mobiles.length; i += CHUNK) {
    const { data, error } = await db
      .from('leads')
      .select('contact_mobile')
      .eq('org_id', orgId ?? '00000000-0000-0000-0000-000000000000')
      .in('contact_mobile', mobiles.slice(i, i + CHUNK))
    if (error) throw new Error(`could not check existing leads: ${error.message}`)
    for (const { contact_mobile } of data ?? []) {
      counts.set(contact_mobile, (counts.get(contact_mobile) ?? 0) + 1)
    }
  }

  const preview: ImportPreview = { create: 0, merge: 0, ambiguous: [] }
  for (const mobile of mobiles) {
    const n = counts.get(mobile) ?? 0
    if (n === 0) preview.create++
    else if (n === 1) preview.merge++
    else preview.ambiguous.push(mobile)
  }
  return preview
}

/**
 * Writes the file into `orgId`, which only superadmin may choose (migration
 * 0031); a counsellor naming another org is refused. Null: the caller's own.
 */
export async function importLeads(db: Db, sourceId: string, rows: ImportRow[], orgId: string | null = null): Promise<ImportResult> {
  const { data, error } = await db.rpc('import_leads', {
    p_org: orgId,
    p_source_id: sourceId,
    p_rows: rows.map((r) => ({
      mobile: r.mobile,
      name: r.name,
      stage: r.stage,
      interest: r.interest,
      source_date: r.sourceDate,
      notes: r.notes,
    })),
  })
  if (error) throw new Error(error.message)
  return data as ImportResult
}
