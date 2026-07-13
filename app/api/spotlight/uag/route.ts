import { NextResponse } from 'next/server'
import { resolveUagForSubject } from '@/lib/listing-uag-resolve'
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
  const propertyTab = parseSpotlightPropertyTab(searchParams.get('property'))
  const config = getSpotlightListingConfig(propertyTab)

  try {
    const subject = await resolveSpotlightSubjectListing(config)
    const payload = await resolveUagForSubject(subject)

    return NextResponse.json(payload, {
      headers: listingCacheHeaders('db'),
    })
  } catch (err) {
    console.error('[/api/spotlight/uag] error', err)
    return NextResponse.json(
      { error: 'Failed to load under-agreement comps' },
      { status: 502 },
    )
  }
}
