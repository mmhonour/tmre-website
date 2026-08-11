import { NextRequest, NextResponse } from 'next/server'
import { parseListingKindParam } from '@/lib/listing-kind'
import { parseListingPropertyClass } from '@/lib/listing-property-class'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  parseMarketPulseLookbackId,
} from '@/lib/market-pulse-lookback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * GET /api/market-pulse/closed-by-town?kind=sale&property=condos
 * GET /api/market-pulse/closed-by-town?commercial=1
 * GET /api/market-pulse/closed-by-town?kind=sale&property=all&lookback=6mo
 *
 * Default 24mo reads the stats_cache row from the rebuild. Other lookbacks
 * compute on demand (shorter windows) and cache for a few hours.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const commercialOnly = searchParams.get('commercial') === '1'
  const kind = parseListingKindParam(searchParams.get('kind'))
  const lookbackId = parseMarketPulseLookbackId(searchParams.get('lookback'))

  try {
    const { payload, cached, needsRebuild } = await readMarketPulseClosedCounts({
      kind,
      propertyClass: commercialOnly
        ? undefined
        : parseListingPropertyClass(searchParams.get('property')),
      commercialOnly,
      lookbackId,
    })
    return NextResponse.json(
      { ...payload, cached, needsRebuild: needsRebuild ?? false },
      { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } },
    )
  } catch (err) {
    console.error('[/api/market-pulse/closed-by-town]', err)
    return NextResponse.json(
      {
        months: 0,
        days: 0,
        lookbackId: DEFAULT_MARKET_PULSE_LOOKBACK_ID,
        lookbackLabel: '24 mos',
        rows: [],
        generatedAt: new Date().toISOString(),
        error: true,
      },
      { status: 200 },
    )
  }
}
