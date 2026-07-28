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
 * True when a listing is still the "current" market record for an address —
 * Active, Coming Soon, Under Contract / CTS, or Pending. Closed / expired /
 * withdrawn are not current (a new rental UC must win over a stale CS sale id).
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

/** DB first, then live RETS — so a UC rental in Postgres (or MLS) beats a Closed directory id. */
async function mlsIdIsCurrent(
  mlsId: string,
): Promise<{ current: boolean; status: string | null }> {
  const trimmed = mlsId.trim()
  if (!trimmed) return { current: false, status: null }

  const { listing: dbListing } = await readListingFromDbByMlsId(trimmed)
  if (listingLooksCurrent(dbListing?.status)) {
    return { current: true, status: dbListing?.status ?? null }
  }

  try {
    const live = await getListingByMlsId(trimmed)
    if (live && listingLooksCurrent(live.status)) {
      void persistListingRecord(live).catch((err) => {
        console.warn('[spotlight-mls] persist current listing skipped:', err)
      })
      return { current: true, status: live.status ?? null }
    }
    return {
      current: false,
      status: live?.status ?? dbListing?.status ?? null,
    }
  } catch (err) {
    console.warn(`[spotlight-mls] RETS check failed for ${trimmed}:`, err)
    return { current: false, status: dbListing?.status ?? null }
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
 *   1. Admin override — only while that listing is still on-market
 *   2. Current listing at the configured address (Active / CS / UC / Pending)
 *   3. Hardcoded config.mlsId when that id is still on-market (DB or RETS)
 *   4. config.mlsId / prior resolved cache as last resort
 *
 * Never cache or return a Closed/Expired id when a current listing exists —
 * that was the Day-N failure mode for 42 Treadwell (2023 sale vs 2026 UC rental).
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
      const overrideCheck = await mlsIdIsCurrent(overrideId)
      if (overrideCheck.current) {
        writeSpotlightResolvedMlsId(config.id, overrideId)
        return overrideId
      }
      console.warn(
        `[spotlight-mls] tab ${tab} override ${overrideId} is off-market` +
          ` (${overrideCheck.status ?? 'unknown'}) — re-resolving by address/config`,
      )
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
      const liveCurrent = listingLooksCurrent(resolved.listing?.status)

      // Address hit a current row (incl. Under Contract / rental) — prefer it
      // over a hardcoded id that may still say Coming Soon / Active sale.
      if (liveId && liveCurrent) {
        writeSpotlightResolvedMlsId(config.id, liveId)
        return liveId
      }

      // Address only found off-market (or nothing). Prefer config id when it is
      // still current — do not fall through to the 2023 Closed sale.
      if (fixed) {
        const fixedCheck = await mlsIdIsCurrent(fixed)
        if (fixedCheck.current) {
          writeSpotlightResolvedMlsId(config.id, fixed)
          return fixed
        }
      }

      // Refuse to pin Spotlight to a Closed/Expired directory leftover.
      if (liveId && !liveCurrent) {
        console.warn(
          `[spotlight-mls] ignoring off-market address hit ${liveId}` +
            ` (${resolved.listing?.status ?? 'unknown'}) for ${config.id}`,
        )
      }
    } catch (err) {
      console.warn('[spotlight-mls] address resolve failed — using config id', err)
    }
  }

  if (fixed) {
    const fixedCheck = await mlsIdIsCurrent(fixed)
    if (fixedCheck.current) {
      writeSpotlightResolvedMlsId(config.id, fixed)
      return fixed
    }
  }

  const cached = readSpotlightResolvedMlsId(config.id)
  if (cached && cached !== fixed) {
    const cachedCheck = await mlsIdIsCurrent(cached)
    if (cachedCheck.current) return cached
  }

  // Last resort: config id even if we could not re-verify (better than Closed).
  return fixed || cached || null
}
