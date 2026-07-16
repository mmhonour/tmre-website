import { NextRequest, NextResponse } from 'next/server'
import { parseSpotlightPropertyTab } from '@/lib/spotlight-listing'
import {
  readSpotlightPrivacyOverridesFresh,
  spotlightEffectivePrivacy,
} from '@/lib/spotlight-privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tab = parseSpotlightPropertyTab(
    new URL(req.url).searchParams.get('property'),
  )
  const overrides = await readSpotlightPrivacyOverridesFresh()
  return NextResponse.json(
    {
      tab,
      privacy: spotlightEffectivePrivacy(tab, overrides),
      overrides: overrides[tab] ?? {},
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Netlify-Vary': 'query=property',
      },
    },
  )
}
