'use client'

import { useCallback, useRef, useState } from 'react'
import { locateSheet, readAnswers } from '@/lib/omr/readAnswerSheet'
import { Icon } from '@/components/icons'
import { btn, card, cx } from '@/components/ui'
import { findPaper } from './actions'
import { LiveScanner } from './LiveScanner'
import { SheetCard, type ScanSheet } from './SheetCard'
import { fileToImageData, toJpeg, stateNote, type PaperEntry, type SheetReading } from './reading'

/**
 * Scanning paper-test answer sheets: with the camera, or from a photo when the
 * camera cannot start. Each sheet says which paper it is; the paper is looked
 * up once by that number, then every answer is read, settled and saved here.
 * The photo is read on this device and stored only with a saved result.
 */
export function ScanConsole() {
  const papers = useRef(new Map<number, PaperEntry>())
  const asked = useRef(new Set<number>())
  const [sheets, setSheets] = useState<ScanSheet[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Only a lasting answer is kept — the paper, or "no such paper". A passing
  // failure (a dropped connection) is not, or the scanner would wait on
  // "Looking up…" for good.
  const lookUp = useCallback(async (paperNo: number): Promise<PaperEntry> => {
    const known = papers.current.get(paperNo)
    if (known) return known
    let r: Awaited<ReturnType<typeof findPaper>>
    try {
      r = await findPaper(paperNo)
    } catch (e) {
      console.error('scan: paper lookup failed', e)
      r = { ok: false, error: 'Could not look the paper up. Trying again…', retry: true }
    }
    const entry: PaperEntry = r.ok ? { paper: r.paper } : { error: r.error }
    if (r.ok || !r.retry) papers.current.set(paperNo, entry)
    return entry
  }, [])

  // The live loop is synchronous, so it asks once and reads the answer from the
  // ref; a lookup that did not settle is asked again a few seconds later.
  const request = useCallback(
    (paperNo: number) => {
      if (asked.current.has(paperNo)) return
      asked.current.add(paperNo)
      void lookUp(paperNo).then(() => {
        if (!papers.current.has(paperNo)) setTimeout(() => asked.current.delete(paperNo), 3000)
      })
    },
    [lookUp],
  )

  // Paper numbers in the list, kept beside it so a duplicate is caught without
  // a side effect inside a state update.
  const listed = useRef(new Set<number>())

  const add = useCallback((reading: SheetReading, photo: Blob) => {
    const { paper } = reading
    if (listed.current.has(paper.paperNo)) {
      setNotice(`Paper ${paper.paperNo} (${paper.name}) is already in the list below.`)
      return
    }
    listed.current.add(paper.paperNo)
    setNotice('')
    const sheet: ScanSheet = {
      key: `${paper.paperNo}-${Date.now()}`,
      paper,
      read: reading.read,
      photo,
      flipped: reading.located.flipped,
    }
    setSheets((list) => [sheet, ...list])
  }, [])

  async function fromFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setNotice('')
    for (const file of Array.from(files)) {
      try {
        const image = await fileToImageData(file)
        const located = locateSheet(image)
        if (!located.ok) {
          setNotice(`${file.name}: ${located.reason}`)
          continue
        }
        const entry = await lookUp(located.paperNo)
        if ('error' in entry) {
          setNotice(`${file.name}: ${entry.error}`)
          continue
        }
        if (entry.paper.state !== 'issued') {
          setNotice(`${file.name}: paper ${located.paperNo} (${entry.paper.name}) ${stateNote(entry.paper.state)}.`)
          continue
        }
        add({ located, read: readAnswers(image, located, entry.paper.formats), paper: entry.paper }, await toJpeg(image))
      } catch (e) {
        console.error('scan: photo failed', e)
        setNotice(`${file.name}: the photo could not be read.`)
      }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="scan-heading" className={cx(card, 'p-5')}>
        <h1 id="scan-heading" className="text-xl font-semibold text-slate-900">
          Scan answer sheets
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Hold each filled sheet flat under the camera, whole page in view. It is read when two frames agree; anything
          unclear waits for you below. Or photograph the sheet and choose the photo.
        </p>
        <div className="mt-4 space-y-3">
          <LiveScanner papers={papers} request={request} onSheet={add} />
          <div className="flex flex-wrap items-center gap-2">
            {/* The input sits inside its label so the label shows keyboard focus. */}
            <label
              className={cx(
                btn('secondary'),
                'cursor-pointer focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand-700',
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => void fromFiles(e.target.files)}
              />
              <Icon name="upload" className="h-4 w-4" />
              {busy ? 'Reading…' : 'Choose photo'}
            </label>
          </div>
        </div>
        {notice && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {notice}
          </p>
        )}
      </section>

      {sheets.length === 0 ? (
        <p className="text-sm text-slate-600">No sheets read yet.</p>
      ) : (
        sheets.map((s) => (
          <SheetCard
            key={s.key}
            sheet={s}
            onChange={(next) => setSheets((list) => list.map((x) => (x.key === s.key ? next : x)))}
            onRemove={() => {
              listed.current.delete(s.paper.paperNo)
              setSheets((list) => list.filter((x) => x.key !== s.key))
            }}
          />
        ))
      )}
    </div>
  )
}
