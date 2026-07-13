import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'

// ---------------------------------------------------------------------------
// Admin kill-switch for AUTOMATED syncs (Netlify cron functions, the startup
// overdue catch-up, and the long-lived Node timers). Stored in sync_meta so it
// survives redeploys and is toggleable from /admin with no code change.
//
// When paused, every SCHEDULED entry point skips its work. MANUAL admin-triggered
// syncs (the /admin "run step" buttons → /api/admin/sync) are intentionally NOT
// gated, so you can still run a full/incremental resync by hand while automation
// is paused.
// ---------------------------------------------------------------------------

export const SCHEDULED_SYNC_PAUSED_KEY = 'scheduled_sync_paused'

function truthy(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

/**
 * Synchronous read from the hydrated in-memory sync_meta cache. Correct inside
 * the Next server (instrumentation.register hydrates the cache at boot). Do NOT
 * rely on this inside the standalone Netlify cron functions — their per-invocation
 * process never hydrates the cache; use {@link isScheduledSyncPausedFresh} there.
 */
export function isScheduledSyncPaused(): boolean {
  return truthy(getSyncMeta(SCHEDULED_SYNC_PAUSED_KEY))
}

/**
 * Authoritative read straight from Postgres. Safe in any process — used by the
 * Netlify scheduled functions, whose process does not hydrate the in-memory
 * cache. Falls back to the cache only if the DB read itself fails.
 */
export async function isScheduledSyncPausedFresh(): Promise<boolean> {
  try {
    return truthy(await getSyncMetaFresh(SCHEDULED_SYNC_PAUSED_KEY))
  } catch {
    return isScheduledSyncPaused()
  }
}

/** Persist the pause flag (durable) and return the applied value. */
export async function setScheduledSyncPaused(paused: boolean): Promise<boolean> {
  await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_KEY, paused ? '1' : '0')
  return paused
}
