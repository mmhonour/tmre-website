import 'server-only'

import {
  addressIndexPayloadBytes,
  encodeAddressIndex,
  type AddressIndexInputRow,
} from '@/lib/address-index/encode'
import {
  ADDRESS_INDEX_CACHE_KEY,
  type AddressIndexPayload,
} from '@/lib/address-index/schema'
import { readAddressIndexSourceRows } from '@/lib/db/address-index-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { isTmreTown, resolveListingTown, TMRE_TOWNS } from '@/lib/tmre-towns'

/** Age at which GET /api/address-index kicks a background rebuild. */
export const ADDRESS_INDEX_STALE_DEFERRED_MS = 12 * 60 * 60 * 1000
/** Age at which the API waits for a rebuild before answering. */
export const ADDRESS_INDEX_STALE_BLOCKING_MS = 7 * 24 * 60 * 60 * 1000

export type AddressIndexBuildResult = {
  addresses: number
  streets: number
  bytes: number
  durationMs: number
  generatedAt: string
  skipped?: boolean
}

export type AddressIndexCacheEntry = {
  payload: AddressIndexPayload
  computedAt: string
}

export async function readAddressIndexCache(): Promise<AddressIndexCacheEntry | null> {
  const row = await readStatsCacheRow(ADDRESS_INDEX_CACHE_KEY)
  if (!row) return null
  try {
    const payload = JSON.parse(row.payload) as AddressIndexPayload
    if (!payload || typeof payload.rows !== 'string' || !Array.isArray(payload.streets)) {
      return null
    }
    return { payload, computedAt: row.computedAt }
  } catch {
    return null
  }
}

/**
 * Rebuild the browser-resident address index from the listings table.
 *
 * Netlify side-work owns this. It must never run inside the Railway RETS
 * process — that mixture is what pushed mls-sync into an out-of-memory restart
 * loop.
 */
export async function rebuildAddressIndexCache(): Promise<AddressIndexBuildResult> {
  const t0 = Date.now()
  const rows = await readAddressIndexSourceRows(TMRE_TOWNS)

  const input: AddressIndexInputRow[] = []
  for (const row of rows) {
    const town = resolveListingTown(row.town) ?? row.town.trim()
    if (!isTmreTown(town)) continue
    input.push({
      town,
      streetLine: row.street_line,
      zip: row.zip,
      mlsId: row.mls_id,
      onMarket: row.on_market === true,
      rental: row.is_rental === true,
      priceK: row.price_k,
      closeYear: row.close_year,
    })
  }

  const generatedAt = new Date().toISOString()
  const payload = encodeAddressIndex(input, generatedAt)
  const bytes = addressIndexPayloadBytes(payload)

  // A full resync wipes and refetches one town at a time, so a rebuild landing
  // mid-resync can read a partial listings table. Publishing that would strip
  // streets out of every visitor's resident copy, so hold the previous index.
  const previous = await readAddressIndexCache()
  const previousAddresses = previous?.payload.addresses ?? 0
  const collapsed =
    previousAddresses > 0 && payload.addresses < previousAddresses * 0.7
  if (payload.addresses === 0 || collapsed) {
    console.warn(
      `[address-index] skipped cache write — rebuild found ${payload.addresses} addresses while previous index had ${previousAddresses} (refresh in progress: ${getSyncMeta('refresh_in_progress') === '1'})`,
    )
    return {
      addresses: previousAddresses,
      streets: previous?.payload.streets.length ?? 0,
      bytes: 0,
      durationMs: Date.now() - t0,
      generatedAt: previous?.payload.generatedAt ?? generatedAt,
      skipped: true,
    }
  }

  await writeStatsCacheRow(ADDRESS_INDEX_CACHE_KEY, payload)
  setSyncMeta('last_address_index', generatedAt)

  const durationMs = Date.now() - t0
  console.info(
    `[address-index] built ${payload.addresses} addresses / ${payload.streets.length} streets / ${Math.round(bytes / 1024)} KB in ${durationMs}ms`,
  )

  return {
    addresses: payload.addresses,
    streets: payload.streets.length,
    bytes,
    durationMs,
    generatedAt,
  }
}

let indexWarmRunning = false

/** Fire-and-forget rebuild for a stale-but-serviceable index. */
export function rebuildAddressIndexCacheDeferred(): void {
  if (indexWarmRunning) return
  indexWarmRunning = true
  void (async () => {
    try {
      await rebuildAddressIndexCache()
    } catch (err) {
      console.error('[address-index] deferred rebuild failed', err)
    } finally {
      indexWarmRunning = false
    }
  })()
}
