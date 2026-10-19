import { describe, it, expect } from 'vitest'
import {
  validateNewStaff,
  validateName,
  checkChangeTarget,
  MIN_PASSWORD,
  MAX_NAME,
  ROLES,
  ROLE_LABEL,
  canManageLeads,
  isAdmissionsStaff,
  canHire,
  homeFor,
  roleMayOpen,
} from './staff'

describe('validateNewStaff', () => {
  const good = { name: 'Priya Sharma', email: 'priya@institute.in', password: 'longenough', role: 'counsellor' }

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

describe('validateName', () => {
  it('accepts a name and trims it', () => {
    expect(validateName('  Ravi Nagpurkar ')).toEqual({ ok: true, value: 'Ravi Nagpurkar' })
  })

  it('collapses runs of whitespace — a pasted name often carries a double space or a tab', () => {
    expect(validateName('Ravi \t  Nagpurkar')).toEqual({ ok: true, value: 'Ravi Nagpurkar' })
  })

  it('rejects an empty or whitespace-only name', () => {
    for (const name of ['', '   ', '\t\n']) expect(validateName(name).ok).toBe(false)
  })

  it(`rejects a name longer than ${MAX_NAME} characters`, () => {
    expect(validateName('x'.repeat(MAX_NAME)).ok).toBe(true)
    expect(validateName('x'.repeat(MAX_NAME + 1)).ok).toBe(false)
  })
})

describe('validateNewStaff requires a name', () => {
  const good = { name: 'Priya Sharma', email: 'priya@institute.in', password: 'longenough', role: 'counsellor' }

  it('rejects a missing name', () => {
    expect(validateNewStaff({ ...good, name: '  ' }).ok).toBe(false)
  })

  it('stores the cleaned name', () => {
    const result = validateNewStaff({ ...good, name: ' Priya   Sharma ' })
    expect(result.ok && result.value.name).toBe('Priya Sharma')
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

// The teacher role (2026-10-19): hiring and nothing else. Admissions checks
// are allow-lists, so a role added later is refused until someone says otherwise.
describe('roles', () => {
  it('knows the teacher role, which an account can be created with', () => {
    expect(ROLES).toContain('teacher')
    expect(ROLE_LABEL.teacher).toBe('Teacher')
    expect(validateNewStaff({ name: 'T', email: 't@x.in', password: 'longenough', role: 'teacher' }).ok).toBe(true)
  })

  it('lets only counsellors and superadmin manage leads', () => {
    expect(ROLES.filter(canManageLeads)).toEqual(['counsellor', 'superadmin'])
  })

  it('counts telecallers, counsellors and superadmin as admissions staff, never a teacher', () => {
    expect(ROLES.filter(isAdmissionsStaff)).toEqual(['telecaller', 'counsellor', 'superadmin'])
  })

  it('lets teachers and superadmin hire', () => {
    expect(ROLES.filter(canHire)).toEqual(['superadmin', 'teacher'])
  })

  it('sends a teacher home to /hiring and everyone else to /leads', () => {
    expect(homeFor('teacher')).toBe('/hiring')
    for (const r of ['telecaller', 'counsellor', 'superadmin'] as const) expect(homeFor(r)).toBe('/leads')
  })
})

describe('roleMayOpen', () => {
  it('keeps a teacher on /hiring', () => {
    expect(roleMayOpen('teacher', '/hiring')).toBe(true)
    expect(roleMayOpen('teacher', '/hiring/3f2a')).toBe(true)
    for (const p of ['/leads', '/leads/import', '/reports/x', '/scan', '/staff', '/downloads', '/items', '/messages', '/hiringx', '/api/anything']) {
      expect(roleMayOpen('teacher', p)).toBe(false)
    }
  })

  it('leaves admissions staff where they were', () => {
    for (const r of ['telecaller', 'counsellor', 'superadmin'] as const) expect(roleMayOpen(r, '/leads')).toBe(true)
  })

  it('refuses /hiring to telecallers and counsellors', () => {
    expect(roleMayOpen('telecaller', '/hiring')).toBe(false)
    expect(roleMayOpen('counsellor', '/hiring/x')).toBe(false)
    expect(roleMayOpen('superadmin', '/hiring')).toBe(true)
  })

  it('refuses a session with no known role everything', () => {
    expect(roleMayOpen(undefined, '/leads')).toBe(false)
    expect(roleMayOpen('owner', '/hiring')).toBe(false)
  })
})
