import { NextRequest, NextResponse } from 'next/server'
import { parseSpotlightPropertyTab } from '@/lib/spotlight-listing'
import {
  readSpotlightPrivacyOverrides,
  spotlightEffectivePrivacy,
} from '@/lib/spotlight-privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tab = parseSpotlightPropertyTab(
    new URL(req.url).searchParams.get('property'),
  )
  const overrides = readSpotlightPrivacyOverrides()
  return NextResponse.json({
    tab,
    privacy: spotlightEffectivePrivacy(tab, overrides),
    overrides: overrides[tab] ?? {},
  })
}
