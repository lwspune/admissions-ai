import { describe, it, expect } from 'vitest'
import { parseMathText, mathErrors, renderTex } from './mathText'

// Hiring questions come from PYQ Vault, which stores maths as LaTeX zones in
// plain text. This is the subset of its parser (src/components/math/parseLatex.ts
// there) that the imported pool uses: the four delimiters, an escaped dollar,
// **bold**, and an underlined word stored as a maths zone.
describe('parseMathText', () => {
  it('splits text from inline maths', () => {
    expect(parseMathText(String.raw`If \(x^2 = 4\), find x.`)).toEqual([
      { type: 'text', content: 'If ' },
      { type: 'inline', content: 'x^2 = 4' },
      { type: 'text', content: ', find x.' },
    ])
  })

  it('reads display maths in both delimiters', () => {
    expect(parseMathText(String.raw`\[a+b\]`)).toEqual([{ type: 'block', content: 'a+b' }])
    expect(parseMathText('$$a+b$$')).toEqual([{ type: 'block', content: 'a+b' }])
  })

  it('reads single-dollar maths, but an escaped dollar is a dollar sign', () => {
    expect(parseMathText('cost $x$ each')).toEqual([
      { type: 'text', content: 'cost ' },
      { type: 'inline', content: 'x' },
      { type: 'text', content: ' each' },
    ])
    expect(parseMathText(String.raw`It costs \$5.`)).toEqual([{ type: 'text', content: 'It costs $5.' }])
  })

  it('keeps a | inside maths as maths', () => {
    expect(parseMathText(String.raw`\(|x| < 1\)`)).toEqual([{ type: 'inline', content: '|x| < 1' }])
  })

  it('marks **bold** runs, including maths inside them', () => {
    expect(parseMathText(String.raw`**order \(n\)** only`)).toEqual([
      { type: 'text', content: 'order ', bold: true },
      { type: 'inline', content: 'n', bold: true },
      { type: 'text', content: ' only' },
    ])
  })

  it('turns an underlined word stored as maths into an underline run', () => {
    // CDS English marks the phrase to improve this way.
    expect(parseMathText(String.raw`The children \(\underline{\text{circumnavigated around}}\) the lake.`)).toEqual([
      { type: 'text', content: 'The children ' },
      { type: 'underline', content: 'circumnavigated around' },
      { type: 'text', content: ' the lake.' },
    ])
  })

  it('returns nothing for empty text', () => {
    expect(parseMathText('')).toEqual([])
  })
})

describe('renderTex', () => {
  // A display equation in KaTeX's display mode never wraps, so on a phone
  // the end of a long one sat off-screen ("… + CH3CHO +", hiding "HCl").
  it('draws display maths at display size but able to wrap between terms', () => {
    const html = renderTex(String.raw`A + N_{2} + CH_{3}CHO + HCl`, true)
    expect(html).not.toContain('katex-display')
    expect((html.match(/class="base"/g) ?? []).length).toBeGreaterThan(1)
    // \displaystyle keeps display-size symbols: a sum is KaTeX's large operator.
    expect(renderTex(String.raw`\sum_{k=1}^{n} k`, true)).toContain('large-op')
  })

  it('draws inline maths as inline, at text size', () => {
    expect(renderTex('x^2', false)).not.toContain('katex-display')
    expect(renderTex(String.raw`\sum_{k=1}^{n} k`, false)).not.toContain('large-op')
  })
})

describe('mathErrors', () => {
  it('passes text whose maths KaTeX can draw', () => {
    expect(mathErrors(String.raw`\(\frac{1}{2}\) and \[\sqrt{x}\]`)).toEqual([])
  })

  it('names maths KaTeX cannot draw', () => {
    const errors = mathErrors(String.raw`fine \(x\) broken \(\frac{1}{\)`)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(String.raw`\frac{1}{`)
  })

  it('passes plain text', () => {
    expect(mathErrors('No maths here.')).toEqual([])
  })
})
