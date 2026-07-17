import 'server-only'

import { query } from '@/lib/db/postgres'
import type { ComparableListing } from '@/lib/listing-comparables-shared'
import { resolveListingPhotoBuffer } from '@/lib/listing-photo-store'

const EMPTY_RELATED_ID = '_none_'
const DEFAULT_CONCURRENCY = 2

export type AssociatedClosedPhotoTarget = {
  cacheId: string
  listingKey: string
  mlsId: string
  photoCount: number | null
  relation: 'comp_sold' | 'rental_sold'
  address: string
}

export type WarmAssociatedClosedPhotosOptions = {
  concurrency?: number
  /** Max distinct listings to warm (0 = no cap). */
  limit?: number
  dryRun?: boolean
  onProgress?: (info: {
    index: number
    total: number
    target: AssociatedClosedPhotoTarget
    ok: boolean
    cacheHit: boolean
  }) => void
}

export type WarmAssociatedClosedPhotosResult = {
  candidates: number
  warmed: number
  alreadyCached: number
  failed: number
  skippedNoPhoto: number
}

function parsePayload(payload: unknown): ComparableListing | null {
  try {
    const raw =
      typeof payload === 'string'
        ? payload
        : payload != null
          ? JSON.stringify(payload)
          : ''
    const parsed = JSON.parse(raw) as ComparableListing
    if (!parsed?.mlsId?.trim() && !parsed?.listingKey?.trim()) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Distinct Closed comps already linked as Sales (`comp_sold`) or Rentals
 * (`rental_sold`) edges — the associated properties shown on listing/Spotlight tabs.
 */
export async function listAssociatedClosedPhotoTargets(
  limit = 0,
): Promise<AssociatedClosedPhotoTarget[]> {
  const rows = await query<{
    related_id: string
    relation: 'comp_sold' | 'rental_sold'
    payload: unknown
  }>(
    `SELECT DISTINCT ON (related_id)
            related_id, relation, payload
       FROM listing_relations
      WHERE relation IN ('comp_sold', 'rental_sold')
        AND related_id <> $1
      ORDER BY related_id, relation ASC`,
    [EMPTY_RELATED_ID],
  )

  const targets: AssociatedClosedPhotoTarget[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const comp = parsePayload(row.payload)
    const listingKey = comp?.listingKey?.trim() || ''
    const mlsId = comp?.mlsId?.trim() || row.related_id.trim()
    const cacheId = listingKey || mlsId || row.related_id.trim()
    if (!cacheId || seen.has(cacheId)) continue
    if (comp?.photoCount === 0) continue

    seen.add(cacheId)
    targets.push({
      cacheId,
      listingKey: listingKey || mlsId,
      mlsId,
      photoCount: comp?.photoCount ?? null,
      relation: row.relation,
      address: comp?.address?.trim() || cacheId,
    })
    if (limit > 0 && targets.length >= limit) break
  }

  return targets
}

/** Warm photo index 0 into R2/SQLite for associated Closed Sales + Rentals comps. */
export async function warmAssociatedClosedPhotos(
  options: WarmAssociatedClosedPhotosOptions = {},
): Promise<WarmAssociatedClosedPhotosResult> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const targets = await listAssociatedClosedPhotoTargets(options.limit ?? 0)

  const result: WarmAssociatedClosedPhotosResult = {
    candidates: targets.length,
    warmed: 0,
    alreadyCached: 0,
    failed: 0,
    skippedNoPhoto: 0,
  }

  if (options.dryRun || targets.length === 0) return result

  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const index = cursor
      const target = targets[cursor]!
      cursor += 1

      try {
        const hit = await resolveListingPhotoBuffer({
          mlsId: target.cacheId,
          listingKey: target.listingKey,
          photoIndex: 0,
          photoCountHint: target.photoCount,
        })
        const ok = hit != null
        const cacheHit = hit?.cacheHit === true
        if (!ok) {
          result.failed += 1
        } else if (cacheHit) {
          result.alreadyCached += 1
        } else {
          result.warmed += 1
        }
        options.onProgress?.({
          index: index + 1,
          total: targets.length,
          target,
          ok,
          cacheHit,
        })
      } catch {
        result.failed += 1
        options.onProgress?.({
          index: index + 1,
          total: targets.length,
          target,
          ok: false,
          cacheHit: false,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return result
}
