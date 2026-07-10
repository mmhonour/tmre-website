import 'server-only'

import {
  computeAndPersistComparables,
  readCachedComparables,
} from '@/lib/listing-comparables-cache'
import type { ComparablesMatchMode } from '@/lib/listing-comparables'
import type { ComparablesResult } from '@/lib/listing-comparables-shared'
import {
  publishListingsReadSnapshot,
  readAllListingsFromDb,
  readListingEdgeScoresByMlsIds,
} from '@/lib/listings-db'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, townForZip } from '@/lib/tmre-towns'

function attachStoredEdgeScores(result: ComparablesResult): ComparablesResult {
  const mlsIds = [...result.sold, ...result.active]
    .map((c) => c.mlsId.trim())
    .filter(Boolean)
  if (mlsIds.length === 0) return result
  const stored = readListingEdgeScoresByMlsIds(mlsIds)
  if (stored.size === 0) return result

  const attach = (comps: typeof result.sold) =>
    comps.map((comp) => {
      const row = stored.get(comp.mlsId.trim())
      const score = row?.edgeScore ?? null
      return {
        ...comp,
        edgeScore: score != null && score > 0 ? score : null,
      }
    })

  return {
    ...result,
    sold: attach(result.sold),
    active: attach(result.active),
  }
}

export async function resolveComparablesForSubject(
  subject: Listing,
  kind: ComparablesMatchMode = 'sale',
): Promise<ComparablesResult & { mlsId: string; kind: ComparablesMatchMode }> {
  const cached = readCachedComparables(subject, kind)
  if (cached) {
    const withScores = attachStoredEdgeScores(cached)
    return {
      mlsId: subject.mlsId,
      kind,
      ...withScores,
    }
  }

  const townFromZip = townForZip(subject.address.postalCode)
  const towns = townFromZip ? [townFromZip] : [...TMRE_TOWNS]

  const soldPool = readAllListingsFromDb(towns, 'Closed')
  const activePool = readAllListingsFromDb(towns, 'Active')

  const result = computeAndPersistComparables(
    subject,
    kind,
    soldPool,
    activePool,
  )
  // Cold miss wrote edges to the write DB; expose them on the read snapshot.
  publishListingsReadSnapshot()

  const withScores = attachStoredEdgeScores(result)

  return {
    mlsId: subject.mlsId,
    kind,
    ...withScores,
  }
}
