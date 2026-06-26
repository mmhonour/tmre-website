import { NextRequest, NextResponse } from 'next/server'
import { getMarketStats } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = ['Norwalk', 'Westport'] as const

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (e.g. ?city=Norwalk)' },
      { status: 400 },
    )
  }
  if (!(SUPPORTED_CITIES as readonly string[]).includes(city)) {
    return NextResponse.json(
      {
        error: `Unsupported city '${city}'. Supported: ${SUPPORTED_CITIES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  try {
    const stats = await getMarketStats(city)
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[/api/market-stats] error', err)
    return NextResponse.json(
      { error: 'Failed to compute market stats from MLS' },
      { status: 502 },
    )
  }
}
