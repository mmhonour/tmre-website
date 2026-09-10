import { NextRequest, NextResponse } from 'next/server'
import { findListingStreetNumberHops } from '@/lib/find-listing-street-match'
import { closedSearchWindowForSaleDate } from '@/lib/find-listing-window'
import { isRetsConfigured, searchListings, type Listing } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type HopResult = {
  label: string
  streetNumber?: string
  streetNameContains?: string
  addressContains?: string
  count: number
  hits: {
    mlsId: string
    status: string
    street: string
    streetNumber: string | null
    streetName: string | null
    unparsed: string | null
  }[]
  error?: string
}

function brief(row: Listing) {
  return {
    mlsId: row.mlsId,
    status: row.status,
    street: row.address.street || row.address.full || '',
    streetNumber: row.raw?.StreetNumber ?? null,
    streetName: row.raw?.StreetName ?? null,
    unparsed: row.raw?.UnparsedAddress ?? null,
  }
}

export async function POST(req: NextRequest) {
  let body: { street?: string; town?: string }
  try {
    body = (await req.json()) as { street?: string; town?: string }
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  }
  const street = body.street?.trim() ?? ''
  const town = body.town?.trim() || 'Westport'
  if (street.length < 4) {
    return NextResponse.json({ error: 'street required' }, { status: 400 })
  }
  if (!isRetsConfigured()) {
    return NextResponse.json({
      configured: false,
      message: 'RETS is not configured in this environment.',
    })
  }

  const window = closedSearchWindowForSaleDate('11/03/2014')
  const hops: HopResult[] = []

  const run = async (
    label: string,
    params: Parameters<typeof searchListings>[0],
    extra: Partial<HopResult> = {},
  ) => {
    try {
      const rows = await searchListings({
        county: 'fairfield',
        city: town,
        limit: 8,
        status: 'Closed',
        closedAfter: window.closedAfter,
        closedBefore: window.closedBefore,
        ...params,
      })
      hops.push({
        label,
        count: rows.length,
        hits: rows.slice(0, 4).map(brief),
        ...extra,
      })
    } catch (err) {
      hops.push({
        label,
        count: 0,
        hits: [],
        error: err instanceof Error ? err.message : String(err),
        ...extra,
      })
    }
  }

  for (const streetNumber of findListingStreetNumberHops(street)) {
    await run(`(StreetNumber=${streetNumber})`, { streetNumber }, { streetNumber })
  }

  return NextResponse.json({ configured: true, hops, window })
}
