import { describe, it, expect } from 'vitest'
import { orgFor, orgName, withOrg } from './orgs'

const PUNE = 'b31b8575-91c2-434a-b025-a7d12d3c0988'
const DELHI = '787f94d7-8d1b-4c45-a11d-b85916b7ccff'
const ORGS = [
  { id: PUNE, name: 'LWS Pune' },
  { id: DELHI, name: 'LWS Delhi' },
]

describe('orgFor', () => {
  it('takes the org superadmin names, if it is one', () => {
    expect(orgFor('superadmin', DELHI, PUNE, ORGS)).toBe(DELHI)
  })

  it('falls back to superadmin’s own org when none or an unknown one is named', () => {
    expect(orgFor('superadmin', '', PUNE, ORGS)).toBe(PUNE)
    expect(orgFor('superadmin', 'not-an-org', PUNE, ORGS)).toBe(PUNE)
    expect(orgFor('superadmin', null, PUNE, ORGS)).toBe(PUNE)
  })

  it('gives anyone else their own org, whatever they send', () => {
    expect(orgFor('counsellor', DELHI, PUNE, ORGS)).toBe(PUNE)
    expect(orgFor('teacher', DELHI, PUNE, ORGS)).toBe(PUNE)
    expect(orgFor('counsellor', DELHI, null, ORGS)).toBeNull()
  })
})

describe('orgName', () => {
  it('names a known org, and says so for an unknown one', () => {
    expect(orgName(ORGS, DELHI)).toBe('LWS Delhi')
    expect(orgName(ORGS, null)).toBe('No org')
    expect(orgName(ORGS, '00000000-0000-0000-0000-000000000000')).toBe('No org')
  })
})

describe('withOrg', () => {
  it('adds the org to a label for superadmin, who sees every org', () => {
    expect(withOrg('Priya', DELHI, ORGS)).toBe('Priya · LWS Delhi')
  })

  it('leaves the label alone when there is nothing to tell apart', () => {
    expect(withOrg('Priya', DELHI, [])).toBe('Priya')
    expect(withOrg('Priya', DELHI, [ORGS[1]!])).toBe('Priya')
  })
})
