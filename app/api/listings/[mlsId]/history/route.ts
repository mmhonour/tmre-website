import { NextResponse } from 'next/server'
import {
  buildCurrentListingEvents,
  summarizePriorListing,
} from '@/lib/listing-history'
import { readAddressListingsFromDb } from '@/lib/db/listings-repo'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { resolveListingTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const townHint = searchParams.get('town')?.trim() || null

  try {
    const { listing } = readListingFromDbByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const street =
      listing.address.street?.trim() || listing.address.full?.trim() || ''
    const town =
      (townHint && resolveListingTown(townHint)) ||
      resolveListingTown(listing.address.city)

    const events = buildCurrentListingEvents(listing)

    let priorListings: ReturnType<typeof summarizePriorListing>[] = []
    if (town && street) {
      priorListings = (await readAddressListingsFromDb(town, street, listing.mlsId))
        .map(summarizePriorListing)
        .sort(
          (a, b) =>
            Date.parse(b.listDate ?? '') - Date.parse(a.listDate ?? ''),
        )
    }

    return NextResponse.json({
      events,
      priorListings,
      mlsId: listing.mlsId,
      town,
    })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/history] error', err)
    return NextResponse.json({ error: 'Failed to load listing history' }, { status: 502 })
  }
}
