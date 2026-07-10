import { NextRequest, NextResponse } from 'next/server'
import {
  formatAddressLookupLabel,
  parseHumanAddressInput,
  resolveMlsIdByAddress,
  resolveMlsIdFromHumanAddress,
} from '@/lib/address-mls-resolve'
import { listingCacheHeaders } from '@/lib/listings-store'
import { isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const street = (searchParams.get('street') ?? '').trim()
  const city = (searchParams.get('city') ?? '').trim()
  const postalCode = (searchParams.get('zip') ?? searchParams.get('postalCode') ?? '').trim()
  const allowRets = searchParams.get('rets') !== '0'

  try {
    const resolved = q
      ? await resolveMlsIdFromHumanAddress(q, { cityHint: city || undefined, allowRets })
      : street && city
        ? await resolveMlsIdByAddress(
            { street, city, state: 'CT', postalCode: postalCode || undefined },
            { allowRets },
          )
        : null

    if (!resolved) {
      return NextResponse.json(
        { error: 'Provide q or street+city' },
        { status: 400 },
      )
    }

    if (resolved.address.city && !isTmreTown(resolved.address.city)) {
      return NextResponse.json(
        { error: `Unsupported city '${resolved.address.city}'` },
        { status: 400 },
      )
    }

    const parsed = q ? parseHumanAddressInput(q, { cityHint: city || undefined }) : null

    return NextResponse.json(
      {
        query: q || null,
        parsed,
        address: resolved.address,
        addressLabel: formatAddressLookupLabel(resolved.address),
        mlsId: resolved.mlsId,
        listingKey: resolved.listingKey,
        source: resolved.source,
        listing: resolved.listing
          ? {
              mlsId: resolved.listing.mlsId,
              status: resolved.listing.status,
              propertyType: resolved.listing.propertyType,
              price: resolved.listing.price,
              address: resolved.listing.address,
            }
          : null,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: listingCacheHeaders(
          resolved.source === 'rets' ? 'rets' : 'db',
        ),
      },
    )
  } catch (err) {
    console.error('[/api/addresses/resolve] error', err)
    return NextResponse.json({ error: 'Failed to resolve address' }, { status: 502 })
  }
}
