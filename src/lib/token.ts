// Candidate link tokens.
//
// The token is the only thing between a stranger and a candidate's test, so it
// is generated from a CSPRNG, not Math.random. Web Crypto rather than
// node:crypto, so this module stays importable from any Next.js runtime.

export const TOKEN_LENGTH = 22

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
/** Largest multiple of 62 below 256; bytes at or above it are discarded. */
const REJECT_ABOVE = 248
const SHAPE = new RegExp(`^[0-9A-Za-z]{${TOKEN_LENGTH}}$`)

/** 22 base62 characters — roughly 131 bits. */
export function generateToken(): string {
  let out = ''
  while (out.length < TOKEN_LENGTH) {
    const bytes = new Uint8Array(TOKEN_LENGTH * 2)
    globalThis.crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      // Rejection sampling: 256 is not a multiple of 62, so taking every byte
      // modulo 62 would make the first eight letters of the alphabet more
      // likely than the rest.
      if (byte >= REJECT_ABOVE) continue
      out += ALPHABET[byte % ALPHABET.length]
      if (out.length === TOKEN_LENGTH) break
    }
  }
  return out
}

/**
 * Cheap shape check before a token ever reaches a query. Rejects the obvious
 * injection probes without a database round trip.
 */
export function isValidTokenShape(token: string): boolean {
  return typeof token === 'string' && SHAPE.test(token)
}
