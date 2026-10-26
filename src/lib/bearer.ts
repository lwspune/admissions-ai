import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison of a presented `Authorization: Bearer` token, for
 * the routes that open without a session and guard themselves.
 *
 * `===` on a secret leaks its prefix through timing. The length check first is
 * unavoidable — timingSafeEqual throws on mismatched lengths — and reveals
 * only the length, which is not the secret. No secret configured is closed.
 */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false
  const presented = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}
