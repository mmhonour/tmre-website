import { NextRequest, NextResponse } from 'next/server'
import { readAllListingsFromDb, readListingsFromDb } from '@/lib/db/listings-repo'
import { getGoldilocksConfigFresh } from '@/lib/goldilocks-config'
import { computeActiveByDom } from '@/lib/intel-dom-bands'
import { parseListingKindParam } from '@/lib/listing-kind'
import { listingCacheHeaders } from '@/lib/listings-store'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Active inventory counts by Goldilocks DOM day-ranges (Admin → Goldilocks),
 * flattened to sequential calendar order (0–29, 30–59, …).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (town name or "All")' },
      { status: 400 },
    )
  }

  if (city !== 'All' && !isTmreTown(city)) {
    return NextResponse.json(
      { error: `Unsupported city '${city}'` },
      { status: 400 },
    )
  }

  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    const [config, active] = await Promise.all([
      getGoldilocksConfigFresh(),
      city === 'All'
        ? readAllListingsFromDb(TMRE_TOWNS, 'Active')
        : readListingsFromDb(city, 'Active', 500),
    ])
    const payload = computeActiveByDom(active, city, kind, config.domTiers)
    const generatedAt = new Date().toISOString()
    return NextResponse.json(
      { ...payload, generatedAt, source: 'db' },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/active-by-dom] error', err)
    return NextResponse.json(
      { error: 'Failed to load active inventory by DOM band' },
      { status: 502 },
    )
  }
}
