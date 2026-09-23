import { describe, it, expect, afterAll } from 'vitest'
import { serviceClient } from './supabase'
import { listStaff, addStaff, changeStaffRole, renameStaff, removeStaff } from './staff'
import type { StaffUser } from './auth'

// Account management runs on the service-role admin API — Supabase offers no
// other way to create a login — so the superadmin check in src/server/staff.ts
// is the only thing between a telecaller and minting themselves a superadmin.
// That is why the refusals are tested against the real auth server, not a mock.

const db = serviceClient()
const PREFIX = 'stafftest-'
const email = (tag: string) => `${PREFIX}${tag}-${Date.now()}@example.com`

const superadmin: StaffUser = { id: 'itest-superadmin', name: null, email: 'sa@example.com', role: 'superadmin' }
const telecaller: StaffUser = { id: 'itest-telecaller', name: null, email: 'tc@example.com', role: 'telecaller' }
const counsellor: StaffUser = { id: 'itest-counsellor', name: null, email: 'co@example.com', role: 'counsellor' }

async function findUser(address: string) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === address)
}

afterAll(async () => {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) {
    await db.auth.admin.deleteUser(u.id)
  }
})

describe('the superadmin gate', () => {
  for (const actor of [telecaller, counsellor]) {
    it(`refuses a ${actor.role} every operation`, async () => {
      await expect(listStaff(actor)).rejects.toThrow()

      const address = email(`gate-${actor.role}`)
      const added = await addStaff(actor, { name: 'Test Person', email: address, password: 'longenough', role: 'superadmin' })
      expect(added.ok).toBe(false)
      expect(await findUser(address)).toBeUndefined()
    })
  }

  it('refuses a non-superadmin a role change, rename or removal of an existing account', async () => {
    const address = email('gate-target')
    expect((await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })).ok).toBe(true)
    const target = (await findUser(address))!

    expect((await changeStaffRole(telecaller, target.id, 'superadmin')).ok).toBe(false)
    expect((await renameStaff(telecaller, target.id, 'Hijacked')).ok).toBe(false)
    expect((await removeStaff(counsellor, target.id)).ok).toBe(false)

    const after = (await findUser(address))!
    expect(after.app_metadata.role).toBe('telecaller')
    expect(after.app_metadata.name).toBe('Test Person')
  })
})

describe('addStaff', () => {
  it('creates a confirmed account with the role in app_metadata, never user_metadata', async () => {
    const address = email('add')
    const result = await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'counsellor' })
    expect(result.ok).toBe(true)

    const user = (await findUser(address))!
    expect(user.app_metadata.role).toBe('counsellor')
    expect(user.app_metadata.name).toBe('Test Person')
    expect(user.user_metadata?.role).toBeUndefined()
    expect(user.user_metadata?.name).toBeUndefined()
    expect(user.email_confirmed_at).toBeTruthy()
  })

  it('refuses an account with no name', async () => {
    const address = email('noname')
    const result = await addStaff(superadmin, { name: '   ', email: address, password: 'longenough', role: 'counsellor' })
    expect(result.ok).toBe(false)
    expect(await findUser(address)).toBeUndefined()
  })

  it('rejects invalid input before calling the auth server', async () => {
    expect((await addStaff(superadmin, { name: 'Test Person', email: 'nope', password: 'longenough', role: 'counsellor' })).ok).toBe(false)
    expect((await addStaff(superadmin, { name: 'Test Person', email: email('bad'), password: 'short', role: 'counsellor' })).ok).toBe(false)
    expect((await addStaff(superadmin, { name: 'Test Person', email: email('bad'), password: 'longenough', role: 'admin' })).ok).toBe(false)
  })

  it('reports an email that already has an account in plain words', async () => {
    const address = email('dup')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    const again = await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    expect(again).toEqual({ ok: false, error: 'An account with this email already exists.' })
  })
})

describe('listStaff', () => {
  it('lists accounts with their role for a superadmin', async () => {
    const address = email('list')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    const staff = await listStaff(superadmin)
    const row = staff.find((s) => s.email === address)
    expect(row?.role).toBe('telecaller')
    expect(row?.name).toBe('Test Person')
  })
})

describe('changeStaffRole', () => {
  it('moves the role in app_metadata', async () => {
    const address = email('role')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    const target = (await findUser(address))!

    expect((await changeStaffRole(superadmin, target.id, 'counsellor')).ok).toBe(true)
    expect((await findUser(address))!.app_metadata.role).toBe('counsellor')
  })

  it('refuses a role outside the allow-list', async () => {
    const address = email('badrole')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    const target = (await findUser(address))!

    expect((await changeStaffRole(superadmin, target.id, 'service_role')).ok).toBe(false)
    expect((await findUser(address))!.app_metadata.role).toBe('telecaller')
  })

  it('refuses a change to your own account', async () => {
    expect((await changeStaffRole(superadmin, superadmin.id, 'telecaller')).ok).toBe(false)
  })
})

describe('renameStaff', () => {
  it('changes the name and leaves the role alone', async () => {
    const address = email('rename')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'counsellor' })
    const target = (await findUser(address))!

    expect((await renameStaff(superadmin, target.id, '  Ravi   Nagpurkar ')).ok).toBe(true)
    const after = (await findUser(address))!
    expect(after.app_metadata.name).toBe('Ravi Nagpurkar')
    expect(after.app_metadata.role).toBe('counsellor')
  })

  it('refuses a blank name', async () => {
    const address = email('rename-blank')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'counsellor' })
    const target = (await findUser(address))!

    expect((await renameStaff(superadmin, target.id, '  ')).ok).toBe(false)
    expect((await findUser(address))!.app_metadata.name).toBe('Test Person')
  })

  it('lets a superadmin name their own account — a name protects nothing', async () => {
    const address = email('rename-self')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'superadmin' })
    const self = (await findUser(address))!
    const actor: StaffUser = { id: self.id, name: null, email: address, role: 'superadmin' }

    expect((await renameStaff(actor, self.id, 'Own Name')).ok).toBe(true)
    expect((await findUser(address))!.app_metadata.name).toBe('Own Name')
  })
})

describe('removeStaff', () => {
  it('deletes the account', async () => {
    const address = email('rm')
    await addStaff(superadmin, { name: 'Test Person', email: address, password: 'longenough', role: 'telecaller' })
    const target = (await findUser(address))!

    expect((await removeStaff(superadmin, target.id)).ok).toBe(true)
    expect(await findUser(address)).toBeUndefined()
  })

  it('refuses to remove your own account', async () => {
    expect((await removeStaff(superadmin, superadmin.id)).ok).toBe(false)
  })
})
