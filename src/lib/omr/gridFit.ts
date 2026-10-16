// Fit the registration lattice GLOBALLY, from every square that was detected.
//
// Ported from nda-tracker (src/lib/omr/gridFit.js, 2026-09). Anchoring on four
// extreme points rectified 6 of 9 real photos: a corner square lost to shadow
// made the "top-left" the second row and skewed everything. Instead each
// square's INTEGER lattice index is recovered by walking the grid, then the
// transform is fitted by least squares over all of them — 9 of 9. A missing
// square costs nothing and a stray blob is never indexed.

export type H = [number, number, number, number, number, number, number, number, number]
export interface Pt {
  x: number
  y: number
}

/** Apply a 9-element homography to a point. */
export function applyH(h: H, x: number, y: number): Pt {
  const d = h[6] * x + h[7] * y + h[8]
  return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d }
}

/** Solve 8 unknowns by Gaussian elimination with partial pivoting. */
function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r
    if (Math.abs(A[p]![c]!) < 1e-12) return null
    ;[A[c], A[p]] = [A[p]!, A[c]!]
    ;[b[c], b[p]] = [b[p]!, b[c]!]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = A[r]![c]! / A[c]![c]!
      for (let k = c; k < n; k++) A[r]![k]! -= f * A[c]![k]!
      b[r]! -= f * b[c]!
    }
  }
  return b.map((v, i) => v / A[i]![i]!)
}

/**
 * Least-squares homography mapping `src` onto `dst` (4+ correspondences).
 * Over-determined on purpose: no single mis-detected square can define it.
 */
export function solveHomographyLS(src: Pt[], dst: Pt[]): H | null {
  if (src.length < 4 || src.length !== dst.length) return null
  const ATA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0))
  const ATb = new Array<number>(8).fill(0)
  for (let k = 0; k < src.length; k++) {
    const { x, y } = src[k]!
    const { x: X, y: Y } = dst[k]!
    for (const r of [
      [x, y, 1, 0, 0, 0, -X * x, -X * y, X],
      [0, 0, 0, x, y, 1, -Y * x, -Y * y, Y],
    ]) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) ATA[i]![j]! += r[i]! * r[j]!
        ATb[i]! += r[i]! * r[8]!
      }
    }
  }
  const h = solve8(ATA, ATb)
  return h ? ([...h, 1] as H) : null
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v: Pt) => Math.hypot(v.x, v.y)

/**
 * The ONE-step length among edges that point the same way. A family holds
 * two-step edges too; the bottom of the sorted lengths is the one-step cluster,
 * and a low quantile rather than the minimum keeps one jittered square from
 * defining the basis alone.
 */
const oneStep = (lengths: number[]) => {
  if (!lengths.length) return 0
  const s = [...lengths].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.15))]!
}

/**
 * The two lattice basis vectors, from the short edges between nearby squares.
 * Directions are bucketed (folded mod 180°) and ranked by how many edges they
 * hold — filtering by a global length first threw away the long axis of an
 * anisotropic sheet. The second axis is the SHORTEST well-populated direction
 * that is not near-parallel: the two shortest independent vectors are the
 * reduced basis, which survives perspective where orthogonality does not.
 */
function basisVectors(edges: Pt[]): { u: Pt; v: Pt } | null {
  if (edges.length < 4) return null
  const buckets = new Map<number, Pt[]>()
  for (const e of edges) {
    let a = Math.atan2(e.y, e.x)
    if (a < 0) a += Math.PI
    const key = Math.round(a / (Math.PI / 36))
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(e)
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)
  if (!ranked.length) return null

  const repr = (family: Pt[]): Pt => {
    const ref = family[0]!
    const aligned = family.map((e) => (e.x * ref.x + e.y * ref.y < 0 ? { x: -e.x, y: -e.y } : e))
    const step = oneStep(aligned.map(len))
    const near = aligned.filter((e) => Math.abs(len(e) - step) < step * 0.35)
    const pick = near.length ? near : aligned
    return {
      x: pick.reduce((s, e) => s + e.x, 0) / pick.length,
      y: pick.reduce((s, e) => s + e.y, 0) / pick.length,
    }
  }
  const u = repr(ranked[0]![1])
  const floor = Math.max(3, ranked[0]![1].length * 0.08)
  let second: Pt | null = null
  let shortest = Infinity
  for (const [, family] of ranked.slice(1)) {
    if (family.length < floor) continue
    const v = repr(family)
    const cos = Math.abs((u.x * v.x + u.y * v.y) / (len(u) * len(v)))
    if (cos < 0.5 && len(v) < shortest) {
      shortest = len(v)
      second = v
    }
  }
  return second ? { u, v: second } : null
}

