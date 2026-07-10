import 'server-only'

import {
  computeListingPeerStats,
  deriveDealSuperlatives,
  normalizeStyleKey,
  type PeerStatsListing,
} from '@/lib/deal-superlatives'
import { parseLotAcres } from '@/lib/fixer-listings'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import { kindOf } from '@/lib/goldilocks'
import {
  getSyncMeta,
  listingRowId,
  publishListingsReadSnapshot,
  readListingsFromDb,
  readListingScoresByIds,
  setSyncMeta,
  tryGetReadDb,
  upsertListingSuperlatives,
} from '@/lib/listings-db'
import type { Listing } from '@/lib/rets'
import { normalizeZip, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type TownSuperlativesRebuildResult = {
  town: TmreTown
  computed: number
  ok: boolean
  error?: string
  durationMs: number
}

export type ListingSuperlativesRebuildResult = {
  startedAt: string
  finishedAt: string
  durationMs: number
  towns: TownSuperlativesRebuildResult[]
  totalComputed: number
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function cityKey(l: Listing): string {
  return `${(l.address.city || 'unknown').toLowerCase()}::${kindOf(l)}`
}

function townMedianPrices(listings: readonly Listing[]): Map<string, number> {
  const groups = new Map<string, number[]>()
  for (const listing of listings) {
    if (!listing.price || listing.price <= 0) continue
    const key = cityKey(listing)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(listing.price)
  }
  const out = new Map<string, number>()
  for (const [key, prices] of groups) {
    const m = median(prices)
    if (m != null) out.set(key, m)
  }
  return out
}

function valueDiscountPct(l: Listing, medians: Map<string, number>): number | null {
  if (!l.price) return null
  const med = medians.get(cityKey(l))
  if (!med || med <= 0) return null
  return Math.round((1 - l.price / med) * 100)
}

function parseStoredBreakdown(json: string | null | undefined): ScoreBreakdown | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as ScoreBreakdown
    if (typeof parsed?.composite !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function listingDom(listing: Listing): number | null {
  return listing.dom ?? null
}

function toPeerStatsListing(
  listing: Listing,
  score: ScoreBreakdown | null,
  lotAcres: number | null,
): PeerStatsListing {
  return {
    sqft: listing.sqft,
    lotAcres,
    yearBuilt: listing.yearBuilt,
    dom: listingDom(listing),
    price: listing.price,
    styleKey: normalizeStyleKey(listing.style),
    score: score
      ? {
          condition: score.condition,
          layoutQuality: score.layoutQuality,
          age: score.age,
          finishesQuality: score.finishesQuality,
          composite: score.composite,
        }
      : null,
  }
}

function selectPeerBucket(
  listing: Listing,
  townListings: readonly Listing[],
): Listing[] {
  const selfId = listingRowId(listing)
  const zip = normalizeZip(listing.address.postalCode)
  let peers: Listing[] = []

  if (zip) {
    peers = townListings.filter((row) => {
      const id = listingRowId(row)
      if (!id || id === selfId) return false
      return normalizeZip(row.address.postalCode) === zip
    })
  }

  if (peers.length < 5) {
    peers = townListings.filter((row) => {
      const id = listingRowId(row)
      return Boolean(id && id !== selfId)
    })
  }

  return peers
}

/**
 * Derive peer-relative superlatives for every Active listing and persist them.
 * Intended to run after Goldilocks scores are written during full sync/startup.
 */
export async function rebuildAllListingSuperlatives(): Promise<ListingSuperlativesRebuildResult> {
  const startedAt = new Date().toISOString()
  setSyncMeta('last_listing_superlatives_started', startedAt)
  const t0 = Date.now()
  const towns: TownSuperlativesRebuildResult[] = []
  let totalComputed = 0

  for (const town of TMRE_TOWNS) {
    const townT0 = Date.now()
    try {
      const active = readListingsFromDb(town, 'Active')
      if (active.length === 0) {
        towns.push({
          town,
          computed: 0,
          ok: true,
          durationMs: Date.now() - townT0,
        })
        continue
      }

      const medians = townMedianPrices(active)
      const ids = active.map((listing) => listingRowId(listing)).filter(Boolean)
      const storedScores = readListingScoresByIds(ids)
      const computedAt = new Date().toISOString()
      const rows: {
        listingId: string
        mlsId: string
        superlativesJson: string
        computedAt: string
      }[] = []

      for (const listing of active) {
        const listingId = listingRowId(listing)
        if (!listingId || !listing.mlsId) continue

        const stored = storedScores.get(listingId)
        const score = parseStoredBreakdown(stored?.breakdownJson)
        if (!score) continue

        const lotAcres = parseLotAcres(listing)
        const peers = selectPeerBucket(listing, active)
        const peerRows = peers.map((peer) => {
          const peerId = listingRowId(peer)
          const peerStored = storedScores.get(peerId)
          const peerScore = parseStoredBreakdown(peerStored?.breakdownJson)
          return toPeerStatsListing(peer, peerScore, parseLotAcres(peer))
        })

        const peerStats = computeListingPeerStats(
          toPeerStatsListing(listing, score, lotAcres),
          peerRows,
        )

        const styleKey = normalizeStyleKey(listing.style)
        const superlatives = deriveDealSuperlatives({
          score,
          listing,
          valueDiscountPct: valueDiscountPct(listing, medians),
          lotAcres,
          peerStats,
          styleKey,
          yearBuilt: listing.yearBuilt,
          sqft: listing.sqft,
        })

        rows.push({
          listingId,
          mlsId: listing.mlsId,
          superlativesJson: JSON.stringify(superlatives),
          computedAt,
        })
      }

      const updated = upsertListingSuperlatives(rows)
      totalComputed += updated
      towns.push({
        town,
        computed: updated,
        ok: true,
        durationMs: Date.now() - townT0,
      })
      console.info(
        `[listing-superlatives] ${town}: computed ${updated}/${active.length} in ${Date.now() - townT0}ms`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[listing-superlatives] ${town} failed`, err)
      towns.push({
        town,
        computed: 0,
        ok: false,
        error: message,
        durationMs: Date.now() - townT0,
      })
    }
  }

  const finishedAt = new Date().toISOString()
  if (towns.some((row) => row.ok && row.computed > 0)) {
    setSyncMeta('last_listing_superlatives', finishedAt)
    publishListingsReadSnapshot()
  }

  console.info(
    `[listing-superlatives] rebuild complete in ${Date.now() - t0}ms — ${totalComputed} listings`,
  )

  return {
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    towns,
    totalComputed,
  }
}

/** Warm superlatives when SQLite has scored listings but no cached rows yet. */
export async function rebuildAllListingSuperlativesIfMissing(): Promise<{
  totalComputed: number
  durationMs: number
  skipped?: boolean
}> {
  if (getSyncMeta('last_listing_superlatives')) {
    return { totalComputed: 0, durationMs: 0, skipped: true }
  }

  const database = tryGetReadDb()
  if (!database) {
    return { totalComputed: 0, durationMs: 0, skipped: true }
  }

  const activeCount = (
    database
      .prepare(`SELECT COUNT(*) AS count FROM listings WHERE status_bucket = 'Active'`)
      .get() as { count: number }
  ).count
  const superlativeCount = (
    database.prepare('SELECT COUNT(*) AS count FROM listing_superlatives').get() as {
      count: number
    }
  ).count

  if (activeCount === 0 || superlativeCount >= Math.max(1, Math.floor(activeCount * 0.5))) {
    return { totalComputed: 0, durationMs: 0, skipped: true }
  }

  const result = await rebuildAllListingSuperlatives()
  return { totalComputed: result.totalComputed, durationMs: result.durationMs }
}
