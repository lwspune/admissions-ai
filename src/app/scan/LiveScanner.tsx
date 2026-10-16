'use client'

// The viewfinder: sheets read as the camera sees them, not after a photograph.
//
// Ported from nda-tracker (src/components/scan/SheetScanner.jsx, 2026-09). Hold
// the sheet, feel the buzz, move it away, next. This owns the camera, the frames
// and the outline; WHEN a sheet counts as read is `liveStep` (pure, tested).
// A sheet that needs a person is offered with one tap, never filed.

import { useCallback, useEffect, useRef, useState } from 'react'
import { liveInitial, liveStep, type LivePhase } from '@/lib/omr/liveCapture'
import { Icon } from '@/components/icons'
import { btn, cx } from '@/components/ui'
import { readFrame, toImageData, toJpeg, type PaperEntry, type SheetReading } from './reading'

const INTERVAL_MS = 90

/** The back camera, at the highest sane resolution; `ideal` so a laptop still works. */
function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
    audio: false,
  })
}

/** Plain words for the reasons a camera says no. */
function cameraTrouble(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied. Allow it for this site, or use “Choose photo”.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found — use “Choose photo” instead.'
  if (name === 'NotReadableError') return 'The camera is in use by another app.'
  return `The camera could not be started (${name || 'unknown error'}).`
}

const TONE: Record<LivePhase, string> = {
  hunting: 'text-slate-700',
  holding: 'text-amber-800',
  accepted: 'text-emerald-800',
  done: 'text-slate-700',
  review: 'text-amber-800',
  duplicate: 'text-rose-700',
}

export function LiveScanner({
  papers,
  request,
  onSheet,
}: {
  /** Looked-up papers by number; read through a ref, so a lookup finishing mid-loop is seen. */
  papers: React.RefObject<Map<number, PaperEntry>>
  request: (paperNo: number) => void
  onSheet: (sheet: SheetReading, photo: Blob) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const liveRef = useRef(liveInitial())
  const pendingImage = useRef<ImageData | null>(null)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<{ phase: LivePhase; message: string }>({ phase: 'hunting', message: '' })
  const [error, setError] = useState('')
  const [pending, setPending] = useState<SheetReading | null>(null)
  const [count, setCount] = useState(0)
  const [torch, setTorch] = useState<{ has: boolean; on: boolean }>({ has: false, on: false })

  const stop = useCallback(() => {
    runningRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setRunning(false)
    setTorch({ has: false, on: false })
    setPending(null)
    setStatus({ phase: 'hunting', message: '' })
  }, [])

  // A camera left running is a hot phone and a live recording light.
  useEffect(() => stop, [stop])

  function drawOverlay(sheet: SheetReading | undefined, frame: ImageData) {
    const canvas = overlayRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const w = video.clientWidth
    const h = video.clientHeight
    if (!w || !h) return
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    if (!sheet) return
    // The video is letterboxed (object-contain), so map frame pixels through the
    // same fit, or the outline sits off the paper.
    const scale = Math.min(w / frame.width, h / frame.height)
    const ox = (w - frame.width * scale) / 2
    const oy = (h - frame.height * scale) / 2
    const at = (c: { x: number; y: number }) => [ox + c.x * scale, oy + c.y * scale] as const
    ctx.beginPath()
    sheet.located.corners.forEach((c, i) => (i === 0 ? ctx.moveTo(...at(c)) : ctx.lineTo(...at(c))))
    ctx.closePath()
    ctx.lineWidth = 3
    ctx.strokeStyle = sheet.read.complete ? '#16a34a' : '#d97706'
    ctx.stroke()
  }

  async function loop() {
    while (runningRef.current) {
      const video = videoRef.current
      const work = workRef.current
      if (video && work && video.readyState >= 2 && video.videoWidth) {
        try {
          const image = toImageData(video, video.videoWidth, video.videoHeight, work)
          const frame = readFrame(image, papers.current, request)
          const step = liveStep(liveRef.current, frame.live)
          liveRef.current = step.state
          setStatus({ phase: step.phase, message: step.message })
          drawOverlay(frame.sheet, image)
          if (step.phase === 'review' && frame.sheet) {
            pendingImage.current = image
            setPending(frame.sheet)
          } else if (step.phase !== 'review') {
            setPending(null)
          }
          if (step.accept && frame.sheet) {
            setCount((n) => n + 1)
            navigator.vibrate?.(60)
            onSheet(frame.sheet, await toJpeg(image))
          }
        } catch (e) {
          console.error('scan: frame failed', e)
        }
      }
      await new Promise((r) => setTimeout(r, INTERVAL_MS))
    }
  }

  async function start() {
    setError('')
    try {
      const stream = await openCamera()
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          // An autoplay policy can refuse play(); the stream is live either way.
        }
      }
      const track = stream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
      setTorch({ has: Boolean(caps?.torch), on: false })
      liveRef.current = liveInitial()
      runningRef.current = true
      setRunning(true)
      void loop()
    } catch (e) {
      setError(cameraTrouble(e))
      stop()
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const on = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorch({ has: true, on })
    } catch {
      setTorch({ has: false, on: false })
    }
  }

  async function keepForReview() {
    if (!pending || !pendingImage.current) return
    onSheet(pending, await toJpeg(pendingImage.current))
    setPending(null)
  }

  return (
    // On a phone the running camera takes the whole screen, so the picture and
    // the one line that says whether a sheet was read are both in view.
    <div
      className={cx(
        'space-y-2',
        running &&
          'max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:gap-3 max-md:space-y-0 max-md:bg-white max-md:px-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-[max(0.75rem,env(safe-area-inset-top))]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <button type="button" className={btn('primary')} onClick={start}>
            <Icon name="camera" className="h-4 w-4" />
            Scan with the camera
          </button>
        ) : (
          <>
            <button type="button" className={btn('secondary')} onClick={stop}>
              <Icon name="x" className="h-4 w-4" />
              Stop camera
            </button>
            {torch.has && (
              <button type="button" className={btn('secondary')} onClick={toggleTorch} aria-pressed={torch.on}>
                Torch {torch.on ? 'on' : 'off'}
              </button>
            )}
            <span className="text-sm text-slate-700">{count} read</span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className={cx('relative overflow-hidden rounded-xl bg-slate-900', running ? 'max-md:flex-1' : 'hidden')}>
        <video ref={videoRef} playsInline muted className="block h-full w-full object-contain" />
        <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
        <canvas ref={workRef} hidden />
      </div>

      {running && (
        <p role="status" aria-live="polite" className={cx('min-h-[1.5rem] text-sm font-medium', TONE[status.phase])}>
          {status.message || 'Point the camera at a whole sheet.'}
        </p>
      )}

      {running && pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            {pending.paper.name}: {pending.read.reviewCount} to check by hand.
          </span>
          <button type="button" className={btn('secondary', 'sm')} onClick={keepForReview}>
            Keep for review
          </button>
        </div>
      )}
    </div>
  )
}
