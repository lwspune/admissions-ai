// The homepage's contact form: what a message must hold before it is stored.
// The same limits are CHECKs on contact_messages (migration 0017); this is the
// fail-fast copy, so a visitor sees which field is wrong.

import { normalizeMobile } from './mobile'

/** Mirrors the CHECKs on contact_messages. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 2000 } as const

export interface ContactInput {
  name: string
  phone: string
  email: string
  message: string
}

export interface ContactMessage {
  name: string
  phone: string | null
  email: string | null
  message: string
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>

export type ParsedContact = { ok: true; value: ContactMessage } | { ok: false; errors: ContactErrors }

/** Mirrors the CHECK on contact_messages.email: something, an @, a dotted domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Postgres text cannot hold NUL, and one would fail the insert as a server error.
const text = (v: unknown) => (typeof v === 'string' ? v.replaceAll(String.fromCharCode(0), '').trim() : '')

export function parseContact(input: Record<keyof ContactInput, unknown>): ParsedContact {
  const name = text(input.name)
  const rawPhone = text(input.phone)
  const email = text(input.email).toLowerCase()
  const message = text(input.message)
  const errors: ContactErrors = {}

  if (!name) errors.name = 'Enter your name.'
  else if (name.length > CONTACT_LIMITS.name) errors.name = `Keep your name under ${CONTACT_LIMITS.name} characters.`

  const phone = rawPhone ? normalizeMobile(rawPhone) : null
  if (rawPhone && !phone) errors.phone = 'Enter a 10-digit mobile number.'

  if (email && (email.length > CONTACT_LIMITS.email || !EMAIL.test(email))) errors.email = 'Enter a valid email address.'

  if (!rawPhone && !email) errors.phone = 'Give a phone number or an email, so we can reply.'

  if (!message) errors.message = 'Write a message.'
  else if (message.length > CONTACT_LIMITS.message) {
    errors.message = `Keep the message under ${CONTACT_LIMITS.message} characters.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, phone, email: email || null, message } }
}
