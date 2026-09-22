import 'server-only'
import type { NextRequest } from 'next/server'

/**
 * Client IP as the platform reports it.
 *
 * Behind Vercel, x-forwarded-for is a chain and the FIRST entry is the client.
 * Taking the last would record the proxy and make per-IP limiting useless.
 * Spoofable in principle; it is a rate-limit input and a forensic hint, never
 * an authorisation decision.
 */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')
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
