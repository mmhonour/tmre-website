import { NextResponse } from 'next/server'
import { resolveComparablesForSubject } from '@/lib/listing-comparables-resolve'
import { parseListingKindParam } from '@/lib/listing-kind'
import { listingCacheHeaders } from '@/lib/listings-store'
import { resolveSpotlightSubjectListing } from '@/lib/spotlight-subject'
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
} from '@/lib/spotlight-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = parseListingKindParam(searchParams.get('kind'))
  const propertyTab = parseSpotlightPropertyTab(searchParams.get('property'))
  const config = getSpotlightListingConfig(propertyTab)

  try {
    const subject = await resolveSpotlightSubjectListing(config)
    const payload = await resolveComparablesForSubject(subject, kind)

    return NextResponse.json(payload, {
      headers: listingCacheHeaders('db'),
    })
  } catch (err) {
    console.error('[/api/spotlight/comparables] error', err)
    return NextResponse.json(
      { error: 'Failed to load comparables' },
      { status: 502 },
    )
  }
}
