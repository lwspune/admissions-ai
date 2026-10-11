import { Mark, Skeleton, card, cx } from './ui'

/**
 * What a staff page shows while its data loads (each page is dynamic, so a
 * navigation otherwise sits on the old page with no sign anything happened).
 * It draws the frame's outline without the session, which loading.tsx cannot read.
 */
export function StaffLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="min-h-screen" aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-6 px-4">
          <Mark labelClassName="hidden sm:inline" />
          <Skeleton className="hidden h-4 w-72 md:block" />
          <Skeleton className="ml-auto h-9 w-9 rounded-full" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-3 h-4 w-64" />
        <div className={cx(card, 'mt-6 divide-y divide-slate-100')}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="hidden h-8 w-24 rounded-lg sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
