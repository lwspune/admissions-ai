'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IMPORT_FIELDS, IMPORT_FIELD_LABEL, type ColumnMap, type SkippedRow } from '@/lib/leads'
import type { ImportPreview, ImportResult } from '@/server/leadImport'
import { Icon } from '@/components/icons'
import { Alert, btn, card, cx, input, label } from '@/components/ui'
import { inspectCsv, previewCsv, commitCsv } from './actions'
import { orgName, type Org } from '@/lib/orgs'

const control = input
const primary = btn('primary')
const secondary = btn('secondary')
const section = cx(card, 'p-5 sm:p-6')
const heading = 'text-base font-semibold text-slate-900'
const STEP_NAMES = ['File', 'Match columns', 'Check', 'Done'] as const
const STEP_INDEX = { choose: 0, map: 1, preview: 2, done: 3 } as const
const NEW = 'new'

type Step =
  | { at: 'choose' }
  | { at: 'map'; headers: string[]; sample: string[][] }
  | { at: 'preview'; headers: string[]; leads: number; preview: ImportPreview; skipped: SkippedRow[] }
  | { at: 'done'; sourceId: string; result: ImportResult; skipped: SkippedRow[] }

export function ImportWizard({
  sources,
  orgs,
  defaultOrg,
}: {
  sources: { id: string; name: string }[]
  /** Every org, for superadmin, who chooses where the file goes (migration 0031); empty for a counsellor. */
  orgs: Org[]
  defaultOrg: string | null
}) {
  const [step, setStep] = useState<Step>({ at: 'choose' })
  const [org, setOrg] = useState(defaultOrg ?? '')
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? NEW)
  const [newSourceName, setNewSourceName] = useState('')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState<ColumnMap>({})
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const sourceLabel = sourceId === NEW ? newSourceName.trim() : sources.find((s) => s.id === sourceId)?.name
  const orgLabel = orgs.length > 1 ? orgName(orgs, org) : null

  async function readFile(file: File | undefined) {
    setError('')
    setCsv('')
    setFileName('')
    if (!file) return
    if (file.size > 900_000) {
      setError('That file is over 900 KB. Split it into smaller files.')
      return
    }
    setCsv(await file.text())
    setFileName(file.name)
  }

  function inspect() {
    setError('')
    if (sourceId === NEW && !newSourceName.trim()) return setError('Name the source these leads came from.')
    if (!csv) return setError('Choose a CSV file.')
    start(async () => {
      const r = await inspectCsv({ csv, sourceId: sourceId === NEW ? '' : sourceId })
      if (!r.ok) return setError(r.error)
      setMap(r.map)
      setStep({ at: 'map', headers: r.headers, sample: r.sample })
    })
  }

  function preview(headers: string[]) {
    setError('')
    if (!map.mobile) return setError('Choose the column that holds the mobile number.')
    start(async () => {
      const r = await previewCsv({ csv, map, orgId: org })
      if (!r.ok) return setError(r.error)
      setStep({ at: 'preview', headers, leads: r.leads, preview: r.preview, skipped: r.skipped })
    })
  }

  function commit() {
    setError('')
    start(async () => {
      const r = await commitCsv({ csv, map, sourceId: sourceId === NEW ? '' : sourceId, newSourceName, orgId: org })
      if (!r.ok) return setError(r.error)
      setStep({ at: 'done', sourceId: r.sourceId, result: r.result, skipped: r.skipped })
    })
  }

  return (
    <div className="mt-6 space-y-4">
      <Stepper at={STEP_INDEX[step.at]} />

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {step.at === 'choose' && (
        <section aria-labelledby="choose-heading" className={section}>
          <h2 id="choose-heading" className={heading}>
            1. Source and file
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="source" className={label}>
                Where these leads came from
              </label>
              <select id="source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={control}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW}>A new source…</option>
              </select>
            </div>
            {orgs.length > 1 && (
              <div>
                <label htmlFor="org" className={label}>
                  Org these leads belong to
                </label>
                <select id="org" value={org} onChange={(e) => setOrg(e.target.value)} className={control}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {sourceId === NEW && (
              <div>
                <label htmlFor="new-source" className={label}>
                  New source name
                </label>
                <input
                  id="new-source"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. WhatsApp Consolidated 2026"
                  className={control}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="file" className={label}>
                CSV file
              </label>
              <input
                id="file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => readFile(e.target.files?.[0])}
                className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 file:mr-3 file:min-h-tap file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-700 file:px-4 file:text-sm file:font-medium file:text-white hover:file:bg-brand-800"
              />
            </div>
          </div>
          <button type="button" onClick={inspect} disabled={pending || !csv} className={`${primary} mt-4`}>
            {pending ? 'Reading…' : 'Next: match columns'}
          </button>
        </section>
      )}

      {step.at === 'map' && (
        <section aria-labelledby="map-heading" className={section}>
          <h2 id="map-heading" className={heading}>
            2. Match the columns in {fileName}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Only Mobile is required. Leave a field as “Not in this file” to skip it.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <div key={field}>
                <label htmlFor={`map-${field}`} className={label}>
                  {IMPORT_FIELD_LABEL[field]}
                  {field === 'mobile' && <span aria-hidden="true" className="text-rose-600"> *</span>}
                </label>
                <select
                  id={`map-${field}`}
                  value={map[field] ?? ''}
                  onChange={(e) => setMap((m) => ({ ...m, [field]: e.target.value || undefined }))}
                  className={control}
                >
                  <option value="">Not in this file</option>
                  {step.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={h}>
                      {h || `(column ${i + 1}, no heading)`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {step.sample.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <caption className="bg-slate-50 px-2 py-1.5 text-left text-xs font-medium text-slate-600">First rows of the file</caption>
                <thead>
                  <tr>
                    {step.headers.map((h, i) => (
                      <th key={i} scope="col" className="border-b border-slate-200 px-2 py-1 font-medium text-slate-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {step.sample.map((row, r) => (
                    <tr key={r}>
                      {step.headers.map((_, i) => (
                        <td key={i} className="max-w-[16rem] truncate border-b border-slate-100 px-2 py-1 text-slate-800">
                          {row[i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setStep({ at: 'choose' })} className={secondary}>
              Back
            </button>
            <button type="button" onClick={() => preview(step.headers)} disabled={pending} className={primary}>
              {pending ? 'Checking…' : 'Next: preview'}
            </button>
          </div>
        </section>
      )}

      {step.at === 'preview' && (
        <section aria-labelledby="preview-heading" className={section}>
          <h2 id="preview-heading" className={heading}>
            3. Check before importing into “{sourceLabel}”{orgLabel && <> for {orgLabel}</>}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-800">
            <li>{step.preview.create} new leads</li>
            <li>{step.preview.merge} already in the system — the source and remarks will be added to them</li>
            {step.preview.ambiguous.length > 0 && (
              <li>{step.preview.ambiguous.length} numbers shared by more than one lead (siblings) — not imported; listed below</li>
            )}
            {step.skipped.length > 0 && <li>{step.skipped.length} rows skipped — listed below</li>}
          </ul>
          <Ambiguous mobiles={step.preview.ambiguous} />
          <Skipped rows={step.skipped} />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep({ at: 'map', headers: step.headers, sample: [] })}
              className={secondary}
            >
              Back
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={pending || step.preview.create + step.preview.merge === 0}
              className={primary}
            >
              {pending ? 'Importing…' : `Import ${step.preview.create + step.preview.merge} leads`}
            </button>
          </div>
        </section>
      )}

      {step.at === 'done' && (
        <section aria-labelledby="done-heading" aria-live="polite" className={cx(section, 'border-emerald-200')}>
          <h2 id="done-heading" className={cx(heading, 'flex items-center gap-2 text-emerald-900')}>
            <Icon name="checkCircle" className="h-5 w-5 text-emerald-700" />
            Imported
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {step.result.created} new leads, {step.result.merged} added to existing leads.
          </p>
          <Ambiguous mobiles={step.result.ambiguous} />
          <Skipped rows={step.skipped} />
          <div className="mt-4 flex gap-2">
            <Link href={`/leads?source=${step.sourceId}&assignee=none`} className={primary}>
              Assign the new leads
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep({ at: 'choose' })
                setCsv('')
                setFileName('')
              }}
              className={secondary}
            >
              Import another file
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** Where the import has got to. Decorative: each section's heading says the same. */
function Stepper({ at }: { at: number }) {
  return (
    <ol aria-hidden="true" className="flex items-center gap-2 text-xs font-medium sm:text-sm">
      {STEP_NAMES.map((name, i) => (
        <li key={name} className="flex items-center gap-2">
          <span
            className={cx(
              'grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
              i < at ? 'bg-brand-700 text-white' : i === at ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-600' : 'bg-slate-100 text-slate-600',
            )}
          >
            {i < at ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cx('hidden sm:inline', i === at ? 'text-slate-900' : 'text-slate-600')}>{name}</span>
          {i < STEP_NAMES.length - 1 && <span className="h-px w-4 bg-slate-300 sm:w-8" />}
        </li>
      ))}
    </ol>
  )
}

function Ambiguous({ mobiles }: { mobiles: string[] }) {
  if (mobiles.length === 0) return null
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-slate-800">Numbers shared by siblings ({mobiles.length})</summary>
      <p className="mt-1 text-slate-600">Open each lead on these numbers and add the remark to the right child by hand.</p>
      <ul className="mt-1 list-disc pl-5 text-slate-800">
        {mobiles.map((m) => (
          <li key={m}>
            <Link href={`/leads?q=${m}`} className="underline">
              {m}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

const REASON: Record<SkippedRow['reason'], string> = {
  no_mobile: 'no number',
  invalid_mobile: 'not a valid mobile',
}

function Skipped({ rows }: { rows: SkippedRow[] }) {
  if (rows.length === 0) return null
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-slate-800">Skipped rows ({rows.length})</summary>
      <ul className="mt-1 space-y-0.5 text-slate-800">
        {rows.map((r) => (
          <li key={r.sheetRow}>
            Row {r.sheetRow}: {r.name || 'no name'}
            {r.mobile && ` · ${r.mobile}`} — {REASON[r.reason]}
          </li>
        ))}
      </ul>
    </details>
  )
}
