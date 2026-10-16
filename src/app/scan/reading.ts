// Getting pixels in and out of the browser, and one frame through the reader.
// The reading itself is src/lib/omr; this is the glue the scan page needs.

import { locateSheet, readAnswers, toLiveRead, type Located, type SheetRead } from '@/lib/omr/readAnswerSheet'
import type { LiveRead } from '@/lib/omr/liveCapture'
import type { ScanPaper } from '@/server/paperScan'

/**
 * Long edge of what is read and stored. The tightest sheet nda-tracker reads
 * (2.08 mm bubbles) reads from 1080×1440; this sheet's are 2.5 mm. The stored
 * photo is the same frame, about 300 KB as a JPEG.
 */
export const MAX_EDGE = 1600

/** A looked-up paper, or why it could not be. */
export type PaperEntry = { paper: ScanPaper } | { error: string }

export interface SheetReading {
  located: Extract<Located, { ok: true }>
  read: SheetRead
  paper: ScanPaper
}

export type FrameReading = { live: LiveRead; sheet?: SheetReading }

/** Draw a source onto a canvas no larger than MAX_EDGE and read its pixels. */
export function toImageData(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): ImageData {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** A photo file to pixels. `createImageBitmap` honours the photo's orientation tag. */
export async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return toImageData(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

/** The frame as the JPEG that is stored with the result. */
export function toJpeg(image: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', 0.85),
  )
}

/**
 * One frame, read as far as it can be. Synchronous, for the live loop: a paper
 * not yet looked up is asked for once (`request`) and the frame waits on it.
 */
export function readFrame(
  image: ImageData,
  papers: Map<number, PaperEntry>,
  request: (paperNo: number) => void,
): FrameReading {
  const located = locateSheet(image)
  if (!located.ok) return { live: { ok: false, reason: located.reason } }
  const entry = papers.get(located.paperNo)
  if (!entry) {
    request(located.paperNo)
    return { live: { ok: false, reason: `Looking up paper ${located.paperNo}…` } }
  }
  if ('error' in entry) return { live: { ok: false, reason: entry.error } }
  if (entry.paper.state !== 'issued') {
    return { live: { ok: false, reason: `Paper ${located.paperNo} (${entry.paper.name}) ${stateNote(entry.paper.state)}.` } }
  }
  const read = readAnswers(image, located, entry.paper.formats)
  return { live: toLiveRead(located, read), sheet: { located, read, paper: entry.paper } }
}

export function stateNote(state: string): string {
  if (state === 'submitted') return 'is already scanned'
  if (state === 'voided') return 'was replaced by a newer test'
  return `is ${state}`
}
