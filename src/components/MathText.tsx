import 'katex/dist/katex.min.css'
import { Fragment } from 'react'
import { parseMathText, renderTex } from '@/lib/mathText'
import { cx } from './ui'

/**
 * Question text with its maths drawn by KaTeX on the server, so no maths code
 * reaches the browser. Text renders as React text, escaped as usual; the one
 * HTML set directly is KaTeX's own output, which escapes the source it is
 * given and, with `trust` off (its default), refuses links and raw HTML.
 * An equation KaTeX cannot draw shows as its source rather than breaking the
 * page; `hiring:seed` refuses those before they get here.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {parseMathText(text).map((run, i) => {
        let node: React.ReactNode
        if (run.type === 'text') node = <span className="whitespace-pre-wrap">{run.content}</span>
        else if (run.type === 'underline') node = <u>{run.content}</u>
        else node = <Tex tex={run.content} block={run.type === 'block'} />
        return run.bold ? <strong key={i}>{node}</strong> : <Fragment key={i}>{node}</Fragment>
      })}
    </span>
  )
}

function Tex({ tex, block }: { tex: string; block: boolean }) {
  let html: string
  try {
    html = renderTex(tex, block)
  } catch {
    return <code className="text-rose-700">{tex}</code>
  }
  return (
    <span
      className={cx(block && 'my-2 block overflow-x-auto overflow-y-hidden py-1 text-center')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
