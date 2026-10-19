import katex from 'katex'

// Question text with LaTeX in it, as PYQ Vault stores it (the hiring bank's
// source). A port of the subset of PYQ Vault's parser that the imported pool
// uses — src/components/math/parseLatex.ts and underlineBypass.ts in that repo,
// where the patterns are measured against its whole bank. Kept here rather
// than shared: the two apps deploy separately.
//
// Pure: the page decides how to draw a run; KaTeX is only asked whether it can.

export type MathRun = {
  type: 'text' | 'inline' | 'block' | 'underline'
  content: string
  bold?: true
}

/**
 * `\$` (a dollar sign), `\[…\]`, `$$…$$`, `\(…\)`, `$…$`. Display delimiters
 * come first so they win at the same position; a single-dollar zone stays on
 * one line and may not close on an escaped dollar.
 */
const MATH_PATTERN = /(\\\$|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\$(?:[^$\n\\]|\\[^$\n])+?\$)/g
const ESCAPED_DOLLAR = '\\$'

/**
 * An underlined word is stored as a maths zone, `\(\underline{\text{word}}\)`.
 * Drawn by KaTeX it changes typeface mid-sentence, so it becomes an underline.
 */
const UNDERLINE = /^\s*\\underline\{\s*\\(?:text|textit)\{([^{}]+)\}\s*\}\s*$/

// Private-use code points never appear in question text, so a masked zone
// cannot collide with anything real.
const OPEN = String.fromCharCode(0xe000)
const CLOSE = String.fromCharCode(0xe001)
const MASK = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g')

type Zone = Omit<MathRun, 'bold'>

function zoneOf(raw: string): Zone {
  if (raw.startsWith('\\[') || raw.startsWith('$$')) return { type: 'block', content: raw.slice(2, -2).trim() }
  const content = (raw.startsWith('\\(') ? raw.slice(2, -2) : raw.slice(1, -1)).trim()
  const u = UNDERLINE.exec(content)
  return u?.[1] ? { type: 'underline', content: u[1] } : { type: 'inline', content }
}

export function parseMathText(input: string): MathRun[] {
  if (!input) return []

  // Mask the maths first, so a ** inside an equation cannot open bold, and
  // bold is resolved on the masked text, so a bold span may hold maths.
  const zones: Zone[] = []
  const masked = input.replace(MATH_PATTERN, (raw) => {
    if (raw === ESCAPED_DOLLAR) return '$'
    zones.push(zoneOf(raw))
    return `${OPEN}${zones.length - 1}${CLOSE}`
  })

  const runs: MathRun[] = []
  const push = (run: Zone, bold: boolean) => {
    const last = runs[runs.length - 1]
    if (run.type === 'text' && last?.type === 'text' && !!last.bold === bold) {
      last.content += run.content
      return
    }
    runs.push(bold ? { ...run, bold: true } : { ...run })
  }
  const emit = (text: string, bold: boolean) => {
    let last = 0
    for (const m of text.matchAll(MASK)) {
      if (m.index > last) push({ type: 'text', content: text.slice(last, m.index) }, bold)
      const zone = zones[Number(m[1])]
      if (zone) push(zone, bold)
      last = m.index + m[0].length
    }
    if (last < text.length) push({ type: 'text', content: text.slice(last) }, bold)
  }

  let last = 0
  for (const m of masked.matchAll(/\*\*([\s\S]+?)\*\*/g)) {
    if (m.index > last) emit(masked.slice(last, m.index), false)
    emit(m[1] ?? '', true)
    last = m.index + m[0].length
  }
  if (last < masked.length) emit(masked.slice(last), false)
  return runs
}

/**
 * Render one zone to HTML. KaTeX escapes its input, so the markup is safe to set.
 *
 * Display maths is drawn in inline mode under \displaystyle: the same large
 * symbols, but able to break between terms. KaTeX's display mode never wraps,
 * so on a phone the end of a long equation sat off-screen. The page centres it
 * on its own line.
 */
export function renderTex(tex: string, block: boolean): string {
  const source = block ? `\\displaystyle ${tex}` : tex
  return katex.renderToString(source, { displayMode: false, throwOnError: true, strict: false, output: 'html' })
}

/** Every maths zone in the text that KaTeX refuses, quoted. Empty when all draw. */
export function mathErrors(input: string): string[] {
  const errors: string[] = []
  for (const run of parseMathText(input)) {
    if (run.type !== 'inline' && run.type !== 'block') continue
    try {
      renderTex(run.content, run.type === 'block')
    } catch (e) {
      errors.push(`${run.content}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return errors
}
