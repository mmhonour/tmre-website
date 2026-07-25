import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { runIncrementalSyncListingsWork } from '../../lib/netlify-sync-listings-work'

/**
 * Background MLS incremental worker (up to ~15 minutes).
 * Invoked by the thin `sync-listings` scheduled function (or Admin "Run cron").
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
  try {
    const body = (await req.json().catch(() => null)) as { startedAt?: string } | null
    if (body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))) {
      startedAt = body.startedAt
    }
  } catch {
    /* ignore body parse */
  }

  const result = await runIncrementalSyncListingsWork(startedAt)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  background: true,
}
