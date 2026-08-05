import { NextRequest, NextResponse } from 'next/server'
import { parseListingKindParam } from '@/lib/listing-kind'
import { parseListingPropertyClass } from '@/lib/listing-property-class'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * GET /api/market-pulse/closed-by-town?kind=sale&property=condos
 * GET /api/market-pulse/closed-by-town?commercial=1
 *
 * Reads the stats_cache rows written by the stats cache rebuild — the two-year
 * Closed aggregate never runs during a request. `needsRebuild` means the cache
 * has not been populated for this scope yet.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const commercialOnly = searchParams.get('commercial') === '1'
  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    const { payload, cached, needsRebuild } = await readMarketPulseClosedCounts({
      kind,
      propertyClass: commercialOnly
        ? undefined
        : parseListingPropertyClass(searchParams.get('property')),
      commercialOnly,
    })
    return NextResponse.json(
      { ...payload, cached, needsRebuild: needsRebuild ?? false },
      { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } },
    )
  } catch (err) {
    console.error('[/api/market-pulse/closed-by-town]', err)
    return NextResponse.json(
      { months: 0, rows: [], generatedAt: new Date().toISOString(), error: true },
      { status: 200 },
    )
  }
}
