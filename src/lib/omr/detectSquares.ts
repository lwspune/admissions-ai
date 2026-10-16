// Finding the registration squares in a photograph of a sheet.
//
// Ported from nda-tracker (src/lib/omr/detectSquares.js, 2026-09), where it was
// validated on nine real phone photos from a handset nobody recorded — which is
// the point. Nothing here is in camera pixels: candidate size is a fraction of
// frame width, thresholding is local so a shadow does not swallow a corner, and
// the geometry that follows (`fitLattice`) is recovered from the sheet itself.
//
// Input is ImageData-shaped (`{width, height, data}` RGBA), what a <canvas>
// returns and what a test builds in three lines.

export interface ImageLike {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface Blob2D {
  n: number
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  fill: number
}

/**
 * A solid square fills ~1.0 of its bounding box; a DISC fills π/4 ≈ 0.785.
 * That gap separates a registration mark from a heavily inked bubble, and it
 * is geometry rather than a tuned constant.
 */
export const SQUARE_FILL_MIN = 0.85

/**
 * Expected registration square size, as a fraction of the frame's width. The
 * answer sheet's squares are 2.5 mm on a 210 mm page (0.012) and the page
 * rarely fills the frame, so 0.011; nda-tracker's sheets use 0.018. The size
 * window below runs from 0.45× to 2.4× of it either way.
 */
const SIZE_HINT = 0.011
const SIZE_MIN_FACTOR = 0.45
const SIZE_MAX_FACTOR = 2.4
const ASPECT_MIN = 0.75
const ASPECT_MAX = 1.35

/** Luminance, at ImageData stride. */
export function toGrayscale({ width, height, data }: ImageLike): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    gray[i] = (0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!) | 0
  }
  return gray
}

/**
 * Threshold each pixel against its own neighbourhood. The background is the
 * coarse block mean, sampled bilinearly so the estimate itself has no edges.
 */
export function binarize(
  gray: Uint8Array,
  width: number,
  height: number,
  { block = 48, offset = 22 }: { block?: number; offset?: number } = {},
): Uint8Array {
  const bw = Math.ceil(width / block)
  const bh = Math.ceil(height / block)
  const sum = new Float64Array(bw * bh)
  const count = new Float64Array(bw * bh)
  for (let y = 0; y < height; y++) {
    const by = (y / block) | 0
    for (let x = 0; x < width; x++) {
      const i = by * bw + ((x / block) | 0)
      sum[i] = sum[i]! + gray[y * width + x]!
      count[i] = count[i]! + 1
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = sum[i]! / (count[i] || 1)

  const bg = (x: number, y: number) => {
    const fx = Math.min(bw - 1, Math.max(0, x / block - 0.5))
    const fy = Math.min(bh - 1, Math.max(0, y / block - 0.5))
    const x0 = fx | 0
    const y0 = fy | 0
    const x1 = Math.min(bw - 1, x0 + 1)
    const y1 = Math.min(bh - 1, y0 + 1)
    const tx = fx - x0
    const ty = fy - y0
    return (
      sum[y0 * bw + x0]! * (1 - tx) * (1 - ty) +
      sum[y0 * bw + x1]! * tx * (1 - ty) +
      sum[y1 * bw + x0]! * (1 - tx) * ty +
      sum[y1 * bw + x1]! * tx * ty
    )
  }

  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) mask[y * width + x] = gray[y * width + x]! < bg(x, y) - offset ? 1 : 0
  }
  return mask
}

/**
 * 3×3 erosion, for DETECTION only: speckle touching a square joins its blob
 * and drops its fill below the threshold. The mask returned to callers is not
 * eroded — `sampleDarkness` reads it, and thinning the ink would bias every
 * bubble toward empty.
 */
function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (
        mask[i] &&
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - width] &&
        mask[i + width] &&
        mask[i - width - 1] &&
        mask[i - width + 1] &&
        mask[i + width - 1] &&
        mask[i + width + 1]
      )
        out[i] = 1
    }
  }
  return out
}

/** 8-connected components, with their bounding boxes and centroids. */
export function connectedComponents(mask: Uint8Array, width: number, height: number, minPx = 40): Blob2D[] {
  const seen = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  const blobs: Blob2D[] = []
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || seen[start]) continue
    let sp = 0
    stack[sp++] = start
    seen[start] = 1
    let n = 0
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -1
    let y1 = -1
    let sx = 0
    let sy = 0
    while (sp) {
      const idx = stack[--sp]!
      const x = idx % width
      const y = (idx / width) | 0
      n++
      sx += x
      sy += y
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const ni = ny * width + nx
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1
            stack[sp++] = ni
          }
        }
      }
    }
    if (n < minPx) continue
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    blobs.push({ n, x: x0, y: y0, w, h, cx: sx / n, cy: sy / n, fill: n / (w * h) })
  }
  return blobs
}

/** Registration squares in a photographed sheet, and the thresholded (not eroded) mask to sample bubbles from. */
export function detectRegistrationSquares(
  image: ImageLike,
  {
    fillMin = SQUARE_FILL_MIN,
    sizeHint = SIZE_HINT,
    binarizeOptions,
  }: { fillMin?: number; sizeHint?: number; binarizeOptions?: { block?: number; offset?: number } } = {},
): { squares: Blob2D[]; mask: Uint8Array; stats: { candidates: number; rejected: number; expectedSize: number } } {
  const { width, height } = image
  const mask = binarize(toGrayscale(image), width, height, binarizeOptions)
  // A square this small is noise; scaling the floor with the frame keeps the
  // detector honest at any resolution.
  const expected = width * sizeHint
  const minPx = Math.max(12, Math.round((expected * SIZE_MIN_FACTOR) ** 2 * 0.5))
  const blobs = connectedComponents(erode(mask, width, height), width, height, minPx)
  const squares = blobs
    .filter((b) => {
      const aspect = b.w / b.h
      // Erosion trims a pixel from each side, so compare against the eroded size.
      return (
        aspect > ASPECT_MIN &&
        aspect < ASPECT_MAX &&
        b.fill > fillMin &&
        b.w + 2 > expected * SIZE_MIN_FACTOR &&
        b.w + 2 < expected * SIZE_MAX_FACTOR
      )
    })
    .map((b) => ({ ...b, w: b.w + 2, h: b.h + 2, x: b.x - 1, y: b.y - 1 }))
  return {
    squares,
    mask,
    stats: { candidates: blobs.length, rejected: blobs.length - squares.length, expectedSize: expected },
  }
}

/**
 * How dark is the bubble at (cx, cy)? Samples INSIDE the printed outline: at
 * the full radius every empty bubble counts its own border as ink.
 */
export function sampleDarkness(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  inset = 0.62,
): number {
  const r = Math.max(1, radius * inset)
  let dark = 0
  let total = 0
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      total++
      if (mask[y * width + x]) dark++
    }
  }
  return total ? dark / total : 0
}
