'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AnswerSheet } from '@/lib/paperSheet'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'

/**
 * Print the question paper, and download its OMR answer sheet. The sheet is
 * drawn here in the browser from `sheet` — formats and who it is for, never a
 * question — and the PDF library loads only when someone asks for one.
 */
export function PaperActions({ sheet }: { sheet: AnswerSheet }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setBusy(true)
    setError('')
    try {
      const { renderAnswerSheetPdf } = await import('@/lib/omr/sheetPdf')
      const url = URL.createObjectURL(await renderAnswerSheetPdf(sheet))
      const a = document.createElement('a')
      a.href = url
      a.download = `OMR sheet ${sheet.paperNo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('omr: could not build the answer sheet', e)
      setError('Could not build the answer sheet. Try again, or reload the page.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => window.print()} className={btn('primary')}>
        <Icon name="printer" className="h-4 w-4" />
        Print question paper
      </button>
      <button type="button" onClick={download} disabled={busy} className={btn('secondary')}>
        <Icon name="download" className="h-4 w-4" />
        {busy ? 'Preparing…' : 'Download OMR sheet'}
      </button>
      <Link href="/scan" className={btn('ghost')}>
        <Icon name="camera" className="h-4 w-4" />
        Scan filled sheet
      </Link>
      {error && (
        <p role="alert" className="basis-full text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
