'use client'

import { useActionState } from 'react'
import { CONTACT_LIMITS } from '@/lib/contact'
import { Alert, btn, cx, hint, input, label } from '@/components/ui'
import { sendContactAction, type ContactState } from './actions'

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactAction, null)

  if (state?.ok) {
    return (
      <Alert tone="success" role="status">
        <p className="font-medium">Thank you. Your message has been sent.</p>
        <p className="mt-0.5">We will reply on the number or email you gave.</p>
      </Alert>
    )
  }

  const errors = state && !state.ok ? (state.errors ?? {}) : {}
  const typed = state?.values ?? {}
  const field = (name: keyof typeof errors) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  })
  const error = (name: keyof typeof errors) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-sm text-rose-700">
        {errors[name]}
      </p>
    ) : null
  // A variant, so it outranks the border colour `input` already sets.
  const box = cx(input, 'aria-[invalid=true]:border-rose-500')
  // Keyed on the state, so a refusal re-mounts the boxes with what was typed.
  const formKey = state ? JSON.stringify(typed) : 'empty'

  return (
    <form key={formKey} action={action} noValidate className="space-y-4">
      {state && !state.ok && (
        <Alert tone="danger" role="alert">
          {state.error}
        </Alert>
      )}

      <div>
        <label htmlFor="name" className={label}>
          Name
        </label>
        <input id="name" name="name" autoComplete="name" defaultValue={typed.name} required maxLength={CONTACT_LIMITS.name} className={box} {...field('name')} />
        {error('name')}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={label}>
            Phone
          </label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={typed.phone} className={box} {...field('phone')} />
          {error('phone')}
        </div>
        <div>
          <label htmlFor="email" className={label}>
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={typed.email} maxLength={CONTACT_LIMITS.email} className={box} {...field('email')} />
          {error('email')}
        </div>
      </div>
      {!errors.phone && <p className={cx(hint, '-mt-2')}>A phone number or an email is enough.</p>}

      <div>
        <label htmlFor="message" className={label}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          defaultValue={typed.message}
          required
          maxLength={CONTACT_LIMITS.message}
          placeholder="Your institute, your city, and what you would like to know."
          className={cx(box, 'resize-y')}
          {...field('message')}
        />
        {error('message')}
      </div>

      {/* For bots only: hidden from sight and from screen readers, never tabbed to. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={btn('primary', 'lg')}>
          {pending ? 'Sending…' : 'Send message'}
        </button>
        <p className="text-xs text-slate-600">We use these details only to reply to you.</p>
      </div>
    </form>
  )
}
