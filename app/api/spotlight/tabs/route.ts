import { NextResponse } from 'next/server'
import { SPOTLIGHT_PROPERTY_TABS } from '@/lib/spotlight-listing'
import {
  readSpotlightMlsOverridesFresh,
  spotlightTabHasListing,
} from '@/lib/spotlight-mls-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public: which spotlight property tabs have a listing assigned (are visible). */
export async function GET() {
  const overrides = await readSpotlightMlsOverridesFresh()
  const visibleTabs = SPOTLIGHT_PROPERTY_TABS.filter((tab) =>
    spotlightTabHasListing(tab, overrides),
  )
  return NextResponse.json(
    { visibleTabs },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
