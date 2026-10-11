import { describe, it, expect } from 'vitest'
import { parseContact, CONTACT_LIMITS } from './contact'

const good = { name: 'Asha Rao', phone: '+91 98765 43210', email: '', message: 'We run a coaching centre in Nashik. Can we see a demo?' }

describe('parseContact', () => {
  it('accepts a message with a phone number, normalising it', () => {
    const r = parseContact(good)
    expect(r).toEqual({
      ok: true,
      value: { name: 'Asha Rao', phone: '9876543210', email: null, message: good.message },
    })
  })

  it('accepts a message with only an email, lower-cased and trimmed', () => {
    const r = parseContact({ ...good, phone: '', email: '  Asha@Example.COM ' })
    expect(r.ok && r.value).toEqual({ name: 'Asha Rao', phone: null, email: 'asha@example.com', message: good.message })
  })

  it('refuses a message with no way to reply', () => {
    const r = parseContact({ ...good, phone: '  ', email: '' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.phone).toMatch(/phone number or an email/i)
  })

  it('refuses a phone number that is not an Indian mobile', () => {
    const r = parseContact({ ...good, phone: '12345' })
    expect(!r.ok && r.errors.phone).toBeTruthy()
  })

  it('refuses an email without a domain', () => {
    const r = parseContact({ ...good, phone: '', email: 'asha@' })
    expect(!r.ok && r.errors.email).toBeTruthy()
  })

  it('refuses an empty name or message', () => {
    const r = parseContact({ ...good, name: '   ', message: '\n ' })
    expect(r.ok).toBe(false)
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['message', 'name'])
  })

  it('refuses text past the limits the database enforces', () => {
    const r = parseContact({ ...good, name: 'a'.repeat(CONTACT_LIMITS.name + 1), message: 'm'.repeat(CONTACT_LIMITS.message + 1) })
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['message', 'name'])
  })

  it('accepts text exactly at the limits', () => {
    const r = parseContact({ ...good, name: 'a'.repeat(CONTACT_LIMITS.name), message: 'm'.repeat(CONTACT_LIMITS.message) })
    expect(r.ok).toBe(true)
  })

  // Postgres text cannot hold NUL; one would fail the insert as a server error.
  it('drops NUL characters rather than failing the insert', () => {
    const r = parseContact({ ...good, name: 'Asha\u0000 Rao', message: 'Hello\u0000 there' })
    expect(r.ok && r.value.name).toBe('Asha Rao')
    expect(r.ok && r.value.message).toBe('Hello there')
  })

  it('treats a missing or non-string field as empty', () => {
    const r = parseContact({ name: null, phone: undefined, email: 42, message: {} } as never)
    expect(r.ok).toBe(false)
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['message', 'name', 'phone'])
  })
})
