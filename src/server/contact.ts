import 'server-only'
import type { Db } from './supabase'
import { parseContact, type ContactErrors, type ContactInput } from '../lib/contact'

// The homepage's contact messages (migration 0017).
//
// sendContactMessage runs on service role: a visitor has no session, the same
// reason the candidate API has. Everything else takes the session-bound
// client, so RLS decides that only superadmin reads — a counsellor calling
// these gets an empty list, not an error.

export type ContactResult = { ok: true } | { ok: false; error: string; errors?: ContactErrors }

export interface ContactMessageRow {
  id: string
  createdAt: string
  name: string
  phone: string | null
  email: string | null
  message: string
  readAt: string | null
}

/** Newest first. Messages are never deleted; this many is plenty to read through. */
const LIST_LIMIT = 200

export async function sendContactMessage(
  db: Db,
  input: Record<keyof ContactInput, unknown>,
  ip: string | null,
): Promise<ContactResult> {
  const parsed = parseContact(input)
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', errors: parsed.errors }

  const { error } = await db.from('contact_messages').insert({ ...parsed.value, ip })
  if (error) {
    if (error.message.includes('contact_rate_limited')) {
      return { ok: false, error: 'Too many messages just now. Please try again in an hour.' }
    }
    console.error('contact: send failed:', error)
    return { ok: false, error: 'Your message could not be sent. Please try again.' }
  }
  return { ok: true }
}

export async function listContactMessages(db: Db): Promise<ContactMessageRow[]> {
  const { data, error } = await db
    .from('contact_messages')
    .select('id, created_at, name, phone, email, message, read_at')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) {
    console.error('contact: list failed:', error)
    throw new Error('Could not load messages.')
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    name: r.name,
    phone: r.phone,
    email: r.email,
    message: r.message,
    readAt: r.read_at,
  }))
}

/** For the nav badge. Zero for anyone RLS shows nothing to. */
export async function unreadContactCount(db: Db): Promise<number> {
  const { count, error } = await db.from('contact_messages').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) {
    console.error('contact: unread count failed:', error)
    return 0
  }
  return count ?? 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function markContactRead(db: Db, id: string, read: boolean): Promise<{ ok: boolean }> {
  if (!UUID.test(id)) return { ok: false }
  // .select() returns the rows actually updated: RLS turns a refused update
  // into zero rows, not an error, and zero must not read as success.
  const { data, error } = await db
    .from('contact_messages')
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) {
    console.error('contact: mark read failed:', error)
    return { ok: false }
  }
  return { ok: (data ?? []).length === 1 }
}
