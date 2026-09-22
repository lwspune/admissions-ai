import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { recordEvents } from '@/server/attempt'
import { ok } from '../../_lib/request'

const KINDS = ['pause', 'resume', 'paste', 'copy', 'blur', 'focus', 'answer_set', 'nav', 'context']

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''
  const incoming = Array.isArray(body?.events) ? body.events : []

  const events = incoming
    .filter((e: unknown): e is { kind: string } => typeof (e as { kind?: unknown })?.kind === 'string')
    .filter((e: { kind: string }) => KINDS.includes(e.kind))
    .slice(0, 200)

  // Telemetry must never break the test. A failure here is swallowed: the
  // report loses detail, the candidate loses nothing.
  if (attemptId && events.length) {
    try {
      await recordEvents(serviceClient(), { attemptId, events })
    } catch {
      /* intentionally ignored — see above */
    }
  }

  return ok({})
}
