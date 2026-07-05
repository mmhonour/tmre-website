import 'server-only'

import {
  findComparableRentals,
  findComparables,
  type ComparablesMatchMode,
} from '@/lib/listing-comparables'
import { enrichComparablesWithScores } from '@/lib/listing-comparables-score'
import type { ComparablesResult } from '@/lib/listing-comparables-shared'
import { readAllListingsFromDb } from '@/lib/listings-db'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, townForZip } from '@/lib/tmre-towns'

export async function resolveComparablesForSubject(
  subject: Listing,
  kind: ComparablesMatchMode = 'sale',
): Promise<ComparablesResult & { mlsId: string; kind: ComparablesMatchMode }> {
  const townFromZip = townForZip(subject.address.postalCode)
  const towns = townFromZip ? [townFromZip] : [...TMRE_TOWNS]

  const soldPool = readAllListingsFromDb(towns, 'Closed')
  const activePool = readAllListingsFromDb(towns, 'Active')

  const result =
    kind === 'rental'
      ? findComparableRentals(subject, soldPool, activePool)
      : findComparables(subject, soldPool, activePool, kind)

  const scored = await enrichComparablesWithScores(
    subject,
    result,
    soldPool,
    activePool,
  )

  return {
    mlsId: subject.mlsId,
    kind,
    ...scored,
  }
}
