import { describe, it, expect } from 'vitest'
import { liveInitial, liveStep, sheetSignature, type LiveRead, type LiveState } from './liveCapture'

// Ported from nda-tracker (src/lib/omr/__tests__/liveCapture.test.js). There a
// sheet's identity is a bubbled roll number; here it is the printed paper
// number, so "the same student twice" becomes "the same paper twice".

const ok = (o: Partial<LiveRead> = {}): LiveRead => ({
  ok: true,
  complete: true,
  reviewCount: 0,
  paperNo: 470318,
  answers: { 1: 'A', 2: 'C', 3: 12.5 },
  ...o,
})
const bad = (reason = 'Only 3 registration marks found — is the whole sheet in frame?'): LiveRead => ({
  ok: false,
  reason,
})

function run(frames: LiveRead[], opts?: { minAgree?: number; clearFrames?: number }) {
  let state: LiveState = liveInitial()
  return frames.map((f) => {
    const step = liveStep(state, f, opts)
    state = step.state
    return step
  })
}

describe('sheetSignature', () => {
  it('is the same for two reads of the same filled sheet', () => {
    expect(sheetSignature(ok())).toBe(sheetSignature(ok()))
  })

  it('differs when a single answer differs, a numeric one included', () => {
    expect(sheetSignature(ok())).not.toBe(sheetSignature(ok({ answers: { 1: 'A', 2: 'D', 3: 12.5 } })))
    expect(sheetSignature(ok())).not.toBe(sheetSignature(ok({ answers: { 1: 'A', 2: 'C', 3: 12.6 } })))
  })

  it('differs when the paper differs', () => {
    expect(sheetSignature(ok())).not.toBe(sheetSignature(ok({ paperNo: 470319 })))
  })

  it('is null for a frame with no sheet in it', () => {
    expect(sheetSignature(bad())).toBeNull()
  })
})

describe('liveStep', () => {
  it('does not file a sheet off one frame', () => {
    const [first] = run([ok()])
    expect(first!.accept).toBeNull()
    expect(first!.phase).toBe('holding')
  })

  it('files it when two consecutive frames read identically', () => {
    const steps = run([ok(), ok()])
    expect(steps[1]!.accept?.paperNo).toBe(470318)
    expect(steps[1]!.phase).toBe('accepted')
  })

  it('starts counting again when the second frame disagrees', () => {
    const other = ok({ answers: { 1: 'B', 2: 'C', 3: 12.5 } })
    const steps = run([ok(), other, other])
    expect(steps[1]!.accept).toBeNull()
    expect(steps[2]!.accept?.answers?.[1]).toBe('B')
  })

  it('will not file the same sheet twice while it stays in frame', () => {
    expect(run([ok(), ok(), ok(), ok()]).filter((s) => s.accept).length).toBe(1)
  })

  it('takes the next sheet once the last one has left the frame', () => {
    const next = ok({ paperNo: 470400 })
    const steps = run([ok(), ok(), bad(), bad(), bad(), next, next])
    expect(steps.filter((s) => s.accept).length).toBe(2)
    expect(steps[6]!.accept?.paperNo).toBe(470400)
  })

  it('does not treat one lost frame as the sheet leaving', () => {
    expect(run([ok(), ok(), bad(), ok(), ok()]).filter((s) => s.accept).length).toBe(1)
  })

  it('refuses a paper it has already filed in this session', () => {
    const steps = run([ok(), ok(), bad(), bad(), bad(), ok(), ok()])
    expect(steps.filter((s) => s.accept).length).toBe(1)
    expect(steps[6]!.phase).toBe('duplicate')
    expect(steps[6]!.message).toMatch(/already/i)
  })

  it('never files a sheet that still needs a human', () => {
    const unsure = ok({ complete: false, reviewCount: 1 })
    const steps = run([unsure, unsure])
    expect(steps[1]!.accept).toBeNull()
    expect(steps[1]!.phase).toBe('review')
    expect(steps[1]!.message).toMatch(/1 question/)
  })

  it('passes the reader’s reason through as the message', () => {
    const [step] = run([bad('The paper number could not be read.')])
    expect(step!.phase).toBe('hunting')
    expect(step!.message).toMatch(/paper number/)
  })

  it('says to hold still once it has a candidate', () => {
    expect(run([ok()])[0]!.message).toMatch(/hold/i)
  })

  it('does not mutate the state it was given', () => {
    const state = liveInitial()
    liveStep(state, ok())
    expect(state).toEqual(liveInitial())
  })

  it('honours a stricter agreement requirement', () => {
    const steps = run([ok(), ok(), ok()], { minAgree: 3 })
    expect(steps[1]!.accept).toBeNull()
    expect(steps[2]!.accept).not.toBeNull()
  })
})
