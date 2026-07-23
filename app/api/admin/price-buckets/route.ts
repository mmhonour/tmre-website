import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_PRICE_BUCKETS_CONFIG,
  getPriceBucketsConfigFresh,
  isDefaultPriceBucketsConfig,
  setPriceBucketsConfig,
} from '@/lib/price-buckets-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const config = await getPriceBucketsConfigFresh()
  return {
    config,
    default: DEFAULT_PRICE_BUCKETS_CONFIG,
    isDefault: isDefaultPriceBucketsConfig(config),
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
    const applied = await setPriceBucketsConfig(
      (body as { config?: unknown })?.config ?? body,
    )
    return NextResponse.json({
      ok: true,
      ...(await payload()),
      config: applied,
      note: 'Rebuild Stats cache (Admin → Sync → stats cache) so Sales by price charts pick up the new bands.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
