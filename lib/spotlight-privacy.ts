import 'server-only'

import { getSyncMeta as getSyncMetaFromDb } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import type { SpotlightPrivacyOverrides } from '@/lib/spotlight-privacy-shared'

export * from '@/lib/spotlight-privacy-shared'

export const SPOTLIGHT_PRIVACY_SYNC_KEY = 'spotlight_privacy_overrides'

function parseOverrides(raw: string | null): SpotlightPrivacyOverrides {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as SpotlightPrivacyOverrides
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * Fast, synchronous read from the in-process sync_meta cache. Fine for
 * non-critical, eventually-consistent callers — but the cache can be stale
 * (cold serverless instance, or a dev HMR reload that resets the Map without
 * re-hydrating). Prefer {@link readSpotlightPrivacyOverridesFresh} anywhere the
 * live site must reflect an admin toggle immediately.
 */
export function readSpotlightPrivacyOverrides(): SpotlightPrivacyOverrides {
  return parseOverrides(getSyncMeta(SPOTLIGHT_PRIVACY_SYNC_KEY))
}

/**
 * Authoritative read straight from Postgres. Immune to a stale/cold in-memory
 * cache, so an admin flip of "Show address" / "Clear photos" / "Property map"
 * is reflected on the very next page load. Falls back to the cache only if the
 * DB read itself fails.
 */
export async function readSpotlightPrivacyOverridesFresh(): Promise<SpotlightPrivacyOverrides> {
  try {
    return parseOverrides(await getSyncMetaFromDb(SPOTLIGHT_PRIVACY_SYNC_KEY))
  } catch {
    return readSpotlightPrivacyOverrides()
  }
}

/**
 * Persist the overrides and resolve only after the Postgres row is committed.
 * Durable (not fire-and-forget) so the admin panel's "Saved" state reflects a
 * real DB write — the earlier fire-and-forget path swallowed write failures
 * (e.g. the Neon quota cutoff), which is why toggles appeared not to stick.
 */
export async function writeSpotlightPrivacyOverrides(
  overrides: import('@/lib/spotlight-privacy-shared').SpotlightPrivacyOverrides,
): Promise<void> {
  await setSyncMetaDurable(SPOTLIGHT_PRIVACY_SYNC_KEY, JSON.stringify(overrides))
}
