import { NextResponse } from 'next/server'
import { loadOpenHousesPageData } from '@/lib/open-houses-page-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Remaining-week open houses. Same loader as `/open-houses` so the page is not
 * an empty client shell waiting on this route.
 */
export async function GET() {
  const result = await loadOpenHousesPageData()
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Failed to read open houses',
        detail: result.error,
        window: result.window,
      },
      { status: 502 },
    )
  }
  return NextResponse.json(result.data, {
    headers: {
      'cache-control': 'public, max-age=60, stale-while-revalidate=600',
    },
  })
}
