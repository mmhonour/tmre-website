import type { Config } from '@netlify/functions'
import { runIncrementalSyncWatchdog } from '../../lib/incremental-sync-watchdog'

/**
 * Stale-incremental healer (every 15 minutes).
 *
 * If `last_incremental_sync` is older than ~70 minutes (or missing) and
 * Incremental is not paused, it asks the sync queue first: a claimed row means
 * a child is already pulling, so leave it alone. Otherwise it enqueues at manual
 * priority, and only falls back to sync-listings-worker (source=watchdog) when
 * the runner heartbeat is stale. Runs regardless of which clock fired last — a
 * tick alone must not leave End null while recovery is skipped.
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'
  try {
    const result = await runIncrementalSyncWatchdog()
    console.info('[netlify/sync-listings-watchdog]', result)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/sync-listings-watchdog]', err)
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  schedule: '*/15 * * * *',
}
