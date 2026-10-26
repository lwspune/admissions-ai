import { describe, it, expect } from 'vitest'
import { initials } from './initials'

// An avatar's letters. Names come from Instagram and WhatsApp as people typed
// them, emoji and all (2026-10-26: "🕊️vicky m…" broke the page's hydration,
// since its first UTF-16 unit is half an emoji).

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Ansh Rajpoot')).toBe('AR')
    expect(initials('sagar')).toBe('S')
    expect(initials('  Vinayak   sonu kengale ')).toBe('VS')
  })

  it('skips emoji and symbols, so it never splits a character in two', () => {
    expect(initials('🕊️vicky mehra')).toBe('VM')
    expect(initials('@sumit__2106')).toBe('S')
    expect(initials('💔 🙏')).toBe('')
    for (const name of ['🕊️vicky', '😀😀 a']) {
      expect([...initials(name)].every((c) => !/[\uD800-\uDFFF]/.test(c))).toBe(true)
    }
  })

  it('keeps letters of any script, and digits', () => {
    expect(initials('अधुरं प्रेम')).toBe('अप')
    expect(initials('12th pass')).toBe('1P')
  })

  it('is empty for no name', () => {
    expect(initials(null)).toBe('')
    expect(initials('   ')).toBe('')
  })
})
