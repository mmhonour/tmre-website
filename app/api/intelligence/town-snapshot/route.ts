import { NextRequest, NextResponse } from 'next/server'
import { getIntelligenceTownSnapshot } from '@/lib/intelligence-town-snapshot'
import { formatTownList, isTmreTown, TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const town = (req.nextUrl.searchParams.get('town') ?? '').trim()
  if (!town) {
    return NextResponse.json({ error: 'town is required' }, { status: 400 })
  }
  if (!isTmreTown(town)) {
    return NextResponse.json(
      { error: `Unsupported town '${town}'. Supported: ${formatTownList(TMRE_TOWNS)}` },
      { status: 400 },
    )
  }

  try {
    const snapshot = await getIntelligenceTownSnapshot(town)
    if (!snapshot) {
      return NextResponse.json({ error: 'Town snapshot unavailable' }, { status: 404 })
    }
    return NextResponse.json(
      { snapshot, generatedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      },
    )
  } catch (err) {
    console.error('[/api/intelligence/town-snapshot]', err)
    return NextResponse.json({ error: 'Failed to load town snapshot' }, { status: 502 })
  }
}
