'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { browserClient } from '@/lib/browserClient'
import { resolveAnswer, scanAnswers, type Outcome } from '@/lib/scanResult'
import type { AnswerRead, SheetRead } from '@/lib/omr/readAnswerSheet'
import type { ScanPaper, ScanResult } from '@/server/paperScan'
import { CHOICES } from '@/lib/types'
import { Icon } from '@/components/icons'
import { Alert, Badge, btn, card, control, cx } from '@/components/ui'
import { fileScan } from './actions'
import { stateNote } from './reading'

export interface ScanSheet {
  key: string
  paper: ScanPaper
  read: SheetRead
  photo: Blob
  flipped: boolean
  saved?: ScanResult
}

function cellText(a: AnswerRead): string {
  if (a.review) return '?'
  if (a.doubleMark || a.state === 'multi') return '2×'
  if (a.format === 'mcq') return a.choice ?? '—'
  return a.value === null ? '—' : String(a.value)
}

function cellLabel(a: AnswerRead): string {
  const what = a.review
    ? 'needs a decision'
    : a.doubleMark
      ? 'two marks'
      : cellText(a) === '—'
        ? 'blank'
        : cellText(a)
  return `Question ${a.q}: ${what}${a.byHand ? ', decided by hand' : ''}`
}

/**
 * One read sheet: whose it is, every answer, the ones a person must settle,
 * and Save — which stays off until nothing is open. The photo is stored first,
 * then the scan filed; the database refuses a scan without its photo.
 */
export function SheetCard({
  sheet,
  onChange,
  onRemove,
}: {
  sheet: ScanSheet
  onChange: (next: ScanSheet) => void
  onRemove: () => void
}) {
  const { paper, read } = sheet
  const firstOpen = read.answers.find((a) => a.review)?.q ?? null
  const [editing, setEditing] = useState<number | null>(firstOpen)
  const [number, setNumber] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const photoUrl = useMemo(() => URL.createObjectURL(sheet.photo), [sheet.photo])
  useEffect(() => () => URL.revokeObjectURL(photoUrl), [photoUrl])

  const open = paper.state === 'issued' && !sheet.saved
  const current = editing === null ? null : (read.answers.find((a) => a.q === editing) ?? null)

  function settle(outcome: Outcome) {
    if (editing === null) return
    try {
      const next = resolveAnswer(read, editing, outcome)
      setError('')
      setNumber('')
      onChange({ ...sheet, read: next })
      setEditing(next.answers.find((a) => a.review)?.q ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer does not fit this question.')
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const answers = scanAnswers(read)
      const { error: upload } = await browserClient()
        .storage.from('omr-sheets')
        .upload(`${paper.assessmentId}.jpg`, sheet.photo, { contentType: 'image/jpeg', upsert: true })
      if (upload) throw new Error(`The photo could not be stored: ${upload.message}`)
      const r = await fileScan(paper.assessmentId, answers)
      if (!r.ok) throw new Error(r.error)
      onChange({ ...sheet, saved: r.result })
    } catch (e) {
      console.error('scan: save failed', e)
      setError(e instanceof Error ? e.message : 'Could not save the scan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby={`sheet-${sheet.key}`} className={cx(card, 'p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`sheet-${sheet.key}`} className="text-lg font-semibold text-slate-900">
            {paper.name}
          </h2>
          <p className="text-sm text-slate-600">
            Paper {paper.paperNo} · Admission to class {paper.classLevel}
            {sheet.flipped && ' · photographed upside down'}
          </p>
        </div>
        {sheet.saved ? (
          <Badge tone="success" icon="check">
            Saved
          </Badge>
        ) : read.complete ? (
          <Badge tone="info">Ready to save</Badge>
        ) : (
          <Badge tone="warning" icon="alert">
            {read.reviewCount} to check
          </Badge>
        )}
      </div>

      {!open && !sheet.saved && (
        <Alert tone="warning" className="mt-3">
          Paper {paper.paperNo} {stateNote(paper.state)}, so this sheet cannot be saved.
        </Alert>
      )}

      <div role="group" aria-label="Answers" className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {read.answers.map((a) => (
          <button
            key={a.q}
            type="button"
            disabled={!open}
            onClick={() => {
              setEditing(a.q)
              setError('')
            }}
            aria-label={cellLabel(a)}
            aria-pressed={editing === a.q}
            className={cx(
              'min-h-tap rounded-lg border px-1 py-1 text-center text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
              a.review
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : a.byHand
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-900',
              editing === a.q && 'ring-2 ring-brand-600',
            )}
          >
            <span className="block text-[10px] text-slate-600">Q{a.q}</span>
            <span className="block font-semibold tabular-nums">{cellText(a)}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Amber: needs a decision. Blue: decided by hand. Tap any answer to correct it against the sheet.
      </p>

      {open && current && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">
            Question {current.q} — {current.format === 'mcq' ? 'multiple choice' : 'numeric'}
            {current.review &&
              (current.format === 'mcq' && current.state === 'multi'
                ? ': two bubbles look marked'
                : current.format === 'numeric'
                  ? ': a column is unclear'
                  : ': a bubble is unclear')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {current.format === 'mcq' ? (
              CHOICES.map((c) => (
                <button key={c} type="button" className={btn('secondary', 'sm')} onClick={() => settle({ kind: 'choice', choice: c })}>
                  {c}
                </button>
              ))
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const value = Number(number)
                  if (number.trim() === '' || !Number.isFinite(value)) {
                    setError('Enter the number written in the box.')
                    return
                  }
                  settle({ kind: 'number', value })
                }}
              >
                <label htmlFor={`n-${sheet.key}`} className="sr-only">
                  Number for question {current.q}
                </label>
                <input
                  id={`n-${sheet.key}`}
                  inputMode="decimal"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className={cx(control, 'w-28 py-1.5')}
                  placeholder="e.g. 3.25"
                />
                <button type="submit" className={btn('secondary', 'sm')}>
                  Set
                </button>
              </form>
            )}
            <button type="button" className={btn('ghost', 'sm')} onClick={() => settle({ kind: 'blank' })}>
              Blank
            </button>
            <button type="button" className={btn('ghost', 'sm')} onClick={() => settle({ kind: 'double' })}>
              Two marks (wrong)
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <details className="mt-4">
        <summary className="min-h-tap inline-flex cursor-pointer items-center text-sm font-medium text-slate-700">
          Photo of the sheet
        </summary>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, not a remote image */}
        <img src={photoUrl} alt={`Answer sheet for ${paper.name}, paper ${paper.paperNo}`} className="mt-2 max-h-[70vh] rounded-lg border border-slate-200" />
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {sheet.saved ? (
          <>
            <p className="text-sm font-medium text-emerald-800">
              Saved · score {sheet.saved.score} ({sheet.saved.correct} correct, {sheet.saved.incorrect} wrong,{' '}
              {sheet.saved.skipped} not attempted)
            </p>
            <Link href={`/reports/${paper.leadId}`} className={btn('success', 'sm')}>
              <Icon name="chart" className="h-4 w-4" />
              View report
            </Link>
          </>
        ) : (
          <>
            <button type="button" className={btn('primary')} disabled={!open || !read.complete || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save result'}
            </button>
            <button type="button" className={btn('ghost')} onClick={onRemove} disabled={saving}>
              Discard
            </button>
            {!read.complete && open && (
              <span className="text-sm text-amber-800">Settle the amber answers to save.</span>
            )}
          </>
        )}
      </div>
    </section>
  )
}
