import 'server-only'

import {
  rebuildListingIfEstimates,
  refreshListingIfEstimate,
  resolveListingIfPayload,
} from '@/lib/listing-if-compute'
import type { ListingIfPayload } from '@/lib/listing-if-estimates'
import { readListingFromDbByMlsId } from '@/lib/listings-store'

export {
  rebuildListingIfEstimates,
  refreshListingIfEstimate,
  resolveListingIfPayload,
} from '@/lib/listing-if-compute'

export async function fetchListingIfPayload(
  mlsId: string,
): Promise<ListingIfPayload | null> {
  const { listing } = readListingFromDbByMlsId(mlsId)
  if (!listing) return null
  return resolveListingIfPayload(listing)
}
