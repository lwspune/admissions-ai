import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { sendContactMessage, listContactMessages, unreadContactCount, markContactRead } from './contact'

// The homepage's contact messages (migration 0017), against the real database.
//
// A visitor has no session, so a message is written on service role — and the
// only things standing between that and a flood are the CHECKs and the rate
// trigger, which is why they are tested here rather than mocked. Reading is a
// policy: superadmin only, and a service-role test proves nothing about a
// policy, so each role gets a throwaway login and its own anon-key client.
//
// Marker: every row this file writes has a name starting NAME. Cleanup is by
// that (service role; the table has no delete policy for anyone else).

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'contacttest-'
const NAME = 'ContactTest'
const anonKey = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

async function signIn(role: string): Promise<SupabaseClient> {
  const email = `${PREFIX}${role}-${Date.now()}@example.com`
  const { error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } })
  if (error) throw new Error(`could not create ${role}: ${error.message}`)
  const db = anonKey()
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`)
  return db
}

async function cleanup() {
  await svc.from('contact_messages').delete().like('name', `${NAME}%`)
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) await svc.auth.admin.deleteUser(u.id)
}

const message = (tag: string) => ({ name: `${NAME} ${tag}`, phone: '98765 43210', email: '', message: `Hello from ${tag}` })

let superadmin: SupabaseClient
let counsellor: SupabaseClient
let telecaller: SupabaseClient
let messageId: string

beforeAll(async () => {
  await cleanup()
  superadmin = await signIn('superadmin')
  counsellor = await signIn('counsellor')
  telecaller = await signIn('telecaller')

  expect(await sendContactMessage(svc, message('seed'), '192.0.2.10')).toEqual({ ok: true })
  const { data } = await svc.from('contact_messages').select('id').eq('name', `${NAME} seed`).single()
  messageId = data!.id
})

afterAll(cleanup)

describe('sending a message', () => {
  it('stores the normalised fields, unread', async () => {
    const { data } = await svc.from('contact_messages').select('*').eq('id', messageId).single()
    expect(data).toMatchObject({ name: `${NAME} seed`, phone: '9876543210', email: null, message: 'Hello from seed', ip: '192.0.2.10', read_at: null })
  })

  it('refuses invalid input before writing anything', async () => {
    const r = await sendContactMessage(svc, { ...message('invalid'), phone: '', email: '' }, '192.0.2.11')
    expect(r.ok).toBe(false)
    const { count } = await svc.from('contact_messages').select('id', { count: 'exact', head: true }).eq('name', `${NAME} invalid`)
    expect(count).toBe(0)
  })
})

describe('the database refuses a bad row on its own', () => {
  it.each([
    ['no way to reply', { phone: null, email: null }],
    ['a phone that is not a mobile', { phone: '12345' }],
    ['an email with no domain', { email: 'a@b' }],
    ['a blank name', { name: '   ' }],
    ['an overlong message', { message: 'm'.repeat(2001) }],
  ] as [string, Record<string, unknown>][])('%s', async (_label, patch) => {
    const row: Record<string, unknown> = { name: `${NAME} raw`, phone: '9876543210', email: null, message: 'hi', ...patch }
    const { error } = await svc.from('contact_messages').insert(row)
    expect(error).not.toBeNull()
  })
})

describe('reading messages is superadmin only', () => {
  it('refuses an anonymous visitor both reading and writing', async () => {
    const anon = anonKey()
    const { data } = await anon.from('contact_messages').select('id')
    expect(data ?? []).toEqual([])
    const { error } = await anon.from('contact_messages').insert({ name: `${NAME} anon`, phone: '9876543210', message: 'hi' })
    expect(error).not.toBeNull()
  })

  for (const role of ['counsellor', 'telecaller'] as const) {
    it(`shows a ${role} nothing, and lets them mark nothing`, async () => {
      const db = role === 'counsellor' ? counsellor : telecaller
      expect(await listContactMessages(db)).toEqual([])
      expect(await unreadContactCount(db)).toBe(0)
      expect((await markContactRead(db, messageId, true)).ok).toBe(false)
      const { data } = await svc.from('contact_messages').select('read_at').eq('id', messageId).single()
      expect(data!.read_at).toBeNull()
    })
  }

  it('shows superadmin the message and counts it unread', async () => {
    const list = await listContactMessages(superadmin)
    expect(list.find((m) => m.id === messageId)).toMatchObject({ name: `${NAME} seed`, phone: '9876543210', readAt: null })
    expect(await unreadContactCount(superadmin)).toBeGreaterThanOrEqual(1)
  })

  it('lets superadmin mark it read and unread', async () => {
    expect((await markContactRead(superadmin, messageId, true)).ok).toBe(true)
    let row = (await svc.from('contact_messages').select('read_at').eq('id', messageId).single()).data!
    expect(row.read_at).not.toBeNull()

    expect((await markContactRead(superadmin, messageId, false)).ok).toBe(true)
    row = (await svc.from('contact_messages').select('read_at').eq('id', messageId).single()).data!
    expect(row.read_at).toBeNull()
  })

  it('does not let superadmin rewrite what a visitor sent, or delete it', async () => {
    const { error } = await superadmin.from('contact_messages').update({ message: 'rewritten' }).eq('id', messageId)
    expect(error).not.toBeNull()
    await superadmin.from('contact_messages').delete().eq('id', messageId)
    const { data } = await svc.from('contact_messages').select('message').eq('id', messageId).single()
    expect(data!.message).toBe('Hello from seed')
  })
})

describe('the rate limit, counted in the database', () => {
  it('takes five messages an hour from one address and refuses the sixth', async () => {
    const ip = '192.0.2.99'
    for (let i = 1; i <= 5; i++) {
      expect(await sendContactMessage(svc, message(`rate ${i}`), ip)).toEqual({ ok: true })
    }
    const sixth = await sendContactMessage(svc, message('rate 6'), ip)
    expect(sixth.ok).toBe(false)
    expect(!sixth.ok && sixth.error).toMatch(/too many/i)
    // Another address is unaffected.
    expect(await sendContactMessage(svc, message('rate other'), '192.0.2.100')).toEqual({ ok: true })
  })

  // An address can be absent (an unparseable header) or forged, so the
  // per-address limit alone is no ceiling. Thirty an hour across everyone is.
  it('refuses everyone once thirty have arrived in the hour', async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await svc.from('contact_messages').select('id', { count: 'exact', head: true }).gt('created_at', since)
    for (let i = count ?? 0; i < 30; i++) {
      expect(await sendContactMessage(svc, message(`global ${i}`), null)).toEqual({ ok: true })
    }
    const over = await sendContactMessage(svc, message('global over'), null)
    expect(over.ok).toBe(false)
  })
})
