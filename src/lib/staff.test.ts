import { describe, it, expect } from 'vitest'
import { validateNewStaff, checkChangeTarget, MIN_PASSWORD } from './staff'

describe('validateNewStaff', () => {
  const good = { email: 'priya@institute.in', password: 'longenough', role: 'counsellor' }

  it('accepts a well-formed account', () => {
    expect(validateNewStaff(good)).toEqual({ ok: true, value: good })
  })

  it('trims and lower-cases the email — people paste with stray spaces and capitals', () => {
    const result = validateNewStaff({ ...good, email: '  Priya@Institute.IN ' })
    expect(result).toEqual({ ok: true, value: { ...good, email: 'priya@institute.in' } })
  })

  it('rejects an email with no @ or no domain', () => {
    for (const email of ['', 'priya', 'priya@', '@institute.in', 'priya@institute', 'a b@x.in']) {
      expect(validateNewStaff({ ...good, email }).ok).toBe(false)
    }
  })

  it('rejects any role outside the allow-list', () => {
    for (const role of ['', 'admin', 'Superadmin', 'service_role']) {
      expect(validateNewStaff({ ...good, role }).ok).toBe(false)
    }
  })

  it(`rejects a password shorter than ${MIN_PASSWORD} characters`, () => {
    expect(validateNewStaff({ ...good, password: 'x'.repeat(MIN_PASSWORD - 1) }).ok).toBe(false)
    expect(validateNewStaff({ ...good, password: 'x'.repeat(MIN_PASSWORD) }).ok).toBe(true)
  })

  it('does not trim the password — a space is a legitimate character in one', () => {
    const result = validateNewStaff({ ...good, password: ' spaced pass ' })
    expect(result).toEqual({ ok: true, value: { ...good, password: ' spaced pass ' } })
  })
})

describe('checkChangeTarget', () => {
  it('allows a superadmin to change someone else', () => {
    expect(checkChangeTarget('me', 'them')).toEqual({ ok: true })
  })

  it('refuses a change to your own account', () => {
    // This is also what keeps at least one superadmin in existence: the actor
    // is a superadmin and can never remove or demote themselves.
    expect(checkChangeTarget('me', 'me').ok).toBe(false)
  })
})
