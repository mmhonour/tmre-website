import { NextRequest, NextResponse } from 'next/server'
import { listingCacheHeaders } from '@/lib/listings-store'
import { mergeWestportProperty } from '@/lib/westport-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ pid: string }> },
) {
  const { pid } = await ctx.params
  const visionPid = (pid ?? '').trim()
  if (!visionPid) {
    return NextResponse.json({ error: 'pid required' }, { status: 400 })
  }

  try {
    const property = await mergeWestportProperty(visionPid)
    if (!property) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }
    return NextResponse.json(
      { property, generatedAt: new Date().toISOString() },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/addresses/lookup/[pid]] error', err)
    return NextResponse.json({ error: 'Failed to load parcel' }, { status: 502 })
  }
}
