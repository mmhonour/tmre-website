import { NextRequest, NextResponse } from 'next/server'
import { listingCacheHeaders } from '@/lib/listings-store'
import { readListingByIdFromDb } from '@/lib/listings-db'
import { searchListingsInDbByQuery } from '@/lib/db/listings-repo'
import { searchPropertyAddressesInDb } from '@/lib/property-address-db'
import { isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AddressSearchHit = {
  propertyKey: string
  addressFull: string
  town: string
  street: string
  zip: string | null
  parcelNumber: string | null
  mlsId: string | null
  listingId: string | null
  price: number | null
  status: string | null
  source: 'mls' | 'assessor' | 'both' | 'listing'
}

function listingPrice(listing: { price: number | null }): number | null {
  return listing.price ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const city = (searchParams.get('city') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '8')
  const resultLimit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 20)
    : 8

  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'q is required (min 2 characters)' }, { status: 400 })
  }

  if (city && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  try {
    const directoryHits = searchPropertyAddressesInDb(q, {
      limit: resultLimit,
      town: city || undefined,
    })

    const hits: AddressSearchHit[] = directoryHits.map((row) => {
      const listing = row.listingId ? readListingByIdFromDb(row.listingId) : null
      return {
        propertyKey: row.propertyKey,
        addressFull: row.addressFull,
        town: row.town,
        street: row.street,
        zip: row.zip,
        parcelNumber: row.parcelNumber,
        mlsId: row.mlsId,
        listingId: row.listingId,
        price: listing?.price ?? null,
        status: listing?.status ?? null,
        source: row.source,
      }
    })

    const seenMls = new Set(hits.map((h) => h.mlsId).filter(Boolean) as string[])
    const seenKeys = new Set(hits.map((h) => h.propertyKey))

    if (hits.length < resultLimit) {
      const listings = await searchListingsInDbByQuery(q, {
        limit: resultLimit,
        statusBuckets: ['Active', 'Closed', 'Expired'],
      })

      for (const listing of listings) {
        if (hits.length >= resultLimit) break
        if (city && listing.address.city?.trim().toLowerCase() !== city.toLowerCase()) continue
        if (seenMls.has(listing.mlsId)) continue

        const street = listing.address.street?.trim() || listing.address.full?.trim() || ''
        const propertyKey = listing.listingKey || listing.mlsId
        if (seenKeys.has(propertyKey)) continue

        seenMls.add(listing.mlsId)
        seenKeys.add(propertyKey)
        hits.push({
          propertyKey,
          addressFull:
            listing.address.full ||
            `${street}, ${listing.address.city || city}, CT ${listing.address.postalCode || ''}`.trim(),
          town: listing.address.city || city,
          street,
          zip: listing.address.postalCode?.trim().slice(0, 5) || null,
          parcelNumber: null,
          mlsId: listing.mlsId,
          listingId: listing.listingKey || listing.mlsId,
          price: listingPrice(listing),
          status: listing.status,
          source: 'listing',
        })
      }
    }

    return NextResponse.json(
      {
        query: q.toLowerCase(),
        city: city || null,
        count: hits.length,
        addresses: hits,
        generatedAt: new Date().toISOString(),
      },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/addresses/search] error', err)
    return NextResponse.json({ error: 'Failed to search addresses' }, { status: 502 })
  }
}
