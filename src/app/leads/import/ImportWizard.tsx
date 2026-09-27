'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IMPORT_FIELDS, IMPORT_FIELD_LABEL, type ColumnMap, type SkippedRow } from '@/lib/leads'
import type { ImportPreview, ImportResult } from '@/server/leadImport'
import { inspectCsv, previewCsv, commitCsv } from './actions'

const control = 'min-h-tap mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-base'
const primary = 'min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const NEW = 'new'

type Step =
  | { at: 'choose' }
  | { at: 'map'; headers: string[]; sample: string[][] }
  | { at: 'preview'; headers: string[]; leads: number; preview: ImportPreview; skipped: SkippedRow[] }
  | { at: 'done'; sourceId: string; result: ImportResult; skipped: SkippedRow[] }

export function ImportWizard({ sources }: { sources: { id: string; name: string }[] }) {
  const [step, setStep] = useState<Step>({ at: 'choose' })
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? NEW)
  const [newSourceName, setNewSourceName] = useState('')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState<ColumnMap>({})
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const sourceLabel = sourceId === NEW ? newSourceName.trim() : sources.find((s) => s.id === sourceId)?.name

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
      const r = await previewCsv({ csv, map })
      if (!r.ok) return setError(r.error)
      setStep({ at: 'preview', headers, leads: r.leads, preview: r.preview, skipped: r.skipped })
    })
  }

  function commit() {
    setError('')
    start(async () => {
      const r = await commitCsv({ csv, map, sourceId: sourceId === NEW ? '' : sourceId, newSourceName })
      if (!r.ok) return setError(r.error)
      setStep({ at: 'done', sourceId: r.sourceId, result: r.result, skipped: r.skipped })
    })
  }

  return (
    <div className="mt-5 space-y-4">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {step.at === 'choose' && (
        <section aria-labelledby="choose-heading" className="rounded-lg border border-slate-200 p-4">
          <h2 id="choose-heading" className="text-sm font-semibold text-slate-900">
            1. Source and file
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="source" className="block text-sm font-medium text-slate-700">
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
            {sourceId === NEW && (
              <div>
                <label htmlFor="new-source" className="block text-sm font-medium text-slate-700">
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
              <label htmlFor="file" className="block text-sm font-medium text-slate-700">
                CSV file
              </label>
              <input
                id="file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => readFile(e.target.files?.[0])}
                className="mt-1 block w-full text-sm"
              />
            </div>
          </div>
          <button type="button" onClick={inspect} disabled={pending || !csv} className={`${primary} mt-4`}>
            {pending ? 'Reading…' : 'Next: match columns'}
          </button>
        </section>
      )}

      {step.at === 'map' && (
        <section aria-labelledby="map-heading" className="rounded-lg border border-slate-200 p-4">
          <h2 id="map-heading" className="text-sm font-semibold text-slate-900">
            2. Match the columns in {fileName}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Only Mobile is required. Leave a field as “Not in this file” to skip it.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <div key={field}>
                <label htmlFor={`map-${field}`} className="block text-sm font-medium text-slate-700">
                  {IMPORT_FIELD_LABEL[field]}
                  {field === 'mobile' && <span aria-hidden="true"> *</span>}
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
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <caption className="mb-1 text-left text-xs text-slate-600">First rows of the file</caption>
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
            <button type="button" onClick={() => setStep({ at: 'choose' })} className="min-h-tap rounded border border-slate-300 px-4 py-2 text-sm">
              Back
            </button>
            <button type="button" onClick={() => preview(step.headers)} disabled={pending} className={primary}>
              {pending ? 'Checking…' : 'Next: preview'}
            </button>
          </div>
        </section>
      )}

      {step.at === 'preview' && (
        <section aria-labelledby="preview-heading" className="rounded-lg border border-slate-200 p-4">
          <h2 id="preview-heading" className="text-sm font-semibold text-slate-900">
            3. Check before importing into “{sourceLabel}”
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-800">
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
              className="min-h-tap rounded border border-slate-300 px-4 py-2 text-sm"
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
        <section aria-labelledby="done-heading" aria-live="polite" className="rounded-lg border border-green-300 bg-green-50 p-4">
          <h2 id="done-heading" className="text-sm font-semibold text-green-900">
            Imported
          </h2>
          <p className="mt-1 text-sm text-green-900">
            {step.result.created} new leads, {step.result.merged} added to existing leads.
          </p>
          <Ambiguous mobiles={step.result.ambiguous} />
          <Skipped rows={step.skipped} />
          <div className="mt-4 flex gap-2">
            <Link href={`/leads?source=${step.sourceId}&assignee=none`} className={`${primary} inline-flex items-center`}>
              Assign the new leads
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep({ at: 'choose' })
                setCsv('')
                setFileName('')
              }}
              className="min-h-tap rounded border border-slate-300 px-4 py-2 text-sm"
            >
              Import another file
            </button>
          </div>
        </section>
      )}
    </div>
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
