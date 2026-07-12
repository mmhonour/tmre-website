import { NextResponse } from 'next/server'
import { hasListingsData } from '@/lib/db/listings-repo'
import { persistListingByMlsId } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  try {
    const result = await persistListingByMlsId(id)
    return NextResponse.json({
      found: result.found,
      cached: result.cached,
      source: result.source,
      dbAvailable: await hasListingsData(),
    })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/cache] error', err)
    return NextResponse.json({ error: 'Failed to cache listing' }, { status: 502 })
  }
}
