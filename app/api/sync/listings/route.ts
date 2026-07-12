import { NextRequest, NextResponse } from 'next/server'
import { getSyncStatus, syncAllTownListings } from '@/lib/listings-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  const header = req.headers.get('authorization')?.trim()
  if (header === `Bearer ${secret}`) return true
  const query = req.nextUrl.searchParams.get('secret')?.trim()
  return query === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await getSyncStatus())
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAllTownListings()
    return NextResponse.json({
      ok: result.towns.every((row) => row.ok),
      ...result,
      stats: await getSyncStatus(),
    })
  } catch (err) {
    console.error('[/api/sync/listings] error', err)
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
