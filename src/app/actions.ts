'use server'

import { headers } from 'next/headers'
import { parseClientIp } from '@/lib/ip'
import { serviceClient } from '@/server/supabase'
import { sendContactMessage, type ContactResult } from '@/server/contact'

// The homepage's contact form. A visitor has no session, so this writes on
// service role, as the candidate API does; the CHECKs and the rate trigger on
// contact_messages (migration 0017) are what hold the line, not this file.

/**
 * Null before anything is sent. A refusal carries back what was typed: React
 * resets the form after its action, which would otherwise empty every box.
 */
export type ContactState = (ContactResult & { values?: Record<string, string> }) | null

export async function sendContactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  // A field hidden from people and left in for bots. Filled in means a bot:
  // tell it the message went, and store nothing.
  if (String(form.get('website') ?? '') !== '') return { ok: true }

  const h = await headers()
  const ip = parseClientIp(h.get('x-forwarded-for')) ?? parseClientIp(h.get('x-real-ip'))

  const values = {
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    email: String(form.get('email') ?? ''),
    message: String(form.get('message') ?? ''),
  }
  const result = await sendContactMessage(serviceClient(), values, ip)
  return result.ok ? result : { ...result, values }
}
