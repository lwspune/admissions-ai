import { Icon, type IconName } from '@/components/icons'
import { Mark, card, cx } from '@/components/ui'

export const STEPS = 2

/**
 * The frame for every candidate screen before and after the test: the mark on
 * the brand band, and one card. No institute name — the parent sheet carries
 * none either.
 */
export function Shell({
  title,
  icon,
  tone = 'brand',
  step,
  stepLabel,
  aside,
  children,
}: {
  title: string
  icon: IconName
  tone?: 'brand' | 'success' | 'warning'
  /** 1–2 on the steps before the test; absent on the end screens. */
  step?: number
  /** "Step 1 of 2" in the screen's language; English when absent. */
  stepLabel?: string
  /** On the band beside the mark: the language switch, when the paper has Hindi. */
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-brand-gradient pb-20 pt-5 text-white">
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 px-4">
          <Mark onDark />
          <div className="flex items-center gap-3">
            {step && <p className="text-sm font-medium text-indigo-100">{stepLabel ?? `Step ${step} of ${STEPS}`}</p>}
            {aside}
          </div>
        </div>
      </div>

      <main className="mx-auto -mt-14 w-full max-w-md flex-1 px-4 pb-10">
        <div className={cx(card, 'p-6 shadow-raised sm:p-7')}>
          {step && (
            <div aria-hidden="true" className="mb-6 grid grid-cols-2 gap-1.5">
              {Array.from({ length: STEPS }, (_, i) => (
                <span key={i} className={cx('h-1.5 rounded-full', i < step ? 'bg-brand-600' : 'bg-slate-200')} />
              ))}
            </div>
          )}
          <span
            className={cx(
              'grid h-12 w-12 place-items-center rounded-2xl',
              tone === 'success'
                ? 'bg-emerald-100 text-emerald-700'
                : tone === 'warning'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-brand-50 text-brand-700',
            )}
          >
            <Icon name={icon} className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  )
}
