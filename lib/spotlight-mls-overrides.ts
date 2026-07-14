import 'server-only'

import { getSyncMeta as getSyncMetaFromDb } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  getSpotlightListingConfig,
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'

/**
 * Admin-managed MLS id per spotlight tab, persisted in sync_meta.
 *
 * Precedence for the effective MLS id of a tab:
 *   1. an explicit admin override (this map) — including an empty string, which
 *      means the slot was intentionally CLEARED (tab hidden on the public page);
 *   2. otherwise the hardcoded default in lib/spotlight-listing.ts.
 *
 * A tab is "visible" on the public page only when its effective id is non-empty.
 * Mirrors the durable-write / fresh-read model of lib/spotlight-privacy.ts.
 */

export const SPOTLIGHT_MLS_OVERRIDES_SYNC_KEY = 'spotlight_mls_overrides'

/** tab → MLS id. Empty string = explicitly cleared (hidden). Absent = use default. */
export type SpotlightMlsOverrides = Partial<Record<SpotlightPropertyTabId, string>>

function parseOverrides(raw: string | null): SpotlightMlsOverrides {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: SpotlightMlsOverrides = {}
    for (const tab of SPOTLIGHT_PROPERTY_TABS) {
      const value = parsed[String(tab)]
      if (typeof value === 'string') out[tab] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

/** Fast, eventually-consistent read from the in-process sync_meta cache. */
export function readSpotlightMlsOverrides(): SpotlightMlsOverrides {
  return parseOverrides(getSyncMeta(SPOTLIGHT_MLS_OVERRIDES_SYNC_KEY))
}

/** Authoritative read from Postgres so an admin change reflects on next load. */
export async function readSpotlightMlsOverridesFresh(): Promise<SpotlightMlsOverrides> {
  try {
    return parseOverrides(await getSyncMetaFromDb(SPOTLIGHT_MLS_OVERRIDES_SYNC_KEY))
  } catch {
    return readSpotlightMlsOverrides()
  }
}

/** Durable write — resolves only after the Postgres row is committed. */
export async function writeSpotlightMlsOverrides(
  overrides: SpotlightMlsOverrides,
): Promise<void> {
  await setSyncMetaDurable(
    SPOTLIGHT_MLS_OVERRIDES_SYNC_KEY,
    JSON.stringify(overrides),
  )
}

/** Effective MLS id for a tab (override wins, else config default). '' = cleared. */
export function effectiveSpotlightMlsId(
  tab: SpotlightPropertyTabId,
  overrides: SpotlightMlsOverrides = {},
): string {
  const override = overrides[tab]
  if (override !== undefined) return override.trim()
  return getSpotlightListingConfig(tab).mlsId?.trim() ?? ''
}

/** True when the tab has a listing assigned and should appear publicly. */
export function spotlightTabHasListing(
  tab: SpotlightPropertyTabId,
  overrides: SpotlightMlsOverrides = {},
): boolean {
  return effectiveSpotlightMlsId(tab, overrides).length > 0
}

/** Coerce arbitrary admin input into a clean per-tab override map. */
export function normalizeSpotlightMlsOverrides(
  input: unknown,
): SpotlightMlsOverrides {
  if (!input || typeof input !== 'object') return {}
  const body = input as Record<string, unknown>
  const out: SpotlightMlsOverrides = {}
  for (const tab of SPOTLIGHT_PROPERTY_TABS) {
    const value = body[String(tab)]
    if (typeof value === 'string') out[tab] = value.trim()
  }
  return out
}
