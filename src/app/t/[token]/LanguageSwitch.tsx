'use client'

import type { Lang } from '@/lib/hindi'
import { LANG_LABEL } from '@/lib/candidateText'
import { cx } from '@/components/ui'

const LANGS: Lang[] = ['en', 'hi']

/**
 * English or Hindi, as two pressed-or-not buttons. Each name is written in its
 * own language, so a candidate who reads only one can still find it. Shown
 * only on a paper whose maths and science questions all have a Hindi version.
 */
export function LanguageSwitch({
  lang,
  label,
  onChange,
  onDark = false,
}: {
  lang: Lang
  /** The group's accessible name, in the current language. */
  label: string
  onChange: (lang: Lang) => void
  /** On the brand band before the test, rather than the white test header. */
  onDark?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex rounded-full p-0.5 ring-1 ring-inset',
        onDark ? 'bg-white/10 ring-white/30' : 'bg-slate-100 ring-slate-200',
      )}
    >
      {LANGS.map((l) => {
        const pressed = l === lang
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={pressed}
            onClick={() => onChange(l)}
            className={cx(
              'min-h-tap rounded-full px-3 text-sm sm:px-3.5 font-semibold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2',
              onDark ? 'focus-visible:outline-white' : 'focus-visible:outline-brand-700',
              pressed
                ? onDark
                  ? 'bg-white text-brand-800'
                  : 'bg-white text-brand-800 shadow-sm'
                : onDark
                  ? 'text-indigo-50 hover:bg-white/10'
                  : 'text-slate-700 hover:text-slate-900',
            )}
          >
            {LANG_LABEL[l]}
          </button>
        )
      })}
    </div>
  )
}
