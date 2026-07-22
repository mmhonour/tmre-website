import 'server-only'

import { resolveMlsIdByAddress } from '@/lib/address-mls-resolve'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import {
  spotlightTabForConfigId,
  type SpotlightListingConfig,
} from '@/lib/spotlight-listing'
import {
  readSpotlightMlsOverrides,
  readSpotlightMlsOverridesFresh,
} from '@/lib/spotlight-mls-overrides'

export const SPOTLIGHT_RESOLVED_MLS_SYNC_KEY = 'spotlight_resolved_mls_ids'

export type SpotlightResolvedMlsMap = Record<string, string>

export function readSpotlightResolvedMlsMap(): SpotlightResolvedMlsMap {
  const raw = getSyncMeta(SPOTLIGHT_RESOLVED_MLS_SYNC_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as SpotlightResolvedMlsMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function readSpotlightResolvedMlsId(configId: string): string | null {
  const id = configId.trim()
  if (!id) return null
  return readSpotlightResolvedMlsMap()[id]?.trim() || null
}

export function writeSpotlightResolvedMlsId(configId: string, mlsId: string): void {
  const id = configId.trim()
  const resolved = mlsId.trim()
  if (!id || !resolved) return
  const map = readSpotlightResolvedMlsMap()
  map[id] = resolved
  setSyncMeta(SPOTLIGHT_RESOLVED_MLS_SYNC_KEY, JSON.stringify(map))
}

function listingLooksOnMarket(status: string | null | undefined): boolean {
  return /active|coming\s*soon/i.test(status ?? '')
}

/**
 * @deprecated Prefer {@link resolveSpotlightMlsId}. This sync helper reads the
 * per-process sync_meta cache and can be stale across warm Lambdas. Kept only
 * for callers that cannot await; do not use for public spotlight truth.
 */
export function spotlightConfigMlsId(
  config: SpotlightListingConfig,
): string | null {
  const tab = spotlightTabForConfigId(config.id)
  if (tab != null) {
    const overrides = readSpotlightMlsOverrides()
    if (overrides[tab] !== undefined) {
      return overrides[tab]!.trim() || null
    }
  }
  return config.mlsId?.trim() || readSpotlightResolvedMlsId(config.id) || null
}

/**
 * Resolve the MLS id Spotlight should show for a property tab.
 * Admin override wins. Otherwise prefer the live on-market listing at the
 * configured address (so a prior Closed sale like 170610470 cannot stick).
 * Hardcoded config.mlsId / sync_meta cache are fallbacks only.
 */
export async function resolveSpotlightMlsId(
  config: SpotlightListingConfig,
): Promise<string | null> {
  // Admin override (fresh from Postgres) wins so changes reflect immediately;
  // an explicitly cleared slot ('') resolves to null → tab renders empty/hidden.
  const tab = spotlightTabForConfigId(config.id)
  if (tab != null) {
    const overrides = await readSpotlightMlsOverridesFresh()
    if (overrides[tab] !== undefined) {
      return overrides[tab]!.trim() || null
    }
  }

  const street = config.address.street.trim()
  const city = config.address.city.trim()
  if (street.length >= 2 && city.length >= 2) {
    try {
      const resolved = await resolveMlsIdByAddress({
        street,
        city,
        state: config.address.state,
        postalCode: config.address.postalCode,
      })
      const liveId = resolved.mlsId?.trim() ?? null
      if (liveId && listingLooksOnMarket(resolved.listing?.status)) {
        writeSpotlightResolvedMlsId(config.id, liveId)
        return liveId
      }
      // Address hit an off-market row — if config has a different fixed id that
      // is still Active in DB, prefer that over the closed sale.
      const fixed = config.mlsId?.trim() || null
      if (fixed && fixed !== liveId) {
        const { listing } = await readListingFromDbByMlsId(fixed)
        if (listingLooksOnMarket(listing?.status)) {
          writeSpotlightResolvedMlsId(config.id, fixed)
          return fixed
        }
      }
      if (liveId) {
        writeSpotlightResolvedMlsId(config.id, liveId)
        return liveId
      }
    } catch (err) {
      console.warn('[spotlight-mls] address resolve failed — using config id', err)
    }
  }

  return config.mlsId?.trim() || readSpotlightResolvedMlsId(config.id) || null
}
