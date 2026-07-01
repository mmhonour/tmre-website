import { NextRequest, NextResponse } from 'next/server'
import {
  fetchClosedListingsAcrossTowns,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import {
  filterListingsByKind,
  parseListingKindParam,
  type ListingKind,
} from '@/lib/listing-kind'
import { classifySalePrice, PRICE_BUCKETS, type PriceBucketId } from '@/lib/price-buckets'
import { classifyRentPrice, RENT_BUCKETS, type RentBucketId } from '@/lib/rent-buckets'
import {
  closedListingTimestamp,
  closedSalePrice,
  inStatsClosedPeriod,
  listingToStatsRow,
  resolveListingTown,
  STATS_CLOSED_PERIOD_START,
  type StatsListingRow,
} from '@/lib/stats-listing-rows'
import { isTmreTown, TMRE_TOWNS } from '@/lib/tmre-towns'
import type { Listing } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRENT_YEAR = new Date().getFullYear()

function isValidBucket(kind: ListingKind, bucket: string): boolean {
  if (bucket === 'unknown') return true
  if (kind === 'rental') {
    return RENT_BUCKETS.some((b) => b.id === bucket)
  }
  return PRICE_BUCKETS.some((b) => b.id === bucket)
}

function bucketForListing(l: Listing, kind: ListingKind): PriceBucketId | RentBucketId | 'unknown' {
  const price = kind === 'sale' ? closedSalePrice(l) : l.price
  return kind === 'rental' ? classifyRentPrice(price) : classifySalePrice(price)
}

function listingInBucket(l: Listing, kind: ListingKind, bucket: string): boolean {
  if (!inStatsClosedPeriod(closedListingTimestamp(l))) return false
  return bucketForListing(l, kind) === bucket
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()
  const bucket = (searchParams.get('bucket') ?? '').trim()

  if (!city) {
    return NextResponse.json({ error: 'city is required (town name or "All")' }, { status: 400 })
  }
  if (!bucket) {
    return NextResponse.json({ error: 'bucket is required (price band id)' }, { status: 400 })
  }
  if (city !== 'All' && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  const kind: ListingKind = parseListingKindParam(searchParams.get('kind'))
  if (!isValidBucket(kind, bucket)) {
    return NextResponse.json({ error: `Unsupported bucket '${bucket}'` }, { status: 400 })
  }

  try {
    const { listings: raw, source } =
      city === 'All'
        ? await fetchClosedListingsAcrossTowns(TMRE_TOWNS, {
            limit: 2500,
          })
        : await fetchClosedListingsForCity(city, 2500)

    const listings = filterListingsByKind(raw, kind)
    const rows: StatsListingRow[] = listings
      .filter((l) => listingInBucket(l, kind, bucket))
      .map((l) => listingToStatsRow(l, resolveListingTown(l, city === 'All' ? undefined : city), kind))
      .filter((row): row is StatsListingRow => row != null)
      .sort((a, b) => {
        const aMs = a.listDate ? Date.parse(a.listDate) : 0
        const bMs = b.listDate ? Date.parse(b.listDate) : 0
        return bMs - aMs
      })

    const bucketLabel =
      bucket === 'unknown'
        ? 'Unknown price'
        : kind === 'rental'
          ? RENT_BUCKETS.find((b) => b.id === bucket)?.label ?? bucket
          : PRICE_BUCKETS.find((b) => b.id === bucket)?.label ?? bucket

    return NextResponse.json(
      {
        city,
        kind,
        bucket,
        bucketLabel,
        period: `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`,
        listings: rows,
        count: rows.length,
        source,
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/sales-by-price/listings] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listings for price band' },
      { status: 502 },
    )
  }
}
