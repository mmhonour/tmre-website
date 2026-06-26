import { NextRequest, NextResponse } from 'next/server'
import { searchListings, type Listing } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = ['Norwalk', 'Westport'] as const
type SupportedCity = (typeof SUPPORTED_CITIES)[number]

function isSupportedCity(s: string): s is SupportedCity {
  return (SUPPORTED_CITIES as readonly string[]).includes(s)
}

function daysBetween(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function enrich(l: Listing) {
  const pricePerSqft = l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null
  const daysOnMarket =
    l.dom != null ? l.dom : daysBetween(l.listDate ?? l.modificationTimestamp)
  const priceReductionPercent =
    l.originalListPrice && l.price && l.originalListPrice > 0 && l.originalListPrice !== l.price
      ? ((l.originalListPrice - l.price) / l.originalListPrice) * 100
      : null
  return {
    ...l,
    calculated: {
      pricePerSqft,
      daysOnMarket,
      priceReductionPercent,
    },
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()
  const status = (searchParams.get('status') ?? 'Active').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 50

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (e.g. ?city=Norwalk)' },
      { status: 400 },
    )
  }
  if (!isSupportedCity(city)) {
    return NextResponse.json(
      {
        error: `Unsupported city '${city}'. Supported: ${SUPPORTED_CITIES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  try {
    const listings = await searchListings({ city, status, limit })
    return NextResponse.json({
      city,
      status,
      count: listings.length,
      listings: listings.map(enrich),
    })
  } catch (err) {
    console.error('[/api/listings] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listings from MLS' },
      { status: 502 },
    )
  }
}
