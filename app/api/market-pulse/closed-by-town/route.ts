import { NextRequest, NextResponse } from 'next/server'
import { parseListingKindParam } from '@/lib/listing-kind'
import { parseListingPropertyClass } from '@/lib/listing-property-class'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'
import {
  marketPulseLookbackById,
  marketPulseLookbackChartLabel,
  parseMarketPulseLookbackId,
} from '@/lib/market-pulse-lookback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** On-demand lookbacks may scan Closed rows across TMRE towns. */
export const maxDuration = 60

/**
 * GET /api/market-pulse/closed-by-town?kind=sale&property=condos
 * GET /api/market-pulse/closed-by-town?commercial=1
 * GET /api/market-pulse/closed-by-town?kind=sale&property=all&lookback=6mo
 *
 * Always allowCompute — this route is the Market Pulse lookback control.
 * Default 24mo still prefers stats_cache when fresh; cache miss computes.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const commercialOnly = searchParams.get('commercial') === '1'
  const kind = parseListingKindParam(searchParams.get('kind'))
  const lookbackId = parseMarketPulseLookbackId(searchParams.get('lookback'))

  try {
    const { payload, cached, needsRebuild } = await readMarketPulseClosedCounts(
      {
        kind,
        propertyClass: commercialOnly
          ? undefined
          : parseListingPropertyClass(searchParams.get('property')),
        commercialOnly,
        lookbackId,
      },
      { allowCompute: true },
    )
    return NextResponse.json(
      { ...payload, cached, needsRebuild: needsRebuild ?? false },
      { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } },
    )
  } catch (err) {
    console.error('[/api/market-pulse/closed-by-town]', err)
    const lookback = marketPulseLookbackById(lookbackId)
    return NextResponse.json(
      {
        months: Math.max(1, Math.round(lookback.days / 30)),
        days: lookback.days,
        lookbackId,
        lookbackLabel: marketPulseLookbackChartLabel(lookbackId),
        rows: [],
        generatedAt: new Date().toISOString(),
        error: true,
      },
      { status: 503 },
    )
  }
}