export interface LatticeFit {
  /** Image -> lattice index space. */
  H: H
  /** Per input point; null = off the lattice. (0,0) is the top-left square. */
  indices: ({ i: number; j: number } | null)[]
  cols: number
  rows: number
  assigned: number
  residual: number
}

/** Fit a lattice to detected square centres, or null when there is none. */
export function fitLattice(points: Pt[], { minPoints = 8, tol = 0.34 } = {}): LatticeFit | null {
  if (!points || points.length < minPoints) return null

  // Eight neighbours, not six: on a 2-column sheet the squares two and three
  // rows away are nearer than the other column, and at six the horizontal
  // never entered the buckets.
  const K = 8
  const neighbours = points.map((p, idx) =>
    points
      .map((q, k) => ({ k, dist: k === idx ? Infinity : len(sub(q, p)) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, K),
  )
  const edges: Pt[] = []
  neighbours.forEach((ns, idx) => ns.forEach((n) => edges.push(sub(points[n.k]!, points[idx]!))))

  const basis = basisVectors(edges)
  if (!basis) return null
  const { u, v } = basis
  const det = u.x * v.y - u.y * v.x
  if (Math.abs(det) < 1e-9) return null
  const decompose = (e: Pt) => ({ a: (e.x * v.y - e.y * v.x) / det, b: (u.x * e.y - u.y * e.x) / det })

  // Walk the grid from the most central point, assigning integer indices.
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  let seed = 0
  points.forEach((p, k) => {
    if (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(points[seed]!.x - cx, points[seed]!.y - cy)) seed = k
  })

  const idx: ({ i: number; j: number } | null)[] = new Array(points.length).fill(null)
  idx[seed] = { i: 0, j: 0 }
  const queue = [seed]
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of neighbours[cur]!) {
      if (idx[n.k]) continue
      const { a, b } = decompose(sub(points[n.k]!, points[cur]!))
      const ri = Math.round(a)
      const rj = Math.round(b)
      if (Math.abs(a - ri) > tol || Math.abs(b - rj) > tol) continue
      if (Math.abs(ri) > 1 || Math.abs(rj) > 1 || (ri === 0 && rj === 0)) continue
      idx[n.k] = { i: idx[cur]!.i + ri, j: idx[cur]!.j + rj }
      queue.push(n.k)
    }
  }

  const assigned = idx.flatMap((v2, k) => (v2 ? [k] : []))
  if (assigned.length < minPoints) return null

  let minI = Infinity
  let minJ = Infinity
  let maxI = -Infinity
  let maxJ = -Infinity
  for (const k of assigned) {
    minI = Math.min(minI, idx[k]!.i)
    maxI = Math.max(maxI, idx[k]!.i)
    minJ = Math.min(minJ, idx[k]!.j)
    maxJ = Math.max(maxJ, idx[k]!.j)
  }
  // Orient i along the more horizontal axis.
  const swap = Math.abs(u.x) < Math.abs(u.y)
  for (const k of assigned) {
    const i = idx[k]!.i - minI
    const j = idx[k]!.j - minJ
    idx[k] = swap ? { i: j, j: i } : { i, j }
  }
  let cols = maxI - minI + 1
  let rows = maxJ - minJ + 1
  if (swap) [cols, rows] = [rows, cols]

  // Flip an axis that runs backwards, so (0,0) is the top-left square. A
  // CENTRED covariance: summing `x * i` is always positive, never fired, and
  // let a mirrored lattice through while every unit test passed.
  const cov = (coord: (p: Pt) => number, index: (v2: { i: number; j: number }) => number) => {
    const a = assigned.map((k) => coord(points[k]!))
    const b = assigned.map((k) => index(idx[k]!))
    const ma = a.reduce((s, x) => s + x, 0) / a.length
    const mb = b.reduce((s, x) => s + x, 0) / b.length
    return a.reduce((s, x, n) => s + (x - ma) * (b[n]! - mb), 0)
  }
  if (cov((p) => p.x, (v2) => v2.i) < 0) for (const k of assigned) idx[k] = { ...idx[k]!, i: cols - 1 - idx[k]!.i }
  if (cov((p) => p.y, (v2) => v2.j) < 0) for (const k of assigned) idx[k] = { ...idx[k]!, j: rows - 1 - idx[k]!.j }

  const src = assigned.map((k) => points[k]!)
  const dst = assigned.map((k) => ({ x: idx[k]!.i, y: idx[k]!.j }))
  const h = solveHomographyLS(src, dst)
  if (!h) return null

  let worst = 0
  for (let k = 0; k < src.length; k++) {
    const got = applyH(h, src[k]!.x, src[k]!.y)
    worst = Math.max(worst, Math.hypot(got.x - dst[k]!.x, got.y - dst[k]!.y))
  }
  return { H: h, indices: idx, cols, rows, assigned: assigned.length, residual: worst }
}
