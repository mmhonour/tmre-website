import { NextResponse } from 'next/server'
import {
  buildPropertyTaxHistorySlots,
  parcelNumberFromRaw,
  parseTaxYearEnd,
  propertyTaxFromRaw,
} from '@/lib/listing-property-tax'
import { listingRowId, readListingTaxHistoryFromDb } from '@/lib/listings-db'
import { fetchListingByMlsId } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  try {
    const { listing } = await fetchListingByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const listingId = listingRowId(listing)
    const parcelNumber = parcelNumberFromRaw(listing.raw)
    const taxFromRaw = propertyTaxFromRaw(listing.raw)
    const anchorYearEnd =
      parseTaxYearEnd(listing.propertyTaxYear ?? taxFromRaw.yearLabel) ??
      parseTaxYearEnd(taxFromRaw.yearLabel)

    const cached = readListingTaxHistoryFromDb(parcelNumber, listingId, 10)
    const years = buildPropertyTaxHistorySlots(anchorYearEnd, cached, 5)

    return NextResponse.json({
      mlsId: listing.mlsId,
      parcelNumber,
      years,
    })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/property-taxes] error', err)
    return NextResponse.json(
      { error: 'Failed to load property tax history' },
      { status: 502 },
    )
  }
}
