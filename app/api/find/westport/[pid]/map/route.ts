import { NextResponse } from 'next/server'
import { loadFindParcelMap } from '@/lib/find-parcel-map'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ pid: string }> },
) {
  const { pid } = await ctx.params
  const visionPid = pid?.trim()
  if (!visionPid) {
    return NextResponse.json({ error: 'Missing parcel id' }, { status: 400 })
  }
  try {
    const payload = await loadFindParcelMap(visionPid)
    if (!payload) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.warn('[find-parcel-map]', err)
    return NextResponse.json(
      { error: 'Could not load the parcel map' },
      { status: 500 },
    )
  }
}
