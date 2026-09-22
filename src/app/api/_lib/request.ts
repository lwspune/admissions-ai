import 'server-only'
import type { NextRequest } from 'next/server'
import { parseClientIp } from '@/lib/ip'

/**
 * Client IP as the platform reports it, validated.
 *
 * The value lands in a Postgres `inet` column, and a malformed one fails the
 * INSERT that starts an attempt — so an unvalidated header could stop a
 * candidate sitting the test. Anything unparseable becomes null.
 *
 * Spoofable in principle; this is a rate-limit input and a forensic hint,
 * never an authorisation decision.
 */
export function clientIp(req: NextRequest): string | null {
  return parseClientIp(req.headers.get('x-forwarded-for')) ?? parseClientIp(req.headers.get('x-real-ip'))
}
export function userAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent')?.slice(0, 500) ?? null
}

/** Uniform error body, so the client never has to guess the shape. */
export function fail(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status })
}

export function ok<T extends object>(body: T) {
  return Response.json({ ok: true, ...body })
}
