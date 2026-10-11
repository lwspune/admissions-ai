'use client'

import { useRef } from 'react'
import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'
import { ContactForm } from './ContactForm'

/**
 * The homepage's "Get in touch": the contact form in a native <dialog>, which
 * keeps focus inside, closes on Escape and hands focus back to the button, as
 * ConfirmDialog relies on.
 */
export function ContactDialog() {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={btn('primary', 'lg')}>
        Get in touch
      </button>
      <dialog
        ref={ref}
        aria-labelledby="contact-title"
        // A click on the backdrop lands on the dialog itself, never on its contents.
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close()
        }}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-raised backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 id="contact-title" className="text-lg font-semibold text-slate-900">
              Get in touch
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="min-h-tap min-w-tap -mr-2 -mt-2 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
          <ContactForm />
        </div>
      </dialog>
    </>
  )
}
