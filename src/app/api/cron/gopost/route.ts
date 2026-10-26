import { NextResponse, type NextRequest } from 'next/server'
import { bearerMatches } from '@/lib/bearer'
import { serviceClient } from '@/server/supabase'
import { syncGopost } from '@/server/gopostSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GoPost's leads, every hour (migration 0025). Called at :45 by pg_cron
 * through pg_net, a POST carrying `Authorization: Bearer $CRON_SECRET`; Vercel
 * Hobby allows only a daily cron of its own.
 *
 * `/api/cron/` is in the middleware's PUBLIC list, so the secret is the only
 * door. A run stops between pages after 45 seconds and the next one carries on
 * from the cursor, so the first, large import can take several runs.
 *
 *   POST /api/cron/gopost?dryRun=1   counts what a run would do, writes nothing
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('gopost: CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  try {
    const result = await syncGopost(serviceClient(), { dryRun })
    // Counts only: the numbers on the sibling list stay out of a third-party log.
    console.warn(
      `gopost: dryRun=${dryRun} pages=${result.pages} leads=${result.leads} created=${result.created} ` +
        `merged=${result.merged} siblings=${result.ambiguous.length} skipped=${result.skipped} done=${result.done}`,
    )
    return NextResponse.json({
      ok: true,
      dryRun,
      pages: result.pages,
      created: result.created,
      merged: result.merged,
      siblings: result.ambiguous.length,
      skipped: result.skipped,
      done: result.done,
    })
  } catch (error) {
    console.error('gopost sync failed:', error)
    return NextResponse.json({ error: 'sync failed' }, { status: 500 })
  }
}
