import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { runIncrementalSyncListingsWork } from '../../lib/netlify-sync-listings-work'

/**
 * Background MLS incremental worker (up to ~15 minutes).
 * - Admin Syncs "Incremental": full RETS + digests (source=admin)
 * - Admin "Run cron" / manual queue: full RETS + digests
 * - Thin `sync-listings` schedule: sideWorkOnly (board/stats + digests; RETS
 *   already completed in-process by the thin cron)
 * Not scheduled itself — pairing schedule+background on one function was silent.
 */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  let startedAt = new Date().toISOString()
  let sideWorkOnly = false
  let source: 'admin' | 'cron' | 'netlify-sync-trigger' | undefined
  try {
    const body = (await req.json().catch(() => null)) as {
      startedAt?: string
      sideWorkOnly?: boolean
      source?: string
    } | null
    if (body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))) {
      startedAt = body.startedAt
    }
    if (body?.sideWorkOnly === true) sideWorkOnly = true
    if (
      body?.source === 'admin' ||
      body?.source === 'cron' ||
      body?.source === 'netlify-sync-trigger'
    ) {
      source = body.source
    }
  } catch {
    /* ignore body parse */
  }

  const result = await runIncrementalSyncListingsWork(startedAt, {
    sideWorkOnly,
    source,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  background: true,
}
