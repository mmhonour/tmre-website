import 'server-only'

import { persistListingByMlsId } from '@/lib/listings-store'
import { isRetsConfigured } from '@/lib/rets'
import {
  SPOTLIGHT_PROPERTY_TABS,
  getSpotlightListingConfig,
} from '@/lib/spotlight-listing'
import { resolveSpotlightMlsId } from '@/lib/spotlight-mls-cache'

export type SpotlightStatusSyncResult = {
  ok: boolean
  refreshed: number
  failed: number
  ids: string[]
}

/** Distinct set of MLS ids currently assigned to spotlight tabs (override or config). */
export async function resolveSpotlightMlsIds(): Promise<string[]> {
  const ids = new Set<string>()
  for (const tab of SPOTLIGHT_PROPERTY_TABS) {
    const config = getSpotlightListingConfig(tab)
    try {
      const id = await resolveSpotlightMlsId(config)
      const trimmed = id?.trim()
      if (trimmed) ids.add(trimmed)
    } catch (err) {
      console.warn(`[spotlight-status-sync] resolve id failed for tab ${tab}:`, err)
    }
  }
  return [...ids]
}

/**
 * Poll RETS for the CURRENT status of only the spotlight listings and write it
 * back to Postgres. Spotlight tabs surface hand-picked listings that can move to
 * off-market states (Pending / Temp-Off-Market / Withdrawn / Closed) which the
 * Active-only incremental sync never revisits — so their Postgres row (and the
 * public status badge that reads it) would otherwise stay stale. This keeps just
 * those few listings truthful without touching the rest of the inventory.
 */
export async function refreshSpotlightStatuses(): Promise<SpotlightStatusSyncResult> {
  if (!isRetsConfigured()) {
    return { ok: false, refreshed: 0, failed: 0, ids: [] }
  }

  const ids = await resolveSpotlightMlsIds()
  let refreshed = 0
  let failed = 0

  for (const id of ids) {
    try {
      const { found, cached } = await persistListingByMlsId(id)
      if (found && cached) refreshed += 1
      else failed += 1
    } catch (err) {
      failed += 1
      console.warn(`[spotlight-status-sync] refresh failed for ${id}:`, err)
    }
  }

  console.info(
    `[spotlight-status-sync] refreshed ${refreshed}/${ids.length} spotlight listing statuses` +
      (failed ? ` (${failed} failed)` : ''),
  )
  return { ok: failed === 0, refreshed, failed, ids }
}
