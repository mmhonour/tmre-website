import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { sendMarketDigestEmail } from '../../lib/market-digest-notify'

/**
 * Monday morning market brief: months supply, inventory, calculation notes,
 * and Deal of the Week text (social graphic later).
 *
 * Cron is 12:00 UTC Monday ≈ 08:00 America/New_York (EDT) / 07:00 (EST).
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  try {
    await hydrateSyncMetaStore()
    const result = await sendMarketDigestEmail()
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/market-digest]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  schedule: '0 12 * * 1',
  background: true,
}
