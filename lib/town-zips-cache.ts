import 'server-only'

import { query } from '@/lib/db/postgres'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import {
  isTmreTown,
  normalizeTownName,
  normalizeZip,
  TMRE_TOWNS,
  TOWN_ZIPS,
  townForZip,
  type TmreTown,
  zipsForTown,
} from '@/lib/tmre-towns'

/** Distinct Active/Closed postal codes per TMRE town — from Postgres, never RETS. */
export const TOWN_ZIPS_CACHE_KEY = 'town-zips:All:all'

export type TownZipsPayload = {
  towns: Record<TmreTown, string[]>
  generatedAt: string
}

function emptyTownMap(): Record<TmreTown, string[]> {
  return Object.fromEntries(TMRE_TOWNS.map((t) => [t, [] as string[]])) as Record<
    TmreTown,
    string[]
  >
}

/** Static known zips for a town (codebook fallback when cache is empty). */
export function staticTownZips(town: TmreTown): string[] {
  return [...zipsForTown(town)]
}

/**
 * Zips observed in Postgres inventory for a town, restricted to that town's
 * known zip set (never neighboring towns).
 */
export async function rebuildTownZipsCache(): Promise<{
  written: number
  durationMs: number
}> {
  const t0 = Date.now()
  const towns = emptyTownMap()

  const rows = await query<{ town: string | null; postal_code: string | null }>(
    `SELECT town, postal_code
       FROM listings
      WHERE status_bucket IN ('Active', 'Closed')
        AND postal_code IS NOT NULL
        AND btrim(postal_code) <> ''`,
  )

  const seen = new Map<TmreTown, Set<string>>()
  for (const town of TMRE_TOWNS) seen.set(town, new Set())

  for (const row of rows) {
    const zip = normalizeZip(row.postal_code)
    if (!zip) continue
    const fromZip = townForZip(zip)
    const fromCity = normalizeTownName(row.town)
    const town: TmreTown | null =
      fromZip ??
      (fromCity && isTmreTown(fromCity) ? (fromCity as TmreTown) : null)
    if (!town) continue
    // Only allow zips that belong to this town's coverage set.
    if (!TOWN_ZIPS[town].includes(zip)) continue
    seen.get(town)!.add(zip)
  }

  for (const town of TMRE_TOWNS) {
    const observed = [...(seen.get(town) ?? [])].sort()
    // Always include the static set so UI never loses a known town zip that
    // happens to have zero current inventory, but prefer observed order first.
    const merged = new Set<string>([...observed, ...TOWN_ZIPS[town]])
    towns[town] = [...merged].sort()
  }

  const payload: TownZipsPayload = {
    towns,
    generatedAt: new Date().toISOString(),
  }
  await writeStatsCacheRow(TOWN_ZIPS_CACHE_KEY, payload)
  console.info(
    `[town-zips] rebuilt ${TMRE_TOWNS.length} towns in ${Date.now() - t0}ms`,
  )
  return { written: 1, durationMs: Date.now() - t0 }
}

export async function readTownZipsPayload(): Promise<TownZipsPayload | null> {
  const row = await readStatsCacheRow(TOWN_ZIPS_CACHE_KEY)
  if (!row?.payload) return null
  try {
    const parsed = JSON.parse(row.payload) as TownZipsPayload
    if (!parsed?.towns || typeof parsed.towns !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** Cached zips for a town (Postgres-backed); falls back to static TOWN_ZIPS. */
export async function readTownZipsCached(town: TmreTown): Promise<string[]> {
  const payload = await readTownZipsPayload()
  const fromCache = payload?.towns?.[town]
  if (Array.isArray(fromCache) && fromCache.length > 0) {
    return fromCache.filter((z) => TOWN_ZIPS[town].includes(z))
  }
  return staticTownZips(town)
}

/** Resolve town from a subject zip, then return that town's cached zip list. */
export async function readTownZipsForSubjectZip(
  postal: string | null | undefined,
): Promise<{ town: TmreTown | null; zips: string[] }> {
  const town = townForZip(postal)
  if (!town) return { town: null, zips: [] }
  const zips = await readTownZipsCached(town)
  const subject = normalizeZip(postal)
  if (subject && !zips.includes(subject) && TOWN_ZIPS[town].includes(subject)) {
    return { town, zips: [...zips, subject].sort() }
  }
  return { town, zips }
}
