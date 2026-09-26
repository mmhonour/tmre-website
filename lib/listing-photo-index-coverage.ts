import { parseScriptDbUrl } from '@/lib/script-postgres-target'

/** One query per chunk — Closed gap-scan must not open a waiter per listing. */
export const PHOTO_INDEX_COVERAGE_CHUNK = 400

export const LISTING_PHOTO_INDEX_COVERAGE_SQL = `SELECT cache_id,
              COALESCE(
                array_agg(photo_index ORDER BY photo_index)
                  FILTER (WHERE byte_length >= 100),
                ARRAY[]::int[]
              ) AS indices
         FROM listing_photo_index
        WHERE cache_id = ANY($1::text[])
        GROUP BY cache_id`

export type ListingPhotoIndexCoverageRow = {
  cache_id?: string | null
  indices?: unknown
}

export type ListingPhotoIndexCoverageQuery = (
  text: string,
  params: readonly unknown[],
) => Promise<ListingPhotoIndexCoverageRow[]>

/**
 * True when LISTING_PHOTO_INDEX_URL is a different host than DATABASE_URL.
 * The clone's listings DB is often localhost; the CLI already writes the
 * index sidecar to Neon — gap scan must read that sidecar or it re-queues
 * every complete gallery.
 */
export function listingPhotoGapScanUsesSidecarIndex(input: {
  databaseUrl?: string | null
  indexUrl?: string | null
}): boolean {
  const url = input.indexUrl?.trim() || ''
  if (!url) return false
  const dest = parseScriptDbUrl(url)
  if (!dest) return false
  const app = parseScriptDbUrl(input.databaseUrl?.trim() || '')
  return !app || dest.host !== app.host
}

export function listingPhotoIndexCoverageIds(
  cacheIds: readonly string[],
): string[] {
  return [...new Set(cacheIds.map((id) => id.trim()).filter((id) => id.length > 0))]
}

function asIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
}

export function applyListingPhotoIndexCoverageRows(
  out: Map<string, number[]>,
  rows: readonly ListingPhotoIndexCoverageRow[],
): void {
  for (const row of rows) {
    const id = row.cache_id?.trim()
    if (!id) continue
    out.set(id, asIntArray(row.indices))
  }
}

/** Indexed slots (`byte_length >= 100`) for many cache ids. */
export async function listListingPhotoIndicesForCacheIdsWithQuery(
  cacheIds: readonly string[],
  queryFn: ListingPhotoIndexCoverageQuery,
  onChunk?: (done: number, total: number) => void,
): Promise<Map<string, number[]>> {
  const ids = listingPhotoIndexCoverageIds(cacheIds)
  const out = new Map<string, number[]>()
  for (let offset = 0; offset < ids.length; offset += PHOTO_INDEX_COVERAGE_CHUNK) {
    const chunk = ids.slice(offset, offset + PHOTO_INDEX_COVERAGE_CHUNK)
    const rows = await queryFn(LISTING_PHOTO_INDEX_COVERAGE_SQL, [chunk])
    applyListingPhotoIndexCoverageRows(out, rows)
    onChunk?.(Math.min(offset + chunk.length, ids.length), ids.length)
  }
  return out
}
