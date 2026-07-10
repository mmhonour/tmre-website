import 'server-only'

import {
  buildPropertyTaxHistorySlots,
  parcelNumberFromRaw,
  parseTaxYearEnd,
  propertyTaxFromRaw,
  type PropertyTaxYearEntry,
} from '@/lib/listing-property-tax'
import {
  isListingsDbAvailable,
  listingRowId,
  readListingTaxHistoryFromDb,
  readListingTaxMetaFromDb,
  type ListingTaxMetaRow,
} from '@/lib/listings-db'
import { readListingFromDbByMlsId } from '@/lib/listings-store'

export type ListingPropertyTaxHistory = {
  mlsId: string
  parcelNumber: string | null
  years: PropertyTaxYearEntry[]
  source: 'db'
}

function resolveFromMeta(meta: ListingTaxMetaRow): ListingPropertyTaxHistory {
  const parcelNumber = meta.parcelNumber?.trim() || null
  const anchorYearEnd = parseTaxYearEnd(meta.propertyTaxYear)
  const cached = readListingTaxHistoryFromDb(parcelNumber, meta.listingId, 10)
  const years = buildPropertyTaxHistorySlots(anchorYearEnd, cached, 5)

  return {
    mlsId: meta.mlsId,
    parcelNumber,
    years,
    source: 'db',
  }
}

/** DB-first property tax history — avoids full listing JSON parse and RETS when cached. */
export async function resolveListingPropertyTaxHistory(
  mlsId: string,
): Promise<ListingPropertyTaxHistory | null> {
  const id = mlsId.trim()
  if (!id) return null

  if (isListingsDbAvailable()) {
    const meta = readListingTaxMetaFromDb(id)
    if (meta) return resolveFromMeta(meta)
  }

  const { listing } = readListingFromDbByMlsId(id)
  if (!listing) return null

  const listingId = listingRowId(listing)
  const parcelNumber = parcelNumberFromRaw(listing.raw)
  const taxFromRaw = propertyTaxFromRaw(listing.raw)
  const anchorYearEnd =
    parseTaxYearEnd(listing.propertyTaxYear ?? taxFromRaw.yearLabel) ??
    parseTaxYearEnd(taxFromRaw.yearLabel)
  const cached = readListingTaxHistoryFromDb(parcelNumber, listingId, 10)
  const years = buildPropertyTaxHistorySlots(anchorYearEnd, cached, 5)

  return {
    mlsId: listing.mlsId,
    parcelNumber,
    years,
    source: 'db',
  }
}
