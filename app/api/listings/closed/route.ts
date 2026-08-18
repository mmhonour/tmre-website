import { NextRequest, NextResponse } from 'next/server'
import { fetchClosedListings } from '@/lib/closed-listings'
import { readClosedDailyCache } from '@/lib/closed-daily-cache'
import { defaultClosedRange } from '@/lib/closed-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dayParam(raw: string | null, fallback: string): string {
  const value = raw?.trim() ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const defaults = defaultClosedRange()
  const fromDay = dayParam(searchParams.get('from'), defaults.from)
  const toDay = dayParam(searchParams.get('to'), defaults.to)
  const town = searchParams.get('town')?.trim() || null
  const limitRaw = Number(searchParams.get('limit') ?? '30')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 30
  const includeBuckets = searchParams.get('buckets') === '1'

  try {
    const [listings, daily] = await Promise.all([
      fetchClosedListings({ fromDay, toDay, limit, town }),
      includeBuckets ? readClosedDailyCache() : Promise.resolve(null),
    ])
    return NextResponse.json(
      {
        listings,
        count: listings.length,
        from: fromDay,
        to: toDay,
        town,
        daily: includeBuckets ? daily : undefined,
        generatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[/api/listings/closed] error', err)
    return NextResponse.json(
      { error: 'Failed to load closed listings' },
      { status: 502 },
    )
  }
}
