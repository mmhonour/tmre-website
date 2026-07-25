import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { sendMarketDigestEmail } from '../../lib/market-digest-notify'

/**
 * Background Monday market brief email.
 * Invoked by thin `market-digest` schedule — not scheduled itself.
 */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  process.env.NETLIFY_SYNC_HANDLER = '1'

  try {
    await hydrateSyncMetaStore()
    const result = await sendMarketDigestEmail()
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/market-digest-worker]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  background: true,
}
