import 'server-only'

import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { listingRowId } from '@/lib/db/listings-repo'
import { readListingsFromDb, upsertListingScores } from '@/lib/db/listings-repo'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type TownScoreRebuildResult = {
  town: TmreTown
  scored: number
  ok: boolean
  error?: string
  durationMs: number
}

export type ListingScoresRebuildResult = {
  startedAt: string
  finishedAt: string
  durationMs: number
  towns: TownScoreRebuildResult[]
  totalScored: number
}

/**
 * Re-score a subset of Active listings (e.g. after a price change) using the
 * current town peer pool, and persist the updated scores.
 */
export async function rescoreListingsByIds(
  town: TmreTown,
  listingIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return 0

  const peerPool = await readListingsFromDb(town, 'Active')
  if (peerPool.length === 0) return 0

  const idSet = new Set(ids)
  const targets = peerPool.filter((listing) => idSet.has(listingRowId(listing)))
  if (targets.length === 0) return 0

  const scored = await scoreListingsWithBoardPeers(targets, peerPool)
  const scoredAt = new Date().toISOString()
  const rows = scored
    .map((row) => {
      const id = listingRowId(row.listing)
      if (!id) return null
      return {
        id,
        score: row.score.composite,
        breakdownJson: JSON.stringify(row.score),
        scoredAt,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const updated = await upsertListingScores(rows)
  if (updated > 0) {
    setSyncMeta('last_listing_scores', scoredAt)
    console.info(
      `[listing-scores] ${town}: rescored ${updated} price-changed listing(s)`,
    )
  }
  return updated
}

/**
 * Score every Active listing for every TMRE town and persist the results on
 * the `listings` row. Intended to run as part of the daily full database reload
 * so page requests read scores from SQLite instead of recomputing on the fly.
 */
export async function rebuildAllListingScores(): Promise<ListingScoresRebuildResult> {
  const startedAt = new Date().toISOString()
  setSyncMeta('last_listing_scores_started', startedAt)
  const t0 = Date.now()
  const towns: TownScoreRebuildResult[] = []
  let totalScored = 0

  for (const town of TMRE_TOWNS) {
    const townT0 = Date.now()
    try {
      const peerPool = await readListingsFromDb(town, 'Active')
      if (peerPool.length === 0) {
        towns.push({
          town,
          scored: 0,
          ok: true,
          durationMs: Date.now() - townT0,
        })
        continue
      }

      const scored = await scoreListingsWithBoardPeers(peerPool, peerPool)
      const scoredAt = new Date().toISOString()
      const rows = scored
        .map((row) => {
          const id = listingRowId(row.listing)
          if (!id) return null
          return {
            id,
            score: row.score.composite,
            breakdownJson: JSON.stringify(row.score),
            scoredAt,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)

      const updated = await upsertListingScores(rows)
      totalScored += updated
      towns.push({
        town,
        scored: updated,
        ok: true,
        durationMs: Date.now() - townT0,
      })
      console.info(
        `[listing-scores] ${town}: scored ${updated}/${peerPool.length} in ${Date.now() - townT0}ms`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[listing-scores] ${town} failed`, err)
      towns.push({
        town,
        scored: 0,
        ok: false,
        error: message,
        durationMs: Date.now() - townT0,
      })
    }
  }

  const finishedAt = new Date().toISOString()
  if (towns.some((row) => row.ok && row.scored > 0)) {
    setSyncMeta('last_listing_scores', finishedAt)
  }

  console.info(
    `[listing-scores] rebuild complete in ${Date.now() - t0}ms — ${totalScored} listings scored`,
  )

  return {
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    towns,
    totalScored,
  }
}
