import { NextRequest, NextResponse } from 'next/server'
import { parseListingKindParam } from '@/lib/listing-kind'
import { parseListingPropertyClass } from '@/lib/listing-property-class'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Two-year Closed aggregate — slower than the rest of Market Pulse. */
export const maxDuration = 26

/**
 * GET /api/market-pulse/closed-by-town?kind=sale&property=condos
 * GET /api/market-pulse/closed-by-town?commercial=1
 *
 * Fetched by the Market Pulse tabs so the page render never waits on it.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const commercialOnly = searchParams.get('commercial') === '1'
  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    const { payload, cached } = await readMarketPulseClosedCounts({
      kind,
      propertyClass: commercialOnly
        ? undefined
        : parseListingPropertyClass(searchParams.get('property')),
      commercialOnly,
    })
    return NextResponse.json(
      { ...payload, cached },
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
