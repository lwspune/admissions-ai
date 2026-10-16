import { describe, it, expect } from 'vitest'
import { fitLattice, solveHomographyLS, applyH, type H } from './gridFit'
import { buildAnswerSheetLayout } from './layout'

// Ported from nda-tracker (src/lib/omr/__tests__/gridFit.test.js). Synthetic
// grids, because the ground truth has to be known — a photo can only tell you
// it looked wrong.

const PHOTO_H: H = [38, 2.5, 120, -3, 41, 90, 0.006, 0.01, 1]

function makeGrid(cols: number, rows: number, h: H = PHOTO_H) {
  const pts: { x: number; y: number; i: number; j: number }[] = []
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push({ ...applyH(h, i, j), i, j })
  return pts
}
const strip = (pts: { x: number; y: number }[]) => pts.map(({ x, y }) => ({ x, y }))

describe('solveHomographyLS', () => {
  it('recovers an exact transform from four points', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const h = solveHomographyLS(
      src,
      src.map((p) => applyH(PHOTO_H, p.x, p.y)),
    )!
    for (const p of src) {
      const got = applyH(h, p.x, p.y)
      const want = applyH(PHOTO_H, p.x, p.y)
      expect(got.x).toBeCloseTo(want.x, 4)
      expect(got.y).toBeCloseTo(want.y, 4)
    }
  })

  it('uses ALL correspondences, so one bad point cannot dominate', () => {
    const src: { x: number; y: number }[] = []
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) src.push({ x: i, y: j })
    const dst = src.map((p) => applyH(PHOTO_H, p.x, p.y))
    dst[12] = { x: dst[12]!.x + 6, y: dst[12]!.y - 6 }
    const h = solveHomographyLS(src, dst)!
    const errs = src.map((p, k) => {
      const got = applyH(h, p.x, p.y)
      return Math.hypot(got.x - dst[k]!.x, got.y - dst[k]!.y)
    })
    expect(Math.max(...errs.filter((_, k) => k !== 12))).toBeLessThan(2)
  })
})

describe('fitLattice', () => {
  it('recovers a full grid and indexes every square', () => {
    const pts = makeGrid(5, 11)
    const fit = fitLattice(strip(pts))!
    expect(fit.cols).toBe(5)
    expect(fit.rows).toBe(11)
    expect(fit.assigned).toBe(55)
    pts.forEach((p, k) => expect(fit.indices[k]).toEqual({ i: p.i, j: p.j }))
  })

  it('survives the corner square being missing — the failure that started this', () => {
    const kept = makeGrid(5, 11).filter(
      (p) => !(p.i === 0 && p.j === 0) && !(p.i === 4 && p.j === 0) && !(p.i === 0 && p.j === 5),
    )
    const fit = fitLattice(strip(kept))!
    expect(fit.cols).toBe(5)
    expect(fit.rows).toBe(11)
    expect(fit.assigned).toBe(kept.length)
    kept.forEach((p, k) => expect(fit.indices[k]).toEqual({ i: p.i, j: p.j }))
  })

  it('handles a lattice whose columns are far wider apart than its rows', () => {
    const fit = fitLattice(strip(makeGrid(4, 7, [86, 3, 110, -4, 41, 80, 0.004, 0.008, 1])))!
    expect(fit.cols).toBe(4)
    expect(fit.rows).toBe(7)
    expect(fit.assigned).toBe(28)
  })

  it('orients the lattice so i grows rightwards and j downwards', () => {
    for (const h of [
      PHOTO_H,
      [-38, 2.5, 700, 3, 41, 90, -0.006, 0.01, 1] as H,
      [38, 2.5, 120, -3, -41, 700, 0.006, -0.01, 1] as H,
    ]) {
      const pts = strip(makeGrid(4, 6, h))
      const fit = fitLattice(pts)!
      const cov = (a: number[], b: number[]) => {
        const ma = a.reduce((s, v) => s + v, 0) / a.length
        const mb = b.reduce((s, v) => s + v, 0) / b.length
        return a.reduce((s, v, k) => s + (v - ma) * (b[k]! - mb), 0)
      }
      const idx = fit.indices.map((v) => v!)
      expect(cov(pts.map((p) => p.x), idx.map((v) => v.i))).toBeGreaterThan(0)
      expect(cov(pts.map((p) => p.y), idx.map((v) => v.j))).toBeGreaterThan(0)
    }
  })

  it('tolerates detection jitter', () => {
    let seed = 7
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5
    const fit = fitLattice(makeGrid(5, 11).map((p) => ({ x: p.x + rand() * 2.5, y: p.y + rand() * 2.5 })))!
    expect(fit.cols).toBe(5)
    expect(fit.rows).toBe(11)
  })

  it('rejects blobs that are not on the lattice', () => {
    const pts = strip(makeGrid(5, 11))
    const withJunk = [...pts, { x: 600, y: 40 }, { x: 30, y: 700 }, { x: 410, y: 705 }, { x: 12, y: 12 }]
    const fit = fitLattice(withJunk)!
    expect(fit.cols).toBe(5)
    expect(fit.rows).toBe(11)
    for (let k = pts.length; k < withJunk.length; k++) expect(fit.indices[k]).toBeNull()
  })

  it('maps the grid onto a clean unit lattice', () => {
    const pts = strip(makeGrid(4, 7))
    const fit = fitLattice(pts)!
    pts.forEach((p, k) => {
      const got = applyH(fit.H, p.x, p.y)
      expect(got.x).toBeCloseTo(fit.indices[k]!.i, 3)
      expect(got.y).toBeCloseTo(fit.indices[k]!.j, 3)
    })
    expect(fit.residual).toBeLessThan(0.02)
  })

  it('gives up rather than inventing a grid from too few points', () => {
    expect(
      fitLattice([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBeNull()
    expect(fitLattice([])).toBeNull()
  })

  it('gives up on points with no lattice structure at all', () => {
    let seed = 3
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const scatter = Array.from({ length: 30 }, () => ({ x: rand() * 500, y: rand() * 700 }))
    const fit = fitLattice(scatter)
    expect(fit === null || fit.assigned < scatter.length * 0.6).toBe(true)
  })
})

describe('fitLattice — the answer sheet this app prints', () => {
  // Every paper test prints the same frame, so one case covers them all; it is
  // the layout's own registration centres, so a failure is pure geometry.
  it('fits the sheet’s 3-column grid and indexes every square', () => {
    const l = buildAnswerSheetLayout(Array.from({ length: 30 }, () => 'mcq' as const))
    const half = l.geometry.registrationSize / 2
    const fit = fitLattice(l.registration.map((s) => ({ x: s.x + half, y: s.y + half })))!
    expect({ cols: fit.cols, rows: fit.rows, assigned: fit.assigned }).toEqual({
      cols: l.grid.cols,
      rows: l.grid.rows,
      assigned: l.registration.length,
    })
  })
})
