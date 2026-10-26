import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { importLeads } from './leadImport'
import type { StaffUser } from './auth'

// GoPost's leads arriving hourly (migration 0025), against the real database.
// `import_feed_page` is service role's only: the hourly route has no session.
// It files each row under the source the row names, merges by the same rule as
// a sheet import (that rule now lives once, in internal.merge_lead_rows), and
// moves the feed's cursor in the same transaction.
//
// Marker: numbers 97000012xx, the feed FEED, sources named SOURCE_PREFIX…, so
// the real `gopost` feed and its sources are never touched.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'feedtest-'
const FEED = 'itest_feed'
const SOURCE_PREFIX = 'ITest GoPost'
const mobile = (n: number) => `97000012${String(n).padStart(2, '0')}`

interface Session {
  id: string
  db: SupabaseClient
}

async function signIn(role: StaffUser['role'], tag: string): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role, name: `Feed ${tag}` },
  })
  if (error) throw new Error(`could not create ${role}: ${error.message}`)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`)
  return { id: data.user.id, db }
}

async function cleanup() {
  await svc.from('leads').delete().like('contact_mobile', '97000012%')
  await svc.from('lead_sources').delete().like('name', `${SOURCE_PREFIX}%`)
  await svc.from('lead_feeds').delete().eq('name', FEED)
}

async function removeUsers() {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) await svc.auth.admin.deleteUser(u.id)
}

let counsellor: Session
let telecaller: Session

beforeAll(async () => {
  await cleanup()
  await removeUsers()
  counsellor = await signIn('counsellor', 'c')
  telecaller = await signIn('telecaller', 't')
})
beforeEach(async () => {
  await cleanup()
  const { error } = await svc.from('lead_feeds').insert({ name: FEED })
  if (error) throw new Error(`could not create the feed: ${error.message}`)
})
afterAll(async () => {
  await cleanup()
  await removeUsers()
})

const row = (n: number, over: Record<string, unknown> = {}) => ({
  mobile: mobile(n),
  name: null,
  stage: null,
  interest: null,
  source_date: '2026-10-20',
  notes: [`note ${n}`],
  source: `${SOURCE_PREFIX} · Instagram`,
  ...over,
})

const importPage = (from: string | null, next: string | null, rows: object[], dryRun = false, db: SupabaseClient = svc) =>
  db.rpc('import_feed_page', { p_feed: FEED, p_from: from, p_next: next, p_rows: rows, p_dry_run: dryRun })

const feed = async () => (await svc.from('lead_feeds').select('*').eq('name', FEED).single()).data!

describe('a page from the feed', () => {
  it('adds new leads as New under the source each row names, and moves the cursor with them', async () => {
    const { data, error } = await importPage(null, 'c1', [
      row(1, { name: 'Feed One', interest: 'NDA' }),
      row(2, { source: `${SOURCE_PREFIX} · Website` }),
    ])
    expect(error).toBeNull()
    expect(data).toEqual({ created: 2, merged: 0, ambiguous: [] })

    const { data: one } = await svc
      .from('leads')
      .select('name, stage, interest, assigned_to, lead_origins(source_date, lead_sources(name)), lead_comments(kind, body, author)')
      .eq('contact_mobile', mobile(1))
      .single()
    expect(one).toMatchObject({
      name: 'Feed One',
      stage: 'new',
      interest: 'NDA',
      assigned_to: null,
      lead_origins: [{ source_date: '2026-10-20', lead_sources: { name: `${SOURCE_PREFIX} · Instagram` } }],
      lead_comments: [{ kind: 'import', body: 'note 1', author: null }],
    })
    const { data: two } = await svc.from('leads').select('lead_origins(lead_sources(name))').eq('contact_mobile', mobile(2)).single()
    expect(two).toMatchObject({ lead_origins: [{ lead_sources: { name: `${SOURCE_PREFIX} · Website` } }] })

    expect(await feed()).toMatchObject({ cursor: 'c1', last_error: null, last_result: { created: 2, merged: 0, ambiguous: [] } })
    expect((await feed()).last_synced_at).not.toBeNull()
  })

  it('adds to an existing lead without touching its stage, assignment or name', async () => {
    const { data: existing } = await svc
      .from('leads')
      .insert({ contact_mobile: mobile(3), name: 'Kept Name', stage: 'in_eis', assigned_to: telecaller.id })
      .select('id')
      .single()
    const { data } = await importPage(null, 'c1', [row(3, { name: 'Other', interest: 'SPI' })])
    expect(data).toEqual({ created: 0, merged: 1, ambiguous: [] })

    const { data: after } = await svc
      .from('leads')
      .select('name, stage, assigned_to, interest, lead_comments(body)')
      .eq('id', existing!.id)
      .single()
    expect(after).toMatchObject({
      name: 'Kept Name',
      stage: 'in_eis',
      assigned_to: telecaller.id,
      interest: 'SPI',
      lead_comments: [{ body: 'note 3' }],
    })
  })

  it('leaves a number shared by siblings alone and reports it', async () => {
    await svc.from('leads').insert([
      { contact_mobile: mobile(4), name: 'Sibling One' },
      { contact_mobile: mobile(4), name: 'Sibling Two' },
    ])
    const { data } = await importPage(null, 'c1', [row(4), row(5)])
    expect(data).toEqual({ created: 1, merged: 0, ambiguous: [mobile(4)] })
  })

  it('refuses a page that does not start where the feed stopped, adding nothing', async () => {
    await importPage(null, 'c1', [row(6)])
    const { error } = await importPage('stale', 'c2', [row(7)])
    expect(error?.message).toMatch(/cursor/i)
    const { count } = await svc.from('leads').select('id', { count: 'exact', head: true }).eq('contact_mobile', mobile(7))
    expect(count).toBe(0)
    expect((await feed()).cursor).toBe('c1')
  })

  it('marks the feed synced and clears its error when nothing is new', async () => {
    await svc.rpc('record_feed_error', { p_feed: FEED, p_error: 'GoPost answered 500' })
    expect((await feed()).last_error).toBe('GoPost answered 500')
    const { error } = await importPage(null, null, [])
    expect(error).toBeNull()
    expect(await feed()).toMatchObject({ cursor: null, last_error: null })
  })

  it('counts on a dry run without writing a lead, a source or the cursor', async () => {
    await svc.from('leads').insert({ contact_mobile: mobile(8), name: 'Existing' })
    const { data } = await importPage(null, 'c1', [row(8), row(9, { source: `${SOURCE_PREFIX} · Dry` })], true)
    expect(data).toEqual({ created: 1, merged: 1, ambiguous: [] })
    const { count } = await svc.from('leads').select('id', { count: 'exact', head: true }).eq('contact_mobile', mobile(9))
    expect(count).toBe(0)
    const { count: sources } = await svc.from('lead_sources').select('id', { count: 'exact', head: true }).eq('name', `${SOURCE_PREFIX} · Dry`)
    expect(sources).toBe(0)
    expect(await feed()).toMatchObject({ cursor: null, last_synced_at: null })
  })

  it('is all or nothing: one bad row writes none of the page and leaves the cursor', async () => {
    const { error } = await importPage(null, 'c1', [row(10), row(11, { mobile: '12345' })])
    expect(error).not.toBeNull()
    const { count } = await svc.from('leads').select('id', { count: 'exact', head: true }).eq('contact_mobile', mobile(10))
    expect(count).toBe(0)
    expect((await feed()).cursor).toBeNull()
  })
})

describe('who may touch the feed', () => {
  it('refuses a counsellor importing a page, and lets them read how the feed is doing', async () => {
    const { error } = await importPage(null, 'c1', [row(12)], false, counsellor.db)
    expect(error).not.toBeNull()
    const { data } = await counsellor.db.from('lead_feeds').select('name, last_error').eq('name', FEED)
    expect(data).toEqual([{ name: FEED, last_error: null }])
  })

  it('shows a telecaller nothing of the feed', async () => {
    const { data } = await telecaller.db.from('lead_feeds').select('name').eq('name', FEED)
    expect(data).toEqual([])
    const { error } = await telecaller.db.from('lead_feeds').update({ cursor: 'x' }).eq('name', FEED)
    const after = await feed()
    expect(error === null ? after.cursor : null).toBeNull()
  })

  it('still lets a counsellor import a sheet, through the same merge rule', async () => {
    const { data: src } = await svc.from('lead_sources').insert({ name: `${SOURCE_PREFIX} sheet` }).select('id').single()
    const result = await importLeads(counsellor.db, src!.id, [
      { mobile: mobile(13), name: 'Sheet Lead', stage: null, interest: null, sourceDate: null, notes: ['from a sheet'], sheetRows: [2] },
    ])
    expect(result).toEqual({ created: 1, merged: 0, ambiguous: [] })
  })
})
