// Indian mobile normalisation, applied at every boundary where a number
// arrives — the candidate's identity screen and the staff lead form.
//
// Parents paste numbers out of their contacts app, so the same number arrives
// as "+91 98765 43210", "098765 43210" and "9876543210". Storing and comparing
// the raw string would treat those as three different people.

const VALID = /^[6-9]\d{9}$/

/** Returns the canonical 10-digit form, or null if it is not a valid Indian mobile. */
export function normalizeMobile(input: string): string | null {
  if (typeof input !== 'string') return null

  let digits = input.replace(/\D/g, '')

  // Country code and trunk prefix, longest first.
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4)
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  return VALID.test(digits) ? digits : null
}

/**
 * Whether two spellings denote the same number.
 *
 * Two invalid inputs are never equal. Comparing the normalised values directly
 * would make null === null true, so an empty identity box would match a lead
 * whose number failed to parse.
 */
export function mobilesMatch(a: string, b: string): boolean {
  const na = normalizeMobile(a)
  const nb = normalizeMobile(b)
  return na !== null && nb !== null && na === nb
}
