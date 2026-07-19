import { NextRequest, NextResponse } from 'next/server'
import { getZipBoundaryRings } from '@/lib/zip-boundary-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve ZCTA outer rings from Postgres (`zip_boundaries`).
 * Missing zips are fetched once from Census TIGERweb and upserted.
 *
 * GET /api/zip-boundaries?zips=06880,06840
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('zips') ?? ''
  const zips = raw
    .split(/[,\s]+/)
    .map((z) => z.trim())
    .filter((z) => /^\d{5}$/.test(z))

  if (zips.length === 0) {
    return NextResponse.json(
      { error: 'Pass ?zips=06880 or comma-separated 5-digit ZIPs' },
      { status: 400 },
    )
  }

  // Cap to keep response/size bounded (All Towns + neighbors is well under this).
  const limited = zips.slice(0, 40)
  const map = await getZipBoundaryRings(limited, { fetchMissing: true })
  const boundaries: Record<string, [number, number][][]> = {}
  for (const [zip, rings] of map) {
    boundaries[zip] = rings
  }

  return NextResponse.json(
    { boundaries },
    {
      headers: {
        // Boundaries change rarely; browsers/CDN may cache briefly. Source of
        // truth is Postgres; monthly sync refreshes rows.
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    },
  )
}
