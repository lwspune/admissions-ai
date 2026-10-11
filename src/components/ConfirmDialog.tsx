'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { btn } from './ui'

interface Ask {
  title: string
  body: string
  confirm: string
  danger?: boolean
}

/**
 * A styled stand-in for window.confirm. The native <dialog> keeps focus
 * inside, closes on Escape and returns focus to the button that opened it, so
 * none of that is reimplemented here.
 */
export function useConfirm() {
  const ref = useRef<HTMLDialogElement>(null)
  const settle = useRef<((ok: boolean) => void) | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)

  useEffect(() => {
    if (ask && !ref.current?.open) ref.current?.showModal()
  }, [ask])

  const confirm = useCallback(
    (next: Ask) =>
      new Promise<boolean>((resolve) => {
        settle.current = resolve
        setAsk(next)
      }),
    [],
  )

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-raised backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
      onClose={() => {
        settle.current?.(ref.current?.returnValue === 'confirm')
        settle.current = null
        setAsk(null)
      }}
    >
      {ask && (
        <form method="dialog" className="p-6">
          <div className="flex gap-4">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                ask.danger ? 'bg-rose-100 text-rose-700' : 'bg-brand-100 text-brand-700'
              }`}
            >
              <Icon name={ask.danger ? 'alert' : 'info'} className="h-5 w-5" />
            </span>
            <div>
              <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                {ask.title}
              </h2>
              <p id="confirm-body" className="mt-1 text-sm leading-relaxed text-slate-600">
                {ask.body}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button value="cancel" className={btn('secondary')} autoFocus>
              Cancel
            </button>
            <button value="confirm" className={ask.danger ? btn('danger') : btn('primary')}>
              {ask.confirm}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )

  return { confirm, dialog }
}
