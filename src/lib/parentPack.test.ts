import { describe, it, expect } from 'vitest'
import { parentPackPath, parentPackUrl, issueMessage, packMessage } from './parentPack'

describe('parentPackPath', () => {
  it('names the PDF the parent-pack build writes for that class', () => {
    expect(parentPackPath(10)).toBe('/parent-pack/reasoning-test-class-10.pdf')
    expect(parentPackPath(8)).toBe('/parent-pack/reasoning-test-class-8.pdf')
  })
})

describe('parentPackUrl', () => {
  it('puts the PDF on the same site as the test link', () => {
    expect(parentPackUrl('https://admissions.example/t/AbCdEfGhIjKlMnOpQrStUv', 12)).toBe(
      'https://admissions.example/parent-pack/reasoning-test-class-12.pdf',
    )
  })
})

describe('issueMessage', () => {
  const testUrl = 'https://admissions.example/t/AbCdEfGhIjKlMnOpQrStUv'

  it('keeps the test link first, so WhatsApp previews the test', () => {
    const message = issueMessage({ name: 'Asha', testUrl, classLevel: 10 })
    expect(message.indexOf(testUrl)).toBeLessThan(message.indexOf('/parent-pack/'))
    expect(message.startsWith('Hello, this is the aptitude test link for Asha.')).toBe(true)
  })

  it('adds the syllabus and sample paper for the admitting class on its own line', () => {
    expect(issueMessage({ name: 'Asha', testUrl, classLevel: 10 })).toBe(
      'Hello, this is the aptitude test link for Asha. Please open it and hand the phone to them. ' +
        `The link works for 3 hours: ${testUrl}\n\n` +
        'Syllabus and a sample paper for the Class 10 test: ' +
        'https://admissions.example/parent-pack/reasoning-test-class-10.pdf',
    )
  })

  it('leaves the PDF out when the class is unknown, rather than sending a wrong one', () => {
    const message = issueMessage({ name: 'Asha', testUrl, classLevel: null })
    expect(message).not.toContain('parent-pack')
    expect(message.endsWith(testUrl)).toBe(true)
  })
})

describe('packMessage', () => {
  it('is the same syllabus line the issue message ends with, for sending on its own', () => {
    const line = packMessage('https://admissions.example', 9)
    expect(line).toBe(
      'Syllabus and a sample paper for the Class 9 test: https://admissions.example/parent-pack/reasoning-test-class-9.pdf',
    )
    expect(issueMessage({ name: 'Asha', testUrl: 'https://admissions.example/t/AbCdEfGhIjKlMnOpQrStUv', classLevel: 9 }).endsWith(line)).toBe(true)
  })
})

// 2026-10-11: each class's sheet has a Hindi edition beside it. Staff send it
// from /downloads; the issue message still sends the English one.
describe('the Hindi edition', () => {
  it('sits beside the English PDF, with -hi before the extension', () => {
    expect(parentPackPath(10, 'hi')).toBe('/parent-pack/reasoning-test-class-10-hi.pdf')
    expect(parentPackPath(10, 'en')).toBe(parentPackPath(10))
  })

  it('is linked on the same site', () => {
    expect(parentPackUrl('https://admissions.example', 8, 'hi')).toBe(
      'https://admissions.example/parent-pack/reasoning-test-class-8-hi.pdf',
    )
  })

  it('is sent with a Hindi line naming the class', () => {
    expect(packMessage('https://admissions.example', 9, 'hi')).toBe(
      'कक्षा 9 की परीक्षा का पाठ्यक्रम और नमूना प्रश्नपत्र (हिंदी): https://admissions.example/parent-pack/reasoning-test-class-9-hi.pdf',
    )
  })

  it('never changes the issue message, which sends the English PDF', () => {
    const message = issueMessage({ name: 'Asha', testUrl: 'https://admissions.example/t/AbCdEfGhIjKlMnOpQrStUv', classLevel: 9 })
    expect(message).not.toContain('-hi.pdf')
  })
})
