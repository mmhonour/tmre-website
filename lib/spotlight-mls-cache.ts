import 'server-only'

import { resolveMlsIdByAddress } from '@/lib/address-mls-resolve'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import type { SpotlightListingConfig } from '@/lib/spotlight-listing'

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

export function spotlightConfigMlsId(
  config: SpotlightListingConfig,
): string | null {
  return config.mlsId?.trim() || readSpotlightResolvedMlsId(config.id) || null
}

/** DB-first address lookup for spotlight configs without a fixed MLS id. */
export async function resolveSpotlightMlsId(
  config: SpotlightListingConfig,
): Promise<string | null> {
  const fixed = spotlightConfigMlsId(config)
  if (fixed) return fixed

  const street = config.address.street.trim()
  const city = config.address.city.trim()
  if (street.length < 2 || city.length < 2) return null

  const resolved = await resolveMlsIdByAddress({
    street,
    city,
    state: config.address.state,
    postalCode: config.address.postalCode,
  })

  const mlsId = resolved.mlsId?.trim() ?? null
  if (mlsId) writeSpotlightResolvedMlsId(config.id, mlsId)
  return mlsId
}
