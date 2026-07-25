import type { Config } from '@netlify/functions'
import { queueNetlifyMarketDigest } from '../../lib/netlify-sync-trigger'
import {
  thinCronError,
  thinCronResponse,
} from '../../lib/netlify-thin-cron'

/**
 * Thin Monday market-digest trigger (NO background).
 * Queues market-digest-worker.
 *
 * Cron is 12:00 UTC Monday ≈ 08:00 America/New_York (EDT) / 07:00 (EST).
 */
export default async function handler() {
  try {
    const queued = await queueNetlifyMarketDigest()
    if (!queued.ok) {
      console.warn(`[netlify/market-digest] worker queue failed: ${queued.error}`)
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/market-digest', err)
  }
}

export const config: Config = {
  schedule: '0 12 * * 1',
}
