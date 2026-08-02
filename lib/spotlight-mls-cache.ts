import 'server-only'

import { resolveMlsIdByAddress } from '@/lib/address-mls-resolve'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import {
  persistListingRecord,
  readListingFromDbByMlsId,
} from '@/lib/listings-store'
import { isUnderContractStatus } from '@/lib/listing-status'
import { getListingByMlsId } from '@/lib/rets'
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

/**
 * True when a listing looks like an on-market record (Active / CS / UC / Pending).
 * Kept for diagnostics / logging only — Spotlight resolution does **not** filter
 * by status; Admin may pin Closed, Expired, Withdrawn, etc.
 */
export function listingLooksCurrent(status: string | null | undefined): boolean {
  const s = (status ?? '').trim()
  if (!s) return false
  const lower = s.toLowerCase()
  if (
    lower.includes('closed') ||
    lower.includes('expired') ||
    lower.includes('withdrawn') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return false
  }
  if (isUnderContractStatus(s)) return true
  return /active|coming\s*soon|pending|temp\s*off|hold/i.test(s)
}

/** Whether the MLS id already has a Postgres listings row (any status). */
async function mlsIdInDb(mlsId: string): Promise<boolean> {
  const trimmed = mlsId.trim()
  if (!trimmed) return false
  try {
    const { listing } = await readListingFromDbByMlsId(trimmed)
    return Boolean(listing)
  } catch {
    return false
  }
}

/**
 * Ensure a pinned MLS id has a listings / hot-cache row. Status is irrelevant —
 * Closed and Active are both valid Spotlight subjects.
 */
async function ensurePinnedMlsAvailable(mlsId: string): Promise<void> {
  const trimmed = mlsId.trim()
  if (!trimmed) return
  if (await mlsIdInDb(trimmed)) return

  try {
    const { ensureSpotlightListingIngested } = await import(
      '@/lib/spotlight-listing-ingest'
    )
    await ensureSpotlightListingIngested(trimmed, { warmCache: false })
  } catch (err) {
    console.warn('[spotlight-mls] one-off ingest for pin failed:', err)
    // Last try: live RETS + persist (ingest already does this; keep soft fail).
    try {
      const live = await getListingByMlsId(trimmed)
      if (live) await persistListingRecord(live)
    } catch (retsErr) {
      console.warn('[spotlight-mls] RETS pin fetch failed:', retsErr)
    }
  }
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
 *
 * Precedence:
 *   1. Admin override — always honored, **any MLS status**
 *   2. Address resolve (whatever status MLS returns)
 *   3. Hardcoded config.mlsId — any status
 *   4. Prior resolved cache
 *
 * Spotlight is a marketing pin. Do not refuse Closed / Expired / Withdrawn /
 * Cancelled — that blanked Admin-assigned slots (e.g. 99101000).
 */
export async function resolveSpotlightMlsId(
  config: SpotlightListingConfig,
): Promise<string | null> {
  const tab = spotlightTabForConfigId(config.id)
  if (tab != null) {
    const overrides = await readSpotlightMlsOverridesFresh()
    if (overrides[tab] !== undefined) {
      const overrideId = overrides[tab]!.trim() || null
      // Explicit clear → hide the tab.
      if (!overrideId) return null

      await ensurePinnedMlsAvailable(overrideId)
      writeSpotlightResolvedMlsId(config.id, overrideId)
      return overrideId
    }
  }

  const fixed = config.mlsId?.trim() || null
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
      if (liveId) {
        await ensurePinnedMlsAvailable(liveId)
        writeSpotlightResolvedMlsId(config.id, liveId)
        return liveId
      }
    } catch (err) {
      console.warn('[spotlight-mls] address resolve failed — using config id', err)
    }
  }

  if (fixed) {
    await ensurePinnedMlsAvailable(fixed)
    writeSpotlightResolvedMlsId(config.id, fixed)
    return fixed
  }

  const cached = readSpotlightResolvedMlsId(config.id)
  if (cached) {
    await ensurePinnedMlsAvailable(cached)
    return cached
  }

  return null
}
