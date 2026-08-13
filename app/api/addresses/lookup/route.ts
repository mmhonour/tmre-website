import { NextRequest, NextResponse } from 'next/server'
import { listingCacheHeaders } from '@/lib/listings-store'
import { searchWestportLookup } from '@/lib/westport-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const town = (searchParams.get('town') ?? 'Westport').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '12')
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 24)
    : 12

  if (town.toLowerCase() !== 'westport') {
    return NextResponse.json(
      { error: 'Lookup is Westport-only for now' },
      { status: 400 },
    )
  }

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: 'q is required (min 2 characters)' },
      { status: 400 },
    )
  }

  try {
    const addresses = await searchWestportLookup(q, limit)
    return NextResponse.json(
      {
        query: q,
        town: 'Westport',
        count: addresses.length,
        addresses,
        generatedAt: new Date().toISOString(),
      },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/addresses/lookup] error', err)
    return NextResponse.json({ error: 'Failed to search addresses' }, { status: 502 })
  }
}
