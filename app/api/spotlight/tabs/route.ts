import { NextResponse } from 'next/server'
import { SPOTLIGHT_PROPERTY_TABS } from '@/lib/spotlight-listing'
import {
  readSpotlightMlsOverridesFresh,
  spotlightTabHasListing,
} from '@/lib/spotlight-mls-overrides'
import {
  orderVisibleSpotlightTabs,
  readSpotlightTabOrderFresh,
  spotlightTabOrderVersion,
} from '@/lib/spotlight-tab-order'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public: visible Spotlight property tabs in Admin display order, plus a
 * version stamp for polling (slot ids stay stable — deep links unchanged).
 */
export async function GET() {
  const [overrides, orderPayload] = await Promise.all([
    readSpotlightMlsOverridesFresh(),
    readSpotlightTabOrderFresh(),
  ])
  const assigned = SPOTLIGHT_PROPERTY_TABS.filter((tab) =>
    spotlightTabHasListing(tab, overrides),
  )
  const visibleTabs = orderVisibleSpotlightTabs(orderPayload.order, assigned)
  const version = spotlightTabOrderVersion(orderPayload)

  return NextResponse.json(
    {
      visibleTabs,
      order: orderPayload.order,
      updatedAt: orderPayload.updatedAt,
      version,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
