import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { ensureAdminListingPhotosReady } from '@/lib/listing-photos-db-persist'
import {
  getSpotlightListingConfig,
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'
import {
  normalizeSpotlightPrivacyOverrides,
  readSpotlightPrivacyOverridesFresh,
  spotlightEffectivePrivacy,
  writeSpotlightPrivacyOverrides,
} from '@/lib/spotlight-privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tabSummary(tab: SpotlightPropertyTabId) {
  const config = getSpotlightListingConfig(tab)
  return {
    tab,
    label: config.displayTitle,
    town: config.address.city,
    street: config.address.street,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminListingPhotosReady()

  const overrides = await readSpotlightPrivacyOverridesFresh()
  return NextResponse.json({
    overrides,
    tabs: SPOTLIGHT_PROPERTY_TABS.map((tab) => ({
      ...tabSummary(tab),
      effective: spotlightEffectivePrivacy(tab, overrides),
    })),
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  await ensureAdminListingPhotosReady()

  const overrides = normalizeSpotlightPrivacyOverrides(
    (body as { overrides?: unknown })?.overrides ?? body,
  )
  await writeSpotlightPrivacyOverrides(overrides)

  return NextResponse.json({
    ok: true,
    overrides,
    tabs: SPOTLIGHT_PROPERTY_TABS.map((tab) => ({
      ...tabSummary(tab),
      effective: spotlightEffectivePrivacy(tab, overrides),
    })),
  })
}
