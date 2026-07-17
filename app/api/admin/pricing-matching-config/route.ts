import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_PRICING_MATCHING_CONFIG,
  getPricingMatchingConfigFresh,
  isDefaultPricingMatchingConfig,
  PRICING_MATCHING_FIELD_META,
  setPricingMatchingConfig,
} from '@/lib/pricing-matching-config'
import { COMPARABLES_LOOKBACK_OPTIONS } from '@/lib/listing-comparables-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const config = await getPricingMatchingConfigFresh()
  return {
    config,
    default: DEFAULT_PRICING_MATCHING_CONFIG,
    isDefault: isDefaultPricingMatchingConfig(config),
    meta: {
      fields: PRICING_MATCHING_FIELD_META,
      lookbackOptions: [...COMPARABLES_LOOKBACK_OPTIONS],
    },
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
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

  try {
    const applied = await setPricingMatchingConfig(
      (body as { config?: unknown })?.config ?? body,
    )
    return NextResponse.json({
      ok: true,
      ...(await payload()),
      config: applied,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
