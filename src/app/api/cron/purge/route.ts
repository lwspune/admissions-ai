import { NextResponse, type NextRequest } from 'next/server'
import { bearerMatches } from '@/lib/bearer'
import { serviceClient } from '@/server/supabase'
import { purgeExpired } from '@/server/retention'

export const dynamic = 'force-dynamic'

/**
 * The 12-month retention purge (spec §10). Driven by Vercel Cron, which issues
 * a GET carrying `Authorization: Bearer $CRON_SECRET`.
 *
 * A GET that deletes data is only acceptable because nothing reaches the
 * deletion without the secret, and because `dryRun` exists for anyone who
 * wants to look first:
 *
 *   GET /api/cron/purge?dryRun=1
 *
 * Note `/api/cron/` is in the middleware's PUBLIC list. It has to be — a cron
 * request carries no session, so the middleware would otherwise redirect it to
 * /login and the purge would silently never run while reporting 307s nobody
 * reads. Being in that list is exactly why the check below is not optional.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Failing closed: without a configured secret this route is unguarded, and
    // an unguarded delete-everything endpoint is worse than a broken cron.
    console.error('purge: CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  try {
    const report = await purgeExpired(serviceClient(), { dryRun })
    // The cutoff and the counts are the auditable facts and they go to the
    // log. The lead ids deliberately do not: writing identifiers of records we
    // have just deleted for privacy into a third-party log, where they outlive
    // the rows they name, undoes part of what the purge is for. They stay on
    // the returned report for in-process callers such as a dry run.
    console.warn(
      `purge: cutoff=${report.cutoff} dryRun=${report.dryRun} ` +
        `leads=${report.leads} identifyAttempts=${report.identifyAttempts}`,
    )
    return NextResponse.json({
      ok: true,
      cutoff: report.cutoff,
      dryRun: report.dryRun,
      leads: report.leads,
      identifyAttempts: report.identifyAttempts,
    })
  } catch (error) {
    console.error('purge failed:', error)
    return NextResponse.json({ error: 'purge failed' }, { status: 500 })
  }
}
