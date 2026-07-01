import { NextResponse } from 'next/server'
import { fetchActiveListingsAcrossTowns, listingCacheHeaders } from '@/lib/listings-store'
import { buildFixerListings } from '@/lib/fixer-listings'
import { listingInTmreCoverage, listingZipMatchesTown, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function enrich(view: ReturnType<typeof buildFixerListings>[number]) {
  const l = view.listing
  return {
    mlsId: l.mlsId,
    propertyType: l.propertyType,
    style: l.style,
    address: l.address,
    price: l.price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    dom: l.dom ?? daysBetween(l.listDate ?? l.modificationTimestamp),
    photoCount: l.photoCount,
    status: l.status,
    lotAcres: view.lotAcres,
    pricePerSqft: view.pricePerSqft,
    matchedKeywords: view.matchedKeywords,
    category: view.category,
    fixerScore: view.fixerScore,
    headline: view.headline,
  }
}

export async function GET() {
  try {
    const { listings, source } = await fetchActiveListingsAcrossTowns(TMRE_TOWNS, {
      limit: 500,
    })

    const inCoverage = listings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    )

    if (inCoverage[0]?.raw) {
      const lotCandidates = Object.keys(inCoverage[0].raw).filter((k) =>
        /lot|acre|land/i.test(k),
      )
      if (lotCandidates.length) {
        console.log('[fixer-uppers] lot-related raw fields:', lotCandidates)
      }
    }

    const fixers = buildFixerListings(inCoverage).map(enrich)

    return NextResponse.json(
      {
        listings: fixers,
        generatedAt: new Date().toISOString(),
        totalScanned: inCoverage.length,
        source,
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/fixer-uppers] error', err)
    return NextResponse.json({ error: 'Failed to fetch fixer listings' }, { status: 502 })
  }
}
